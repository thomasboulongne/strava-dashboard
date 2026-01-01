import { useState } from "react";
import type {
  Athlete,
  AthleteStats,
  ActivityTotal,
} from "../../lib/strava-types";
import styles from "./StatsOverview.module.css";

type Period = "recent" | "ytd" | "all";

interface StatsOverviewProps {
  athlete: Athlete | null;
  stats: AthleteStats | null;
  isLoading?: boolean;
}

// Format distance based on measurement preference
function formatDistance(
  meters: number,
  preference: "feet" | "meters" = "meters"
): string {
  if (preference === "feet") {
    const miles = meters / 1609.344;
    return miles >= 1000
      ? `${(miles / 1000).toFixed(1)}k mi`
      : `${miles.toFixed(1)} mi`;
  }
  const km = meters / 1000;
  return km >= 1000 ? `${(km / 1000).toFixed(1)}k km` : `${km.toFixed(1)} km`;
}

// Format elevation based on measurement preference
function formatElevation(
  meters: number,
  preference: "feet" | "meters" = "meters"
): string {
  if (preference === "feet") {
    const feet = meters * 3.28084;
    return feet >= 10000
      ? `${(feet / 1000).toFixed(1)}k ft`
      : `${Math.round(feet).toLocaleString()} ft`;
  }
  return meters >= 10000
    ? `${(meters / 1000).toFixed(1)}k m`
    : `${Math.round(meters).toLocaleString()} m`;
}

// Format time in hours and minutes
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours >= 1000) {
    return `${(hours / 1000).toFixed(1)}k hrs`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Format date as "Month Year"
function formatMemberSince(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// Get sport icon
function SportIcon({ type }: { type: "ride" | "run" | "swim" }) {
  const icons = {
    ride: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="5.5" cy="17.5" r="3.5" />
        <circle cx="18.5" cy="17.5" r="3.5" />
        <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2" />
      </svg>
    ),
    run: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="13" cy="4" r="2" />
        <path d="M7 21l3-4-2-1-3 5" />
        <path d="M16 21l-2-4-3-1 1-3 3 1 3-4 2 1-3 4 1 3-2 3" />
      </svg>
    ),
    swim: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 20c2-1 4-1 6 0s4 1 6 0 4-1 6 0" />
        <path d="M2 17c2-1 4-1 6 0s4 1 6 0 4-1 6 0" />
        <circle cx="9" cy="8" r="2" />
        <path d="M15 8l-2 2-2-2" />
        <path d="M9 11v3" />
      </svg>
    ),
  };
  return <span className={styles.sportIcon}>{icons[type]}</span>;
}

// Skeleton component for loading state
function StatCardSkeleton() {
  return (
    <div className={`${styles.statCard} ${styles.skeleton}`}>
      <div className={styles.skeletonLabel} />
      <div className={styles.skeletonValue} />
    </div>
  );
}

function ActivityRowSkeleton() {
  return (
    <div className={`${styles.activityRow} ${styles.skeleton}`}>
      <div className={styles.skeletonIcon} />
      <div className={styles.skeletonStats}>
        <div className={styles.skeletonStat} />
        <div className={styles.skeletonStat} />
        <div className={styles.skeletonStat} />
        <div className={styles.skeletonStat} />
      </div>
    </div>
  );
}

