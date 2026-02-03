import { useState } from "react";
import {
  Container,
  Flex,
  Text,
  Box,
  Button,
  Skeleton,
  Dialog,
  TextArea,
  Tooltip,
} from "@radix-ui/themes";
import {
  FiChevronLeft,
  FiChevronRight,
  FiPlus,
  FiTrash2,
  FiLink,
  FiX,
  FiInfo,
  FiFileText,
  FiEdit2,
} from "react-icons/fi";
import {
  useTrainingPlan,
  useImportPlan,
  useLinkActivity,
  useUnlinkActivity,
  useDeletePlan,
  useUpdateWorkout,
  getWeekStart,
  getNextWeek,
  getPreviousWeek,
  formatWeekRange,
  parseLocalDate,
  formatLocalDate,
  formatDbDate,
} from "../hooks/useTrainingPlan";
import type {
  TrainingWorkoutWithMatch,
  UnmatchedActivity,
  Activity,
  IntervalCompliance,
} from "../lib/strava-types";
import styles from "./TrainingPlan.module.css";

// Day names for calendar header
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Format duration from minutes to H:MM
 */
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

/**
 * Format activity duration from seconds
 */
function formatActivityDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Get compliance color based on score
 */
function getComplianceColor(score: number): string {
  if (score >= 80) return "var(--green-9)";
  if (score >= 60) return "var(--yellow-9)";
  return "var(--red-9)";
}

/**
 * Format duration for tooltip display (minutes to H:MM)
 */
function formatDurationForTooltip(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m}min`;
}

/**
 * Generate markdown report for the week
 */
function generateWeeklyReport(
  weekStart: string,
  weekName: string,
  notes: string,
  workouts: TrainingWorkoutWithMatch[],
): string {
  const summary = calculateWeeklySummary(workouts);
  const weekRange = formatWeekRange(weekStart);
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let markdown = `# ${weekName}\n\n`;
  markdown += `**Week:** ${weekRange}\n\n`;
  markdown += `**Generated:** ${currentDate}\n\n`;
  markdown += `---\n\n`;

  // Personal notes
  if (notes.trim()) {
    markdown += `## Notes\n\n${notes}\n\n`;
  }

  // Total saddle time
  markdown += `## Weekly Summary\n\n`;
  markdown += `**Total Saddle Time:** ${formatActivityDuration(summary.totalSaddleTime)}\n\n`;

  // Long ride
  if (summary.longestRide) {
    const activity = summary.longestRide.activity;
    markdown += `## Long Ride\n\n`;
    markdown += `**Activity:** ${activity.name}\n\n`;
    markdown += `- **Duration:** ${formatActivityDuration(activity.moving_time)}\n`;
    if (activity.perceived_exertion) {
      markdown += `**RPE:** ${activity.perceived_exertion}\n\n`;
    }
    if (activity.average_heartrate) {
      markdown += `- **Average HR:** ${Math.round(activity.average_heartrate)} bpm\n`;
    }
    if (activity.weighted_average_watts || activity.average_watts) {
      markdown += `- **Average Power:** ${Math.round(activity.weighted_average_watts || activity.average_watts || 0)}W\n`;
    }
    markdown += `- **Location:** ${activity.trainer ? "Indoor" : "Outdoor"}\n`;
    if (activity.distance && !activity.trainer) {
      markdown += `- **Distance:** ${(activity.distance / 1000).toFixed(2)} km\n`;
    }
    markdown += `\n`;
  }

  // Interval sessions
  if (summary.intervalSessions.length > 0) {
    markdown += `## Interval Sessions\n\n`;
    summary.intervalSessions.forEach(({ workout, activity, intervals }) => {
      markdown += `### ${workout.session_name}\n\n`;
      markdown += `**Duration:** ${formatActivityDuration(activity.moving_time)}\n\n`;
      if (activity.perceived_exertion) {
        markdown += `**RPE:** ${activity.perceived_exertion}\n\n`;
      }
      markdown += `**Intervals:**\n\n`;
      markdown += `| # | Duration | Avg HR | Avg Power |\n`;
      markdown += `|---|----------|--------|----------|\n`;
      intervals.intervals
        .filter((interval) => interval.status !== "missing")
        .forEach((interval) => {
          const duration = `${Math.floor(interval.durationSec / 60)}:${String(Math.round(interval.durationSec % 60)).padStart(2, "0")}`;
          const power = interval.avgPower ? `${interval.avgPower}W` : "—";
          markdown += `| ${interval.index} | ${duration} | ${interval.avgHR} bpm | ${power} |\n`;
        });
      markdown += `\n`;
    });
  }

  // All workouts summary
  markdown += `## All Workouts\n\n`;
  markdown += `| Date | Workout | Duration | Location |\n`;
  markdown += `|------|---------|----------|----------|\n`;

  const weekDates = getWeekDates(weekStart);
  const workoutsByDate = new Map<string, TrainingWorkoutWithMatch>();
  workouts.forEach((w) => {
    const dateStr = formatDbDate(w.workout_date);
    workoutsByDate.set(dateStr, w);
  });

  weekDates.forEach((date) => {
    const dateStr = formatLocalDate(date);
    const workout = workoutsByDate.get(dateStr);
    const dayName = DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1];
    const dateDisplay = `${dayName} ${date.getDate()}`;

    if (workout) {
      const activity = workout.matched_activity?.data as Activity | undefined;
      const duration = activity
        ? formatActivityDuration(activity.moving_time)
        : "—";
      markdown += `| ${dateDisplay} | ${workout.session_name} | ${duration} | ${activity?.trainer ? "Indoor" : "Outdoor"} |\n`;
    } else {
      markdown += `| ${dateDisplay} | Rest | — | — |\n`;
    }
  });

  return markdown;
}

/**
 * Download text as a file
 */
function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface WeeklySummary {
  totalSaddleTime: number;
  longestRide: {
    workout: TrainingWorkoutWithMatch;
    activity: Activity;
  } | null;
  intervalSessions: Array<{
    workout: TrainingWorkoutWithMatch;
    activity: Activity;
    intervals: IntervalCompliance;
  }>;
}

/**
 * Calculate weekly summary metrics
 */
function calculateWeeklySummary(
  workouts: TrainingWorkoutWithMatch[],
): WeeklySummary {
  // Filter workouts with matched activities
  const completedWorkouts = workouts.filter((w) => w.matched_activity);

  // Calculate total saddle time (in seconds)
  const totalSaddleTime = completedWorkouts.reduce((total, workout) => {
    const activity = workout.matched_activity?.data as Activity | undefined;
    return total + (activity?.moving_time || 0);
  }, 0);

  // Find longest ride
  let longestRide: {
    workout: TrainingWorkoutWithMatch;
    activity: Activity;
  } | null = null;

  completedWorkouts.forEach((workout) => {
    const activity = workout.matched_activity?.data as Activity | undefined;
    if (activity) {
      if (
        !longestRide ||
        activity.moving_time > longestRide.activity.moving_time
      ) {
        longestRide = { workout, activity };
      }
    }
  });

  // Find interval sessions
  const intervalSessions: Array<{
    workout: TrainingWorkoutWithMatch;
    activity: Activity;
    intervals: IntervalCompliance;
  }> = [];

  completedWorkouts.forEach((workout) => {
    if (workout.compliance?.breakdown?.intervals) {
      const activity = workout.matched_activity?.data as Activity | undefined;
      if (activity) {
        intervalSessions.push({
          workout,
          activity,
          intervals: workout.compliance.breakdown.intervals,
        });
      }
    }
  });

  return {
    totalSaddleTime,
    longestRide,
    intervalSessions,
  };
}

