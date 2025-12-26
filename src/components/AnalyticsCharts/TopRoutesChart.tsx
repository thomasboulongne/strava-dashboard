import { useMemo, useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { ChartCard } from "./ChartCard";
import chartStyles from "./ChartCard.module.css";
import { clusterByStartLocation } from "../../lib/chart-utils";
import type { Activity } from "../../lib/strava-types";

// Fix for Leaflet default marker icons in bundled apps
const fixLeafletIcons = () => {
  import("leaflet").then((L) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });
  });
};

function TopRoutesContent({
  filteredActivities,
}: {
  filteredActivities: Activity[];
}) {
  const clusters = useMemo(
    () => clusterByStartLocation(filteredActivities, 2).slice(0, 10),
    [filteredActivities]
  );

  const mapConfig = useMemo(() => {
    if (clusters.length === 0) {
      return { center: [48.8566, 2.3522] as [number, number], zoom: 5 };
    }

    const lats = clusters.map((c) => c.lat);
    const lngs = clusters.map((c) => c.lng);
    const center: [number, number] = [
      (Math.min(...lats) + Math.max(...lats)) / 2,
      (Math.min(...lngs) + Math.max(...lngs)) / 2,
    ];

    const latSpread = Math.max(...lats) - Math.min(...lats);
    const lngSpread = Math.max(...lngs) - Math.min(...lngs);
    const maxSpread = Math.max(latSpread, lngSpread);

    let zoom = 10;
    if (maxSpread > 10) zoom = 4;
    else if (maxSpread > 5) zoom = 5;
    else if (maxSpread > 2) zoom = 6;
    else if (maxSpread > 1) zoom = 7;
    else if (maxSpread > 0.5) zoom = 8;
    else if (maxSpread > 0.1) zoom = 10;
    else zoom = 12;

    return { center, zoom };
  }, [clusters]);

  const maxCount = clusters.length > 0 ? clusters[0].count : 1;
  const getRadius = (count: number) => 8 + (count / maxCount) * 20;

  if (clusters.length === 0) {
    return (
      <div className={chartStyles.emptyState}>
        No activities with location data found
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className={chartStyles.routeMap} style={{ flex: "0 0 180px" }}>
        <MapContainer
          center={mapConfig.center}
          zoom={mapConfig.zoom}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {clusters.map((cluster, index) => (
            <CircleMarker
              key={cluster.cellKey}
              center={[cluster.lat, cluster.lng]}
              radius={getRadius(cluster.count)}
              pathOptions={{
                fillColor: index === 0 ? "#f97316" : "#3b82f6",
                fillOpacity: 0.7,
                color: "#fff",
                weight: 2,
              }}
            >
              <Popup>
                <div style={{ fontSize: "0.8125rem" }}>
                  <strong>#{index + 1}</strong>
                  <br />
                  {cluster.count} activities
                  <br />
                  {cluster.totalDistanceKm.toFixed(0)} km total
                  <br />
                  {cluster.totalTimeHours.toFixed(1)} hours
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div style={{ flex: 1, overflow: "auto", marginTop: "0.75rem" }}>
        <table className={chartStyles.routeTable}>
          <thead>
            <tr>
              <th>#</th>
              <th>Activities</th>
              <th>Distance</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {clusters.slice(0, 5).map((cluster, index) => (
              <tr key={cluster.cellKey}>
                <td className={chartStyles.routeRank}>{index + 1}</td>
                <td>{cluster.count}</td>
                <td>{cluster.totalDistanceKm.toFixed(0)} km</td>
                <td>{cluster.totalTimeHours.toFixed(1)} h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface TopRoutesChartProps {
  activities: Activity[];
  isLoading?: boolean;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}

export function TopRoutesChart({
  activities,
  isLoading,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: TopRoutesChartProps) {
  useEffect(() => {
    fixLeafletIcons();
  }, []);

  return (
    <ChartCard
      title="Top Routes"
      fetchNextPage={fetchNextPage}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      description="Most frequent start locations (~1km clusters)"
      activities={activities}
      isLoading={isLoading}
      defaultTimeSpan="all"
    >
      {({ filteredActivities }) => (
        <TopRoutesContent filteredActivities={filteredActivities} />
      )}
    </ChartCard>
  );
}