export function StatsOverview({
  athlete,
  stats,
  isLoading = false,
}: StatsOverviewProps) {
  const [period, setPeriod] = useState<Period>("ytd");

  const measurementPref = athlete?.measurement_preference ?? "meters";

  if (isLoading) {
    return (
      <div className={styles.container}>
        {/* Profile skeleton */}
        <div className={`${styles.profileCard} ${styles.skeleton}`}>
          <div className={styles.skeletonAvatar} />
          <div className={styles.skeletonProfileInfo}>
            <div className={styles.skeletonName} />
            <div className={styles.skeletonLocation} />
          </div>
        </div>

        {/* Highlight stats skeleton */}
        <div className={styles.highlightGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>

        {/* Activity breakdown skeleton */}
        <div className={styles.breakdownSection}>
          <div className={styles.breakdownHeader}>
            <div className={styles.skeletonLabel} style={{ width: "120px" }} />
          </div>
          <div className={styles.activityList}>
            {Array.from({ length: 3 }).map((_, i) => (
              <ActivityRowSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!athlete || !stats) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <p>No stats available yet. Start tracking your activities!</p>
        </div>
      </div>
    );
  }

  // Calculate totals for highlights
  const allTimeDistance =
    stats.all_ride_totals.distance +
    stats.all_run_totals.distance +
    stats.all_swim_totals.distance;

  const allTimeTime =
    stats.all_ride_totals.moving_time +
    stats.all_run_totals.moving_time +
    stats.all_swim_totals.moving_time;

  // Get stats for selected period
  const getPeriodStats = (type: "ride" | "run" | "swim"): ActivityTotal => {
    const key = `${period}_${type}_totals` as keyof AthleteStats;
    return stats[key] as ActivityTotal;
  };

  const rideStats = getPeriodStats("ride");
  const runStats = getPeriodStats("run");
  const swimStats = getPeriodStats("swim");

  const periodLabels: Record<Period, string> = {
    recent: "Last 4 Weeks",
    ytd: "Year to Date",
    all: "All Time",
  };

  // Check which sports have activity
  const hasRides = stats.all_ride_totals.count > 0;
  const hasRuns = stats.all_run_totals.count > 0;
  const hasSwims = stats.all_swim_totals.count > 0;

  return (
    <div className={styles.container}>
      {/* Athlete Profile Header */}
      <div className={styles.profileCard}>
        <img
          src={athlete.profile}
          alt={`${athlete.firstname} ${athlete.lastname}`}
          className={styles.avatar}
        />
        <div className={styles.profileInfo}>
          <div className={styles.nameRow}>
            <h3 className={styles.name}>
              {athlete.firstname} {athlete.lastname}
            </h3>
            {(athlete.premium || athlete.summit) && (
              <span className={styles.badge}>
                {athlete.summit ? "Summit" : "Premium"}
              </span>
            )}
          </div>
          <div className={styles.profileMeta}>
            {athlete.city && (
              <span className={styles.location}>
                {[athlete.city, athlete.state, athlete.country]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            )}
            <span className={styles.memberSince}>
              Member since {formatMemberSince(athlete.created_at)}
            </span>
          </div>
        </div>
        {athlete.ftp && (
          <div className={styles.ftpBadge}>
            <span className={styles.ftpLabel}>FTP</span>
            <span className={styles.ftpValue}>{athlete.ftp}w</span>
          </div>
        )}
      </div>

      {/* Highlight Stats Grid */}
      <div className={styles.highlightGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Distance</span>
          <span className={styles.statValue}>
            {formatDistance(allTimeDistance, measurementPref)}
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Longest Ride</span>
          <span className={styles.statValue}>
            {stats.biggest_ride_distance
              ? formatDistance(stats.biggest_ride_distance, measurementPref)
              : "—"}
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Most Climbing</span>
          <span className={styles.statValue}>
            {stats.biggest_climb_elevation_gain
              ? formatElevation(
                  stats.biggest_climb_elevation_gain,
                  measurementPref
                )
              : "—"}
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Time</span>
          <span className={styles.statValue}>{formatTime(allTimeTime)}</span>
        </div>
      </div>

      {/* Activity Breakdown by Period */}
      <div className={styles.breakdownSection}>
        <div className={styles.breakdownHeader}>
          <h4 className={styles.breakdownTitle}>Activity Breakdown</h4>
          <div className={styles.periodToggle}>
            {(["recent", "ytd", "all"] as Period[]).map((p) => (
              <button
                key={p}
                className={`${styles.periodBtn} ${
                  period === p ? styles.periodBtnActive : ""
                }`}
                onClick={() => setPeriod(p)}
              >
                {p === "recent" ? "4W" : p === "ytd" ? "YTD" : "All"}
              </button>
            ))}
          </div>
        </div>

        <p className={styles.periodLabel}>{periodLabels[period]}</p>

        <div className={styles.activityList}>
          {hasRides && (
            <div className={styles.activityRow}>
              <div className={styles.activityType}>
                <SportIcon type="ride" />
                <span>Cycling</span>
              </div>
              <div className={styles.activityStats}>
                <div className={styles.activityStat}>
                  <span className={styles.activityStatValue}>
                    {rideStats.count}
                  </span>
                  <span className={styles.activityStatLabel}>rides</span>
                </div>
                <div className={styles.activityStat}>
                  <span className={styles.activityStatValue}>
                    {formatDistance(rideStats.distance, measurementPref)}
                  </span>
                  <span className={styles.activityStatLabel}>distance</span>
                </div>
                <div className={styles.activityStat}>
                  <span className={styles.activityStatValue}>
                    {formatTime(rideStats.moving_time)}
                  </span>
                  <span className={styles.activityStatLabel}>time</span>
                </div>
                <div className={styles.activityStat}>
                  <span className={styles.activityStatValue}>
                    {formatElevation(rideStats.elevation_gain, measurementPref)}
                  </span>
                  <span className={styles.activityStatLabel}>elevation</span>
                </div>
              </div>
            </div>
          )}

          {hasRuns && (
            <div className={styles.activityRow}>
              <div className={styles.activityType}>
                <SportIcon type="run" />
                <span>Running</span>
              </div>
              <div className={styles.activityStats}>
                <div className={styles.activityStat}>
                  <span className={styles.activityStatValue}>
                    {runStats.count}
                  </span>
                  <span className={styles.activityStatLabel}>runs</span>
                </div>
                <div className={styles.activityStat}>
                  <span className={styles.activityStatValue}>
                    {formatDistance(runStats.distance, measurementPref)}
                  </span>
                  <span className={styles.activityStatLabel}>distance</span>
                </div>
                <div className={styles.activityStat}>
                  <span className={styles.activityStatValue}>
                    {formatTime(runStats.moving_time)}
                  </span>
                  <span className={styles.activityStatLabel}>time</span>
                </div>
                <div className={styles.activityStat}>
                  <span className={styles.activityStatValue}>
                    {formatElevation(runStats.elevation_gain, measurementPref)}
                  </span>
                  <span className={styles.activityStatLabel}>elevation</span>
                </div>
              </div>
            </div>
          )}

          {hasSwims && (
            <div className={styles.activityRow}>
              <div className={styles.activityType}>
                <SportIcon type="swim" />
                <span>Swimming</span>
              </div>
              <div className={styles.activityStats}>
                <div className={styles.activityStat}>
                  <span className={styles.activityStatValue}>
                    {swimStats.count}
                  </span>
                  <span className={styles.activityStatLabel}>swims</span>
                </div>
                <div className={styles.activityStat}>
                  <span className={styles.activityStatValue}>
                    {formatDistance(swimStats.distance, measurementPref)}
                  </span>
                  <span className={styles.activityStatLabel}>distance</span>
                </div>
                <div className={styles.activityStat}>
                  <span className={styles.activityStatValue}>
                    {formatTime(swimStats.moving_time)}
                  </span>
                  <span className={styles.activityStatLabel}>time</span>
                </div>
                <div className={styles.activityStat}>
                  <span className={styles.activityStatValue}>—</span>
                  <span className={styles.activityStatLabel}>elevation</span>
                </div>
              </div>
            </div>
          )}

          {!hasRides && !hasRuns && !hasSwims && (
            <div className={styles.emptyPeriod}>
              <p>No activities recorded for this period.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
