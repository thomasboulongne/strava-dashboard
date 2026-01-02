import { useState } from "react";
import {
  PiPersonSimpleBike,
  PiPersonSimpleRun,
  PiSwimmingPool,
} from "react-icons/pi";
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

function formatDistance(meters: number): string {
  const km = meters / 1000;
  return km >= 1000 ? `${(km / 1000).toFixed(1)}k` : km.toFixed(0);
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  if (hours >= 100) {
    return `${hours}h`;
  }
  const mins = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function formatElevation(meters: number): string {
  if (meters >= 100000) {
    return `${(meters / 1000).toFixed(0)}k`;
  }
  return meters.toFixed(0);
}

function formatCount(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count.toString();
}

function getPeriodLabel(period: Period): string {
  switch (period) {
    case "recent":
      return "Last 4 weeks";
    case "ytd":
      return "Year to date";
    case "all":
      return "All time";
  }
}

function ActivityRow({
  type,
  icon,
  totals,
}: {
  type: string;
  icon: React.ReactNode;
  totals: ActivityTotal;
}) {
  if (totals.count === 0) return null;

  return (
    <div className={styles.activityRow}>
      <div className={styles.activityType}>
        <span className={styles.sportIcon}>{icon}</span>
        {type}
      </div>
      <div className={styles.activityStats}>
        <div className={styles.activityStat}>
          <span className={styles.activityStatValue}>
            {formatCount(totals.count)}
          </span>
          <span className={styles.activityStatLabel}>Activities</span>
        </div>
        <div className={styles.activityStat}>
          <span className={styles.activityStatValue}>
            {formatDistance(totals.distance)} km
          </span>
          <span className={styles.activityStatLabel}>Distance</span>
        </div>
        <div className={styles.activityStat}>
          <span className={styles.activityStatValue}>
            {formatDuration(totals.moving_time)}
          </span>
          <span className={styles.activityStatLabel}>Time</span>
        </div>
        <div className={styles.activityStat}>
          <span className={styles.activityStatValue}>
            {formatElevation(totals.elevation_gain)} m
          </span>
          <span className={styles.activityStatLabel}>Elevation</span>
        </div>
      </div>
    </div>
  );
}

export function StatsOverview({
  athlete,
  stats,
  isLoading,
}: StatsOverviewProps) {
  const [period, setPeriod] = useState<Period>("recent");

  if (isLoading) {
    return (
      <div className={styles.container}>
        {/* Profile Card Skeleton */}
        <div className={styles.profileCard}>
          <div className={`${styles.skeletonAvatar} ${styles.skeleton}`} />
          <div className={styles.skeletonProfileInfo}>
            <div className={`${styles.skeletonName} ${styles.skeleton}`} />
            <div className={`${styles.skeletonLocation} ${styles.skeleton}`} />
          </div>
        </div>

        {/* Highlight Stats Skeleton */}
        <div className={styles.highlightGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.statCard}>
              <div className={`${styles.skeletonLabel} ${styles.skeleton}`} />
              <div className={`${styles.skeletonValue} ${styles.skeleton}`} />
            </div>
          ))}
        </div>

        {/* Breakdown Skeleton */}
        <div className={styles.breakdownSection}>
          <div className={styles.activityList}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={styles.activityRow}>
                <div className={styles.activityType}>
                  <div
                    className={`${styles.skeletonIcon} ${styles.skeleton}`}
                  />
                </div>
                <div className={styles.skeletonStats}>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div
                      key={j}
                      className={`${styles.skeletonStat} ${styles.skeleton}`}
                    />
                  ))}
                </div>
              </div>
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
          No stats available. Sync your activities to see your stats.
        </div>
      </div>
    );
  }

  // Get totals based on selected period
  const getTotals = (sport: "ride" | "run" | "swim"): ActivityTotal => {
    switch (period) {
      case "recent":
        return stats[`recent_${sport}_totals`];
      case "ytd":
        return stats[`ytd_${sport}_totals`];
      case "all":
        return stats[`all_${sport}_totals`];
    }
  };

  const rideTotals = getTotals("ride");
  const runTotals = getTotals("run");
  const swimTotals = getTotals("swim");

  // Calculate highlight stats (all time)
  const totalActivities =
    stats.all_ride_totals.count +
    stats.all_run_totals.count +
    stats.all_swim_totals.count;
  const totalDistance =
    stats.all_ride_totals.distance +
    stats.all_run_totals.distance +
    stats.all_swim_totals.distance;
  const totalTime =
    stats.all_ride_totals.moving_time +
    stats.all_run_totals.moving_time +
    stats.all_swim_totals.moving_time;
  const totalElevation =
    stats.all_ride_totals.elevation_gain +
    stats.all_run_totals.elevation_gain +
    stats.all_swim_totals.elevation_gain;

  // Format location
  const location = [athlete.city, athlete.state, athlete.country]
    .filter(Boolean)
    .join(", ");

  // Format member since
  const memberSince = new Date(athlete.created_at).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

  return (
    <div className={styles.container}>
      {/* Profile Card */}
      <div className={styles.profileCard}>
        <img
          src={athlete.profile}
          alt={`${athlete.firstname} ${athlete.lastname}`}
          className={styles.avatar}
        />
        <div className={styles.profileInfo}>
          <div className={styles.nameRow}>
            <h2 className={styles.name}>
              {athlete.firstname} {athlete.lastname}
            </h2>
            {athlete.summit && <span className={styles.badge}>Summit</span>}
          </div>
          <div className={styles.profileMeta}>
            {location && <span className={styles.location}>{location}</span>}
            <span className={styles.memberSince}>
              Member since {memberSince}
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

      {/* Highlight Stats */}
      <div className={styles.highlightGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Activities</span>
          <span className={styles.statValue}>
            {formatCount(totalActivities)}
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Distance</span>
          <span className={styles.statValue}>
            {formatDistance(totalDistance)} km
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Time</span>
          <span className={styles.statValue}>{formatDuration(totalTime)}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Elevation</span>
          <span className={styles.statValue}>
            {formatElevation(totalElevation)} m
          </span>
        </div>
      </div>

      {/* Activity Breakdown */}
      <div className={styles.breakdownSection}>
        <div className={styles.breakdownHeader}>
          <h3 className={styles.breakdownTitle}>Activity Breakdown</h3>
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
        <p className={styles.periodLabel}>{getPeriodLabel(period)}</p>

        <div className={styles.activityList}>
          <ActivityRow
            type="Rides"
            icon={<PiPersonSimpleBike />}
            totals={rideTotals}
          />
          <ActivityRow
            type="Runs"
            icon={<PiPersonSimpleRun />}
            totals={runTotals}
          />
          <ActivityRow
            type="Swims"
            icon={<PiSwimmingPool />}
            totals={swimTotals}
          />

          {rideTotals.count === 0 &&
            runTotals.count === 0 &&
            swimTotals.count === 0 && (
              <div className={styles.emptyPeriod}>
                No activities for this period
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