interface WeeklySummaryProps {
  workouts: TrainingWorkoutWithMatch[];
}

function WeeklySummary({ workouts }: WeeklySummaryProps) {
  const summary = calculateWeeklySummary(workouts);

  if (workouts.length === 0) {
    return null;
  }

  return (
    <div className={styles.weeklySummary}>
      <h3 className={styles.summaryTitle}>Week Summary</h3>

      {/* Total Saddle Time */}
      <div className={styles.summarySection}>
        <div className={styles.summaryLabel}>Total Saddle Time</div>
        <div className={styles.summaryValue}>
          {formatActivityDuration(summary.totalSaddleTime)}
        </div>
      </div>

      {/* Long Ride */}
      {summary.longestRide && (
        <div className={styles.summarySection}>
          <div className={styles.summaryLabel}>Long Ride of the Week</div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryCardHeader}>
              {summary.longestRide.activity.name}
            </div>
            <div className={styles.summaryMetrics}>
              <div className={styles.summaryMetric}>
                <span className={styles.metricLabel}>Duration:</span>
                <span className={styles.metricValue}>
                  {formatActivityDuration(
                    summary.longestRide.activity.moving_time,
                  )}
                </span>
              </div>
              {summary.longestRide.activity.average_heartrate && (
                <div className={styles.summaryMetric}>
                  <span className={styles.metricLabel}>Avg HR:</span>
                  <span className={styles.metricValue}>
                    {Math.round(summary.longestRide.activity.average_heartrate)}{" "}
                    bpm
                  </span>
                </div>
              )}
              {(summary.longestRide.activity.weighted_average_watts ||
                summary.longestRide.activity.average_watts) && (
                <div className={styles.summaryMetric}>
                  <span className={styles.metricLabel}>Avg Power:</span>
                  <span className={styles.metricValue}>
                    {Math.round(
                      summary.longestRide.activity.weighted_average_watts ||
                        summary.longestRide.activity.average_watts ||
                        0,
                    )}
                    W
                  </span>
                </div>
              )}
              <div className={styles.summaryMetric}>
                <span className={styles.metricLabel}>Location:</span>
                <span className={styles.metricValue}>
                  {summary.longestRide.activity.trainer ? "Indoor" : "Outdoor"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interval Sessions */}
      {summary.intervalSessions.length > 0 && (
        <div className={styles.summarySection}>
          <div className={styles.summaryLabel}>Interval Sessions</div>
          {summary.intervalSessions.map(({ workout, activity, intervals }) => (
            <div key={workout.id} className={styles.summaryCard}>
              <div className={styles.summaryCardHeader}>
                {workout.session_name}
              </div>
              <div className={styles.summaryCardSubheader}>
                {activity.name} · {formatActivityDuration(activity.moving_time)}
              </div>
              <div className={styles.intervalsList}>
                {intervals.intervals
                  .filter((interval) => interval.status !== "missing")
                  .map((interval, idx) => (
                    <div
                      key={`${workout.id}-${idx}`}
                      className={styles.intervalSummaryItem}
                    >
                      <span className={styles.intervalNumber}>
                        #{interval.index}
                      </span>
                      <div className={styles.intervalMetrics}>
                        <span>
                          {Math.floor(interval.durationSec / 60)}:
                          {String(
                            Math.round(interval.durationSec % 60),
                          ).padStart(2, "0")}
                        </span>
                        <span>{interval.avgHR} bpm</span>
                        {interval.avgPower && <span>{interval.avgPower}W</span>}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Get dates for the week starting on weekStart (Monday)
 */
function getWeekDates(weekStart: string): Date[] {
  const dates: Date[] = [];
  const start = parseLocalDate(weekStart);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }
  return dates;
}

interface DayCellProps {
  date: Date;
  workout: TrainingWorkoutWithMatch | null;
  unmatchedActivities: UnmatchedActivity[];
  onLinkActivity: (workoutId: number, activityId: number) => void;
  onUnlinkActivity: (workoutId: number) => void;
  onEditWorkout: (workout: TrainingWorkoutWithMatch) => void;
  isLinking: boolean;
  isUnlinking: boolean;
}

function DayCell({
  date,
  workout,
  unmatchedActivities,
  onLinkActivity,
  onUnlinkActivity,
  onEditWorkout,
  isLinking,
  isUnlinking,
}: DayCellProps) {
  const [showLinkMenu, setShowLinkMenu] = useState(false);
  const [showComplianceDetails, setShowComplianceDetails] = useState(false);
  const isToday = new Date().toDateString() === date.toDateString();
  const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));

  // Get activities available for linking on this day
  const dateStr = formatLocalDate(date);
  const availableActivities = unmatchedActivities.filter((a) => {
    const activityDate = (a.data as Activity).start_date_local?.split("T")[0];
    return activityDate === dateStr;
  });

  const matchedActivity = workout?.matched_activity?.data as
    | Activity
    | undefined;

  return (
    <div
      className={`${styles.dayCell} ${isToday ? styles.today : ""} ${
        isPast && !workout ? styles.pastEmpty : ""
      }`}
    >
      <div className={styles.dayHeader}>
        <span className={styles.dayName}>
          {DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1]}
        </span>
        <span className={styles.dayNumber}>{date.getDate()}</span>
      </div>

      {workout ? (
        <div className={styles.workoutContent}>
          <div className={styles.plannedWorkout}>
            <div className={styles.sessionNameRow}>
              <div className={styles.sessionName}>{workout.session_name}</div>
              <button
                className={styles.editBtn}
                onClick={() => onEditWorkout(workout)}
                title="Edit workout"
              >
                <FiEdit2 size={14} />
              </button>
            </div>
            {workout.duration_target_minutes && (
              <div className={styles.workoutMeta}>
                {formatDuration(workout.duration_target_minutes)}
                {workout.intensity_target && ` @ ${workout.intensity_target}`}
              </div>
            )}
            {workout.notes && (
              <div className={styles.workoutNotes}>"{workout.notes}"</div>
            )}
          </div>

          {matchedActivity ? (
            <div className={styles.matchedActivity}>
              <div className={styles.activityHeader}>
                <span className={styles.activityName}>
                  {matchedActivity.name}
                </span>
                <button
                  className={styles.unlinkBtn}
                  onClick={() => onUnlinkActivity(workout.id)}
                  disabled={isUnlinking}
                  title="Unlink activity"
                >
                  <FiX size={14} />
                </button>
              </div>
              <div className={styles.activityMeta}>
                {formatActivityDuration(matchedActivity.moving_time)}
                {matchedActivity.average_heartrate && (
                  <span>
                    {" "}
                    · {Math.round(matchedActivity.average_heartrate)} bpm
                  </span>
                )}
                {(matchedActivity.weighted_average_watts ||
                  matchedActivity.average_watts) && (
                  <span>
                    {" "}
                    ·{" "}
                    {Math.round(
                      matchedActivity.weighted_average_watts ||
                        matchedActivity.average_watts ||
                        0,
                    )}
                    W
                  </span>
                )}
              </div>
              {workout.is_manually_linked && (
                <div className={styles.manualBadge}>Manually linked</div>
              )}
            </div>
          ) : availableActivities.length > 0 ? (
            <div className={styles.linkSection}>
              <button
                className={styles.linkBtn}
                onClick={() => setShowLinkMenu(!showLinkMenu)}
                disabled={isLinking}
              >
                <FiLink size={14} />
                Link Activity
              </button>
              {showLinkMenu && (
                <div className={styles.linkMenu}>
                  {availableActivities.map((a) => {
                    const activity = a.data as Activity;
                    return (
                      <button
                        key={a.id}
                        className={styles.linkMenuItem}
                        onClick={() => {
                          onLinkActivity(workout.id, a.id);
                          setShowLinkMenu(false);
                        }}
                      >
                        <span>{activity.name}</span>
                        <span className={styles.linkMenuMeta}>
                          {formatActivityDuration(activity.moving_time)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className={styles.noActivity}>No activity recorded</div>
          )}

          {workout.compliance && workout.matched_activity && (
            <div className={styles.complianceSection}>
              {/* Desktop version with tooltip */}
              <div className={styles.complianceDesktop}>
                <div className={styles.complianceBar}>
                  <div className={styles.complianceLabel}>
                    <span>Compliance: {workout.compliance.score}%</span>
                    <Tooltip
                      content={
                        <div className={styles.complianceTooltip}>
                          <div className={styles.tooltipTitle}>
                            Compliance Breakdown
                          </div>

                          {/* Duration Section */}
                          <div className={styles.tooltipSection}>
                            <div className={styles.tooltipSectionHeader}>
                              <span>Duration</span>
                              <span
                                style={{
                                  color:
                                    workout.compliance.breakdown.duration !==
                                    null
                                      ? getComplianceColor(
                                          workout.compliance.breakdown.duration,
                                        )
                                      : "var(--gray-9)",
                                }}
                              >
                                {workout.compliance.breakdown.duration !== null
                                  ? `${workout.compliance.breakdown.duration}%`
                                  : "N/A"}
                              </span>
                            </div>
                            {workout.duration_target_minutes &&
                            matchedActivity ? (
                              <div className={styles.tooltipDetails}>
                                <div>
                                  <span className={styles.tooltipLabel}>
                                    Actual:
                                  </span>{" "}
                                  {formatDurationForTooltip(
                                    matchedActivity.moving_time / 60,
                                  )}
                                </div>
                                <div>
                                  <span className={styles.tooltipLabel}>
                                    Target:
                                  </span>{" "}
                                  {formatDurationForTooltip(
                                    workout.duration_target_minutes,
                                  )}
                                </div>
                                {workout.compliance.breakdown.durationRatio !==
                                  null && (
                                  <div
                                    className={styles.tooltipDirection}
                                    style={{
                                      color:
                                        workout.compliance.breakdown
                                          .durationRatio >= 0.8 &&
                                        workout.compliance.breakdown
                                          .durationRatio <= 1.2
                                          ? "var(--green-9)"
                                          : workout.compliance.breakdown
                                                .durationRatio < 0.8
                                            ? "var(--blue-9)"
                                            : "var(--red-9)",
                                    }}
                                  >
                                    {workout.compliance.breakdown
                                      .durationRatio >= 0.8 &&
                                      workout.compliance.breakdown
                                        .durationRatio <= 1.2 &&
                                      "✓ On target"}
                                    {workout.compliance.breakdown
                                      .durationRatio < 0.8 &&
                                      `↓ Too short (${Math.round(
                                        workout.compliance.breakdown
                                          .durationRatio * 100,
                                      )}%)`}
                                    {workout.compliance.breakdown
                                      .durationRatio > 1.2 &&
                                      `↑ Too long (${Math.round(
                                        workout.compliance.breakdown
                                          .durationRatio * 100,
                                      )}%)`}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className={styles.tooltipDetails}>
                                <span className={styles.tooltipMuted}>
                                  No duration target set
                                </span>
                              </div>
                            )}
                          </div>

                          {/* HR Zone Section - hidden when intervals are present */}
                          {!workout.compliance.breakdown.intervals && (
                            <div className={styles.tooltipSection}>
                              <div className={styles.tooltipSectionHeader}>
                                <span>Heart Rate</span>
                                <span
                                  style={{
                                    color:
                                      workout.compliance.breakdown.hrZone !==
                                      null
                                        ? getComplianceColor(
                                            workout.compliance.breakdown.hrZone,
                                          )
                                        : "var(--gray-9)",
                                  }}
                                >
                                  {workout.compliance.breakdown.hrZone !== null
                                    ? `${workout.compliance.breakdown.hrZone}%`
                                    : "N/A"}
                                </span>
                              </div>
                              {workout.compliance.breakdown.hrDetails ? (
                                <div className={styles.tooltipDetails}>
                                  <div>
                                    <span className={styles.tooltipLabel}>
                                      Actual avg:
                                    </span>{" "}
                                    {
                                      workout.compliance.breakdown.hrDetails
                                        .actualAvg
                                    }{" "}
                                    bpm
                                  </div>
                                  <div>
                                    <span className={styles.tooltipLabel}>
                                      Target:
                                    </span>{" "}
                                    {workout.compliance.breakdown.hrDetails
                                      .targetZone > 0
                                      ? `Zone ${workout.compliance.breakdown.hrDetails.targetZone} (${workout.compliance.breakdown.hrDetails.targetMin}-${workout.compliance.breakdown.hrDetails.targetMax} bpm)`
                                      : `${workout.compliance.breakdown.hrDetails.targetMin}-${workout.compliance.breakdown.hrDetails.targetMax} bpm`}
                                  </div>
                                  <div
                                    className={styles.tooltipDirection}
                                    style={{
                                      color:
                                        workout.compliance.breakdown.hrDetails
                                          .direction === "on_target"
                                          ? "var(--green-9)"
                                          : workout.compliance.breakdown
                                                .hrDetails.direction ===
                                              "too_low"
                                            ? "var(--blue-9)"
                                            : "var(--red-9)",
                                    }}
                                  >
                                    {workout.compliance.breakdown.hrDetails
                                      .direction === "on_target" &&
                                      "✓ On target"}
                                    {workout.compliance.breakdown.hrDetails
                                      .direction === "too_low" && "↓ Too low"}
                                    {workout.compliance.breakdown.hrDetails
                                      .direction === "too_high" && "↑ Too high"}
                                    {workout.compliance.breakdown.hrDetails
                                      .direction !== "on_target" && (
                                      <span
                                        className={styles.tooltipDirectionDiff}
                                      >
                                        {" "}
                                        (
                                        {workout.compliance.breakdown.hrDetails
                                          .direction === "too_low"
                                          ? `-${
                                              workout.compliance.breakdown
                                                .hrDetails.targetMin -
                                              workout.compliance.breakdown
                                                .hrDetails.actualAvg
                                            }`
                                          : `+${
                                              workout.compliance.breakdown
                                                .hrDetails.actualAvg -
                                              workout.compliance.breakdown
                                                .hrDetails.targetMax
                                            }`}{" "}
                                        bpm)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : matchedActivity?.average_heartrate ? (
                                <div className={styles.tooltipDetails}>
                                  <div>
                                    <span className={styles.tooltipLabel}>
                                      Actual avg:
                                    </span>{" "}
                                    {Math.round(
                                      matchedActivity.average_heartrate,
                                    )}{" "}
                                    bpm
                                  </div>
                                  {workout.intensity_target ? (
                                    <div>
                                      <span className={styles.tooltipMuted}>
                                        Could not map "
                                        {workout.intensity_target}" to HR zone
                                      </span>
                                    </div>
                                  ) : (
                                    <div>
                                      <span className={styles.tooltipMuted}>
                                        No intensity target set
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className={styles.tooltipDetails}>
                                  <span className={styles.tooltipMuted}>
                                    No HR data recorded
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Power Zone Section - hidden when intervals are present */}
                          {!workout.compliance.breakdown.intervals && (
                            <div className={styles.tooltipSection}>
                              <div className={styles.tooltipSectionHeader}>
                                <span>Power</span>
                                <span
                                  style={{
                                    color:
                                      workout.compliance.breakdown.powerZone !==
                                      null
                                        ? getComplianceColor(
                                            workout.compliance.breakdown
                                              .powerZone,
                                          )
                                        : "var(--gray-9)",
                                  }}
                                >
                                  {workout.compliance.breakdown.powerZone !==
                                  null
                                    ? `${workout.compliance.breakdown.powerZone}%`
                                    : "N/A"}
                                </span>
                              </div>
                              {workout.compliance.breakdown.powerDetails ? (
                                <div className={styles.tooltipDetails}>
                                  <div>
                                    <span className={styles.tooltipLabel}>
                                      Actual avg:
                                    </span>{" "}
                                    {
                                      workout.compliance.breakdown.powerDetails
                                        .actualAvg
                                    }
                                    W
                                  </div>
                                  <div>
                                    <span className={styles.tooltipLabel}>
                                      Target:
                                    </span>{" "}
                                    {workout.compliance.breakdown.powerDetails
                                      .targetZone > 0
                                      ? `Zone ${workout.compliance.breakdown.powerDetails.targetZone} (${workout.compliance.breakdown.powerDetails.targetMin}-${workout.compliance.breakdown.powerDetails.targetMax}W)`
                                      : `${workout.compliance.breakdown.powerDetails.targetMin}-${workout.compliance.breakdown.powerDetails.targetMax}W`}
                                  </div>
                                  <div
                                    className={styles.tooltipDirection}
                                    style={{
                                      color:
                                        workout.compliance.breakdown
                                          .powerDetails.direction ===
                                        "on_target"
                                          ? "var(--green-9)"
                                          : workout.compliance.breakdown
                                                .powerDetails.direction ===
                                              "too_low"
                                            ? "var(--blue-9)"
                                            : "var(--red-9)",
                                    }}
                                  >
                                    {workout.compliance.breakdown.powerDetails
                                      .direction === "on_target" &&
                                      "✓ On target"}
                                    {workout.compliance.breakdown.powerDetails
                                      .direction === "too_low" && "↓ Too low"}
                                    {workout.compliance.breakdown.powerDetails
                                      .direction === "too_high" && "↑ Too high"}
                                    {workout.compliance.breakdown.powerDetails
                                      .direction !== "on_target" && (
                                      <span
                                        className={styles.tooltipDirectionDiff}
                                      >
                                        {" "}
                                        (
                                        {workout.compliance.breakdown
                                          .powerDetails.direction === "too_low"
                                          ? `-${
                                              workout.compliance.breakdown
                                                .powerDetails.targetMin -
                                              workout.compliance.breakdown
                                                .powerDetails.actualAvg
                                            }`
                                          : `+${
                                              workout.compliance.breakdown
                                                .powerDetails.actualAvg -
                                              workout.compliance.breakdown
                                                .powerDetails.targetMax
                                            }`}
                                        W)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : matchedActivity?.weighted_average_watts ||
                                matchedActivity?.average_watts ? (
                                <div className={styles.tooltipDetails}>
                                  <div>
                                    <span className={styles.tooltipLabel}>
                                      Actual avg:
                                    </span>{" "}
                                    {Math.round(
                                      matchedActivity.weighted_average_watts ||
                                        matchedActivity.average_watts ||
                                        0,
                                    )}
                                    W
                                  </div>
                                  {workout.intensity_target ? (
                                    <div>
                                      <span className={styles.tooltipMuted}>
                                        Could not map "
                                        {workout.intensity_target}" to power
                                        zone
                                      </span>
                                    </div>
                                  ) : (
                                    <div>
                                      <span className={styles.tooltipMuted}>
                                        No intensity target set
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className={styles.tooltipDetails}>
                                  <span className={styles.tooltipMuted}>
                                    No power data recorded
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Intervals Section */}
                          {workout.compliance.breakdown.intervals && (
                            <div className={styles.tooltipSection}>
                              <div className={styles.tooltipSectionHeader}>
                                <span>Intervals</span>
                                <span
                                  style={{
                                    color: getComplianceColor(
                                      workout.compliance.breakdown.intervals
                                        .score,
                                    ),
                                  }}
                                >
                                  {
                                    workout.compliance.breakdown.intervals
                                      .completed
                                  }
                                  /
                                  {
                                    workout.compliance.breakdown.intervals
                                      .expected
                                  }{" "}
                                  (
                                  {workout.compliance.breakdown.intervals.score}
                                  %)
                                </span>
                              </div>
                              <div className={styles.tooltipDetails}>
                                <div>
                                  <span className={styles.tooltipLabel}>
                                    Target:
                                  </span>{" "}
                                  {
                                    workout.compliance.breakdown.intervals
                                      .expected
                                  }
                                  x
                                  {Math.round(
                                    workout.compliance.breakdown.intervals
                                      .targetDurationSec / 60,
                                  )}
                                  min @ Zone{" "}
                                  {
                                    workout.compliance.breakdown.intervals
                                      .targetZone
                                  }
                                </div>
                                {workout.compliance.breakdown.intervals
                                  .source && (
                                  <div
                                    className={styles.tooltipMuted}
                                    style={{
                                      fontSize: "0.85em",
                                      marginTop: "2px",
                                    }}
                                  >
                                    {workout.compliance.breakdown.intervals
                                      .source === "laps"
                                      ? "✓ Detected from activity laps"
                                      : workout.compliance.breakdown.intervals
                                            .source === "power_detection"
                                        ? "✓ Detected from power data"
                                        : "✓ Detected from heart rate"}
                                  </div>
                                )}
                                <div className={styles.intervalList}>
                                  {workout.compliance.breakdown.intervals.intervals.map(
                                    (interval) => (
                                      <div
                                        key={interval.index}
                                        className={styles.intervalItem}
                                      >
                                        <span className={styles.intervalIndex}>
                                          #{interval.index}
                                        </span>
                                        {interval.status === "missing" ? (
                                          <span
                                            className={styles.intervalMissing}
                                          >
                                            Missing
                                          </span>
                                        ) : (
                                          <>
                                            <span
                                              className={
                                                styles.intervalDuration
                                              }
                                            >
                                              {Math.floor(
                                                interval.durationSec / 60,
                                              )}
                                              :
                                              {String(
                                                Math.round(
                                                  interval.durationSec % 60,
                                                ),
                                              ).padStart(2, "0")}
                                            </span>
                                            <span className={styles.intervalHR}>
                                              {interval.avgHR} bpm
                                              {interval.avgPower &&
                                                ` · ${interval.avgPower}W`}
                                            </span>
                                            <span
                                              className={styles.intervalStatus}
                                              style={{
                                                color:
                                                  interval.status ===
                                                  "completed"
                                                    ? "var(--green-9)"
                                                    : interval.status ===
                                                        "wrong_zone"
                                                      ? "var(--red-9)"
                                                      : "var(--yellow-9)",
                                              }}
                                            >
                                              {interval.status ===
                                                "completed" && "✓"}
                                              {interval.status ===
                                                "too_short" && "↓"}
                                              {interval.status === "too_long" &&
                                                "↑"}
                                              {interval.status ===
                                                "wrong_zone" && "Z"}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Scoring explanation */}
                          <div className={styles.tooltipFooter}>
                            <div>
                              <span style={{ color: "var(--green-9)" }}>
                                ≥80%
                              </span>{" "}
                              On target
                            </div>
                            <div>
                              <span style={{ color: "var(--yellow-9)" }}>
                                60-79%
                              </span>{" "}
                              Close
                            </div>
                            <div>
                              <span style={{ color: "var(--red-9)" }}>
                                &lt;60%
                              </span>{" "}
                              Off target
                            </div>
                          </div>
                        </div>
                      }
                    >
                      <span className={styles.complianceInfo}>
                        <FiInfo size={12} />
                      </span>
                    </Tooltip>
                  </div>
                  <div className={styles.complianceTrack}>
                    <div
                      className={styles.complianceFill}
                      style={{
                        width: `${workout.compliance.score}%`,
                        backgroundColor: getComplianceColor(
                          workout.compliance.score,
                        ),
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Mobile version with accordion */}
              <div className={styles.complianceMobile}>
                <div
                  className={styles.complianceBar}
                  onClick={() =>
                    setShowComplianceDetails(!showComplianceDetails)
                  }
                  style={{ cursor: "pointer" }}
                >
                  <div className={styles.complianceLabel}>
                    <span>Compliance: {workout.compliance.score}%</span>
                    <span className={styles.complianceInfo}>
                      <FiInfo size={12} />
                    </span>
                  </div>
                  <div className={styles.complianceTrack}>
                    <div
                      className={styles.complianceFill}
                      style={{
                        width: `${workout.compliance.score}%`,
                        backgroundColor: getComplianceColor(
                          workout.compliance.score,
                        ),
                      }}
                    />
                  </div>
                </div>

                {showComplianceDetails && (
                  <div className={styles.complianceDetails}>
                    <div className={styles.tooltipTitle}>
                      Compliance Breakdown
                    </div>

                    {/* Duration Section */}
                    <div className={styles.tooltipSection}>
                      <div className={styles.tooltipSectionHeader}>
                        <span>Duration</span>
                        <span
                          style={{
                            color:
                              workout.compliance.breakdown.duration !== null
                                ? getComplianceColor(
                                    workout.compliance.breakdown.duration,
                                  )
                                : "var(--gray-9)",
                          }}
                        >
                          {workout.compliance.breakdown.duration !== null
                            ? `${workout.compliance.breakdown.duration}%`
                            : "N/A"}
                        </span>
                      </div>
                      {workout.duration_target_minutes && matchedActivity ? (
                        <div className={styles.tooltipDetails}>
                          <div>
                            <span className={styles.tooltipLabel}>Actual:</span>{" "}
                            {formatDurationForTooltip(
                              matchedActivity.moving_time / 60,
                            )}
                          </div>
                          <div>
                            <span className={styles.tooltipLabel}>Target:</span>{" "}
                            {formatDurationForTooltip(
                              workout.duration_target_minutes,
                            )}
                          </div>
                          {workout.compliance.breakdown.durationRatio !==
                            null && (
                            <div
                              className={styles.tooltipDirection}
                              style={{
                                color:
                                  workout.compliance.breakdown.durationRatio >=
                                    0.8 &&
                                  workout.compliance.breakdown.durationRatio <=
                                    1.2
                                    ? "var(--green-9)"
                                    : workout.compliance.breakdown
                                          .durationRatio < 0.8
                                      ? "var(--blue-9)"
                                      : "var(--red-9)",
                              }}
                            >
                              {workout.compliance.breakdown.durationRatio >=
                                0.8 &&
                                workout.compliance.breakdown.durationRatio <=
                                  1.2 &&
                                "✓ On target"}
                              {workout.compliance.breakdown.durationRatio <
                                0.8 &&
                                `↓ Too short (${Math.round(
                                  workout.compliance.breakdown.durationRatio *
                                    100,
                                )}%)`}
                              {workout.compliance.breakdown.durationRatio >
                                1.2 &&
                                `↑ Too long (${Math.round(
                                  workout.compliance.breakdown.durationRatio *
                                    100,
                                )}%)`}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className={styles.tooltipDetails}>
                          <span className={styles.tooltipMuted}>
                            No duration target set
                          </span>
                        </div>
                      )}
                    </div>

                    {/* HR Zone Section - hidden when intervals are present */}
                    {!workout.compliance.breakdown.intervals && (
                      <div className={styles.tooltipSection}>
                        <div className={styles.tooltipSectionHeader}>
                          <span>Heart Rate</span>
                          <span
                            style={{
                              color:
                                workout.compliance.breakdown.hrZone !== null
                                  ? getComplianceColor(
                                      workout.compliance.breakdown.hrZone,
                                    )
                                  : "var(--gray-9)",
                            }}
                          >
                            {workout.compliance.breakdown.hrZone !== null
                              ? `${workout.compliance.breakdown.hrZone}%`
                              : "N/A"}
                          </span>
                        </div>
                        {workout.compliance.breakdown.hrDetails ? (
                          <div className={styles.tooltipDetails}>
                            <div>
                              <span className={styles.tooltipLabel}>
                                Actual avg:
                              </span>{" "}
                              {workout.compliance.breakdown.hrDetails.actualAvg}{" "}
                              bpm
                            </div>
                            <div>
                              <span className={styles.tooltipLabel}>
                                Target:
                              </span>{" "}
                              {workout.compliance.breakdown.hrDetails
                                .targetZone > 0
                                ? `Zone ${workout.compliance.breakdown.hrDetails.targetZone} (${workout.compliance.breakdown.hrDetails.targetMin}-${workout.compliance.breakdown.hrDetails.targetMax} bpm)`
                                : `${workout.compliance.breakdown.hrDetails.targetMin}-${workout.compliance.breakdown.hrDetails.targetMax} bpm`}
                            </div>
                            <div
                              className={styles.tooltipDirection}
                              style={{
                                color:
                                  workout.compliance.breakdown.hrDetails
                                    .direction === "on_target"
                                    ? "var(--green-9)"
                                    : workout.compliance.breakdown.hrDetails
                                          .direction === "too_low"
                                      ? "var(--blue-9)"
                                      : "var(--red-9)",
                              }}
                            >
                              {workout.compliance.breakdown.hrDetails
                                .direction === "on_target" && "✓ On target"}
                              {workout.compliance.breakdown.hrDetails
                                .direction === "too_low" && "↓ Too low"}
                              {workout.compliance.breakdown.hrDetails
                                .direction === "too_high" && "↑ Too high"}
                              {workout.compliance.breakdown.hrDetails
                                .direction !== "on_target" && (
                                <span className={styles.tooltipDirectionDiff}>
                                  {" "}
                                  (
                                  {workout.compliance.breakdown.hrDetails
                                    .direction === "too_low"
                                    ? `-${
                                        workout.compliance.breakdown.hrDetails
                                          .targetMin -
                                        workout.compliance.breakdown.hrDetails
                                          .actualAvg
                                      }`
                                    : `+${
                                        workout.compliance.breakdown.hrDetails
                                          .actualAvg -
                                        workout.compliance.breakdown.hrDetails
                                          .targetMax
                                      }`}{" "}
                                  bpm)
                                </span>
                              )}
                            </div>
                          </div>
                        ) : matchedActivity?.average_heartrate ? (
                          <div className={styles.tooltipDetails}>
                            <div>
                              <span className={styles.tooltipLabel}>
                                Actual avg:
                              </span>{" "}
                              {Math.round(matchedActivity.average_heartrate)}{" "}
                              bpm
                            </div>
                            {workout.intensity_target ? (
                              <div>
                                <span className={styles.tooltipMuted}>
                                  Could not map "{workout.intensity_target}" to
                                  HR zone
                                </span>
                              </div>
                            ) : (
                              <div>
                                <span className={styles.tooltipMuted}>
                                  No intensity target set
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className={styles.tooltipDetails}>
                            <span className={styles.tooltipMuted}>
                              No HR data recorded
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Power Zone Section - hidden when intervals are present */}
                    {!workout.compliance.breakdown.intervals && (
                      <div className={styles.tooltipSection}>
                        <div className={styles.tooltipSectionHeader}>
                          <span>Power</span>
                          <span
                            style={{
                              color:
                                workout.compliance.breakdown.powerZone !== null
                                  ? getComplianceColor(
                                      workout.compliance.breakdown.powerZone,
                                    )
                                  : "var(--gray-9)",
                            }}
                          >
                            {workout.compliance.breakdown.powerZone !== null
                              ? `${workout.compliance.breakdown.powerZone}%`
                              : "N/A"}
                          </span>
                        </div>
                        {workout.compliance.breakdown.powerDetails ? (
                          <div className={styles.tooltipDetails}>
                            <div>
                              <span className={styles.tooltipLabel}>
                                Actual avg:
                              </span>{" "}
                              {
                                workout.compliance.breakdown.powerDetails
                                  .actualAvg
                              }
                              W
                            </div>
                            <div>
                              <span className={styles.tooltipLabel}>
                                Target:
                              </span>{" "}
                              {workout.compliance.breakdown.powerDetails
                                .targetZone > 0
                                ? `Zone ${workout.compliance.breakdown.powerDetails.targetZone} (${workout.compliance.breakdown.powerDetails.targetMin}-${workout.compliance.breakdown.powerDetails.targetMax}W)`
                                : `${workout.compliance.breakdown.powerDetails.targetMin}-${workout.compliance.breakdown.powerDetails.targetMax}W`}
                            </div>
                            <div
                              className={styles.tooltipDirection}
                              style={{
                                color:
                                  workout.compliance.breakdown.powerDetails
                                    .direction === "on_target"
                                    ? "var(--green-9)"
                                    : workout.compliance.breakdown.powerDetails
                                          .direction === "too_low"
                                      ? "var(--blue-9)"
                                      : "var(--red-9)",
                              }}
                            >
                              {workout.compliance.breakdown.powerDetails
                                .direction === "on_target" && "✓ On target"}
                              {workout.compliance.breakdown.powerDetails
                                .direction === "too_low" && "↓ Too low"}
                              {workout.compliance.breakdown.powerDetails
                                .direction === "too_high" && "↑ Too high"}
                              {workout.compliance.breakdown.powerDetails
                                .direction !== "on_target" && (
                                <span className={styles.tooltipDirectionDiff}>
                                  {" "}
                                  (
                                  {workout.compliance.breakdown.powerDetails
                                    .direction === "too_low"
                                    ? `-${
                                        workout.compliance.breakdown
                                          .powerDetails.targetMin -
                                        workout.compliance.breakdown
                                          .powerDetails.actualAvg
                                      }`
                                    : `+${
                                        workout.compliance.breakdown
                                          .powerDetails.actualAvg -
                                        workout.compliance.breakdown
                                          .powerDetails.targetMax
                                      }`}
                                  W)
                                </span>
                              )}
                            </div>
                          </div>
                        ) : matchedActivity?.weighted_average_watts ||
                          matchedActivity?.average_watts ? (
                          <div className={styles.tooltipDetails}>
                            <div>
                              <span className={styles.tooltipLabel}>
                                Actual avg:
                              </span>{" "}
                              {Math.round(
                                matchedActivity.weighted_average_watts ||
                                  matchedActivity.average_watts ||
                                  0,
                              )}
                              W
                            </div>
                            {workout.intensity_target ? (
                              <div>
                                <span className={styles.tooltipMuted}>
                                  Could not map "{workout.intensity_target}" to
                                  power zone
                                </span>
                              </div>
                            ) : (
                              <div>
                                <span className={styles.tooltipMuted}>
                                  No intensity target set
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className={styles.tooltipDetails}>
                            <span className={styles.tooltipMuted}>
                              No power data recorded
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Intervals Section */}
                    {workout.compliance.breakdown.intervals && (
                      <div className={styles.tooltipSection}>
                        <div className={styles.tooltipSectionHeader}>
                          <span>Intervals</span>
                          <span
                            style={{
                              color: getComplianceColor(
                                workout.compliance.breakdown.intervals.score,
                              ),
                            }}
                          >
                            {workout.compliance.breakdown.intervals.completed}/
                            {workout.compliance.breakdown.intervals.expected} (
                            {workout.compliance.breakdown.intervals.score}
                            %)
                          </span>
                        </div>
                        <div className={styles.tooltipDetails}>
                          <div>
                            <span className={styles.tooltipLabel}>Target:</span>{" "}
                            {workout.compliance.breakdown.intervals.expected}x
                            {Math.round(
                              workout.compliance.breakdown.intervals
                                .targetDurationSec / 60,
                            )}
                            min @ Zone{" "}
                            {workout.compliance.breakdown.intervals.targetZone}
                          </div>
                          {workout.compliance.breakdown.intervals.source && (
                            <div
                              className={styles.tooltipMuted}
                              style={{ fontSize: "0.85em", marginTop: "2px" }}
                            >
                              {workout.compliance.breakdown.intervals.source ===
                              "laps"
                                ? "✓ Detected from activity laps"
                                : workout.compliance.breakdown.intervals
                                      .source === "power_detection"
                                  ? "✓ Detected from power data"
                                  : "✓ Detected from heart rate"}
                            </div>
                          )}
                          <div className={styles.intervalList}>
                            {workout.compliance.breakdown.intervals.intervals.map(
                              (interval) => (
                                <div
                                  key={interval.index}
                                  className={styles.intervalItem}
                                >
                                  <span className={styles.intervalIndex}>
                                    #{interval.index}
                                  </span>
                                  {interval.status === "missing" ? (
                                    <span className={styles.intervalMissing}>
                                      Missing
                                    </span>
                                  ) : (
                                    <>
                                      <span className={styles.intervalDuration}>
                                        {Math.floor(interval.durationSec / 60)}:
                                        {String(
                                          Math.round(interval.durationSec % 60),
                                        ).padStart(2, "0")}
                                      </span>
                                      <span className={styles.intervalHR}>
                                        {interval.avgHR} bpm
                                        {interval.avgPower &&
                                          ` · ${interval.avgPower}W`}
                                      </span>
                                      <span
                                        className={styles.intervalStatus}
                                        style={{
                                          color:
                                            interval.status === "completed"
                                              ? "var(--green-9)"
                                              : interval.status === "wrong_zone"
                                                ? "var(--red-9)"
                                                : "var(--yellow-9)",
                                        }}
                                      >
                                        {interval.status === "completed" && "✓"}
                                        {interval.status === "too_short" && "↓"}
                                        {interval.status === "too_long" && "↑"}
                                        {interval.status === "wrong_zone" &&
                                          "Z"}
                                      </span>
                                    </>
                                  )}
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Scoring explanation */}
                    <div className={styles.tooltipFooter}>
                      <div>
                        <span style={{ color: "var(--green-9)" }}>≥80%</span> On
                        target
                      </div>
                      <div>
                        <span style={{ color: "var(--yellow-9)" }}>60-79%</span>{" "}
                        Close
                      </div>
                      <div>
                        <span style={{ color: "var(--red-9)" }}>&lt;60%</span>{" "}
                        Off target
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.emptyDay}>
          {availableActivities.length > 0 && (
            <div className={styles.unplannedActivities}>
              {availableActivities.map((a) => {
                const activity = a.data as Activity;
                return (
                  <div key={a.id} className={styles.unplannedActivity}>
                    <span>{activity.name}</span>
                    <span className={styles.activityMeta}>
                      {formatActivityDuration(activity.moving_time)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TrainingPlan() {
  // Week navigation state
  const [currentWeek, setCurrentWeek] = useState(() => getWeekStart());

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");

  // Report generation modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [weekName, setWeekName] = useState("");
  const [weekNotes, setWeekNotes] = useState("");

  // Edit workout modal state
  const [editingWorkout, setEditingWorkout] = useState<TrainingWorkoutWithMatch | null>(null);
  const [editForm, setEditForm] = useState({
    session_name: '',
    duration_input: '', // Store as string for flexible input
    intensity_target: '',
    notes: '',
  });

  // Data fetching
  const {
    data: planData,
    isLoading: planLoading,
    error: planError,
  } = useTrainingPlan(currentWeek);

  // Mutations
  const importMutation = useImportPlan();
  const linkMutation = useLinkActivity();
  const unlinkMutation = useUnlinkActivity();
  const deleteMutation = useDeletePlan();
  const updateMutation = useUpdateWorkout();

  // Handle import
  const handleImport = async () => {
    if (!importText.trim()) return;

    try {
      await importMutation.mutateAsync({
        markdown: importText,
        referenceDate: currentWeek,
      });
      setShowImportModal(false);
      setImportText("");
    } catch (error) {
      console.error("Import failed:", error);
    }
  };

  // Handle delete week
  const handleDeleteWeek = async () => {
    if (
      !confirm("Are you sure you want to delete all workouts for this week?")
    ) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(currentWeek);
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  // Handle generate report
  const handleGenerateReport = () => {
    if (!weekName.trim()) {
      alert("Please enter a week name");
      return;
    }

    const markdown = generateWeeklyReport(
      currentWeek,
      weekName.trim(),
      weekNotes.trim(),
      workouts,
    );

    // Generate filename: YYYY-MM-DD_Week-Name.md
    const dateStr = new Date().toISOString().split("T")[0];
    const sanitizedWeekName = weekName
      .trim()
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .replace(/-+/g, "-");
    const filename = `${dateStr}_${sanitizedWeekName}.md`;

    downloadFile(filename, markdown);

    // Reset and close modal
    setWeekName("");
    setWeekNotes("");
    setShowReportModal(false);
  };

  // Handle edit workout
  const handleEditWorkout = (workout: TrainingWorkoutWithMatch) => {
    setEditingWorkout(workout);
    setEditForm({
      session_name: workout.session_name,
      duration_input: workout.duration_target_minutes
        ? formatDuration(workout.duration_target_minutes)
        : '',
      intensity_target: workout.intensity_target || '',
      notes: workout.notes || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingWorkout || !editForm.session_name.trim()) {
      return;
    }

    // Parse duration
    let durationMinutes: number | null = null;
    if (editForm.duration_input.trim()) {
      const parsed = parseDurationInput(editForm.duration_input);
      if (parsed === null) {
        // Show error for invalid format
        return;
      }
      durationMinutes = parsed;
    }

    try {
      await updateMutation.mutateAsync({
        workoutId: editingWorkout.id,
        updates: {
          session_name: editForm.session_name.trim(),
          duration_target_minutes: durationMinutes,
          intensity_target: editForm.intensity_target.trim() || null,
          notes: editForm.notes.trim() || null,
        },
      });
      setEditingWorkout(null);
    } catch (error) {
      // Error will be shown in modal
      console.error('Failed to update workout:', error);
    }
  };

  // Helper to parse duration input
  function parseDurationInput(input: string): number | null {
    const str = input.trim().toLowerCase();

    // "1:30"
    const colonMatch = str.match(/^(\d+):(\d+)$/);
    if (colonMatch) {
      const h = parseInt(colonMatch[1], 10);
      const m = parseInt(colonMatch[2], 10);
      return h * 60 + m;
    }

    // "90", "90min"
    const minMatch = str.match(/^(\d+)(?:\s*mins?)?$/);
    if (minMatch) return parseInt(minMatch[1], 10);

    // "1h30m" or "1h30"
    const hmsMatch = str.match(/^(\d+)h(?:(\d+)m?)?$/);
    if (hmsMatch) {
      const h = parseInt(hmsMatch[1], 10);
      const m = hmsMatch[2] ? parseInt(hmsMatch[2], 10) : 0;
      return h * 60 + m;
    }

    return null;
  }

  const weekDates = getWeekDates(currentWeek);
  const workouts = planData?.workouts ?? [];
  const unmatchedActivities = planData?.unmatchedActivities ?? [];

  // Map workouts by date for easy lookup
  const workoutsByDate = new Map<string, TrainingWorkoutWithMatch>();
  workouts.forEach((w) => {
    const dateStr = formatDbDate(w.workout_date);
    workoutsByDate.set(dateStr, w);
  });

  return (
    <>
      <Container size="4" className={styles.container}>
        <Flex direction="column" gap="4" py="6">
          {/* Week navigation and actions */}
          <Flex justify="between" align="center" wrap="wrap" gap="3">
            <Flex align="center" gap="3">
              <button
                className={styles.navBtn}
                onClick={() => setCurrentWeek(getPreviousWeek(currentWeek))}
              >
                <FiChevronLeft size={20} />
              </button>
              <Text size="4" weight="medium" className={styles.weekLabel}>
                {formatWeekRange(currentWeek)}
              </Text>
              <button
                className={styles.navBtn}
                onClick={() => setCurrentWeek(getNextWeek(currentWeek))}
              >
                <FiChevronRight size={20} />
              </button>
              <button
                className={styles.todayBtn}
                onClick={() => setCurrentWeek(getWeekStart())}
              >
                Today
              </button>
            </Flex>

            <Flex gap="2" wrap="wrap">
              <Button variant="soft" onClick={() => setShowImportModal(true)}>
                <FiPlus size={16} />
                Import Plan
              </Button>
              {workouts.length > 0 && (
                <>
                  <Button
                    variant="soft"
                    color="green"
                    onClick={() => setShowReportModal(true)}
                  >
                    <FiFileText size={16} />
                    Generate Report
                  </Button>
                  <Button
                    variant="soft"
                    color="red"
                    onClick={handleDeleteWeek}
                    disabled={deleteMutation.isPending}
                  >
                    <FiTrash2 size={16} />
                    Clear Week
                  </Button>
                </>
              )}
            </Flex>
          </Flex>

          {/* Calendar grid */}
          {planLoading ? (
            <div className={styles.calendarGrid}>
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} height="200px" />
              ))}
            </div>
          ) : planError ? (
            <Box className={styles.errorBox}>
              <Text color="red">
                Failed to load training plan. Please try again.
              </Text>
            </Box>
          ) : (
            <div className={styles.calendarGrid}>
              {weekDates.map((date) => {
                const dateStr = formatLocalDate(date);
                const workout = workoutsByDate.get(dateStr) || null;

                return (
                  <DayCell
                    key={dateStr}
                    date={date}
                    workout={workout}
                    unmatchedActivities={unmatchedActivities}
                    onLinkActivity={(workoutId, activityId) =>
                      linkMutation.mutate({ workoutId, activityId })
                    }
                    onUnlinkActivity={(workoutId) =>
                      unlinkMutation.mutate(workoutId)
                    }
                    onEditWorkout={handleEditWorkout}
                    isLinking={linkMutation.isPending}
                    isUnlinking={unlinkMutation.isPending}
                  />
                );
              })}
            </div>
          )}

          {/* Import errors display */}
          {importMutation.data?.parseErrors &&
            importMutation.data.parseErrors.length > 0 && (
              <Box className={styles.warningBox}>
                <Text weight="medium">Import warnings:</Text>
                <ul>
                  {importMutation.data.parseErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </Box>
            )}

          {/* Weekly Summary */}
          {!planLoading && workouts.length > 0 && (
            <WeeklySummary workouts={workouts} />
          )}

          {/* Empty state */}
          {!planLoading && workouts.length === 0 && (
            <Box className={styles.emptyState}>
              <Text size="3" color="gray">
                No training plan for this week. Click "Import Plan" to add
                workouts from your coach.
              </Text>
            </Box>
          )}
        </Flex>
      </Container>

      {/* Import Modal */}
      <Dialog.Root open={showImportModal} onOpenChange={setShowImportModal}>
        <Dialog.Content maxWidth="600px">
          <Dialog.Title>Import Training Plan</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Paste your training plan table below. The format should include
            columns for Day, Session, Duration, Intensity, and Notes.
          </Dialog.Description>

          <Flex direction="column" gap="3">
            <TextArea
              placeholder={`| Day    |      Session |  Duration | Intensity target  | Notes |
| ------ | -----------: | --------: | ----------------- | ----- |
| Mon 5  |    Endurance | 1:00-1:15 | 135–145 bpm       | Easy  |
| Tue 6  |     Intervals | 1:00     | 2×12 min @ 165 bpm |       |`}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              style={{ minHeight: "200px", fontFamily: "monospace" }}
            />

            {importMutation.error && (
              <Text color="red" size="2">
                {importMutation.error instanceof Error
                  ? importMutation.error.message
                  : "Import failed"}
              </Text>
            )}

            <Flex gap="3" justify="end">
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                onClick={handleImport}
                disabled={!importText.trim() || importMutation.isPending}
              >
                {importMutation.isPending ? "Importing..." : "Import"}
              </Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Generate Report Modal */}
      <Dialog.Root open={showReportModal} onOpenChange={setShowReportModal}>
        <Dialog.Content maxWidth="500px">
          <Dialog.Title>Generate Weekly Report</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Create a downloadable markdown report summarizing this week's
            training.
          </Dialog.Description>

          <Flex direction="column" gap="4">
            <label>
              <Text as="div" size="2" weight="bold" mb="2">
                Week Name *
              </Text>
              <input
                type="text"
                placeholder="e.g., Base 1 - Week 3"
                value={weekName}
                onChange={(e) => setWeekName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  fontSize: "0.875rem",
                  borderRadius: "var(--radius-2)",
                  border: "1px solid var(--gray-a6)",
                  backgroundColor: "var(--color-background)",
                  color: "var(--gray-12)",
                }}
              />
            </label>

            <label>
              <Text as="div" size="2" weight="bold" mb="2">
                Notes
              </Text>
              <TextArea
                placeholder="Overall feeling, fatigue, soreness, etc."
                value={weekNotes}
                onChange={(e) => setWeekNotes(e.target.value)}
                style={{ minHeight: "100px" }}
              />
            </label>

            <Flex gap="3" justify="end">
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                onClick={handleGenerateReport}
                disabled={!weekName.trim()}
              >
                Generate & Download
              </Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Edit Workout Modal */}
      <Dialog.Root
        open={!!editingWorkout}
        onOpenChange={(open) => !open && setEditingWorkout(null)}
      >
        <Dialog.Content maxWidth="500px">
          <Dialog.Title>Edit Workout</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Modify workout details. Compliance will be recalculated automatically.
          </Dialog.Description>

          <Flex direction="column" gap="3">
            {/* Session Name */}
            <label>
              <Text as="div" size="2" weight="bold" mb="1">
                Session Name *
              </Text>
              <input
                type="text"
                value={editForm.session_name}
                onChange={(e) => setEditForm({ ...editForm, session_name: e.target.value })}
                className={styles.input}
                placeholder="e.g., Endurance, Intervals"
              />
            </label>

            {/* Duration */}
            <label>
              <Text as="div" size="2" weight="bold" mb="1">
                Duration Target
              </Text>
              <input
                type="text"
                value={editForm.duration_input}
                onChange={(e) => setEditForm({ ...editForm, duration_input: e.target.value })}
                className={styles.input}
                placeholder="e.g., 90, 1:30, 1h30m"
              />
              <Text size="1" color="gray">
                Format: minutes (90), H:MM (1:30), or verbose (1h30m)
              </Text>
            </label>

            {/* Intensity */}
            <label>
              <Text as="div" size="2" weight="bold" mb="1">
                Intensity Target
              </Text>
              <input
                type="text"
                value={editForm.intensity_target}
                onChange={(e) => setEditForm({ ...editForm, intensity_target: e.target.value })}
                className={styles.input}
                placeholder="e.g., Z2, 165 bpm, 3x10min @ Z4"
              />
            </label>

            {/* Notes */}
            <label>
              <Text as="div" size="2" weight="bold" mb="1">
                Notes
              </Text>
              <TextArea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Additional details, recovery between intervals, etc."
                style={{ minHeight: "80px" }}
              />
            </label>

            {/* Error Display */}
            {updateMutation.error && (
              <Text color="red" size="2">
                {updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : "Failed to update workout"}
              </Text>
            )}

            {/* Actions */}
            <Flex gap="3" justify="end">
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                onClick={handleSaveEdit}
                disabled={!editForm.session_name.trim() || updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
}
