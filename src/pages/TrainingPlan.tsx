import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Container,
  Flex,
  Heading,
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
} from "react-icons/fi";
import { AuthButton } from "../components/AuthButton";
import { useAuthStore } from "../stores/authStore";
import { useAthlete } from "../hooks/useAthlete";
import {
  useTrainingPlan,
  useImportPlan,
  useLinkActivity,
  useUnlinkActivity,
  useDeletePlan,
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
  isLinking: boolean;
  isUnlinking: boolean;
}

function DayCell({
  date,
  workout,
  unmatchedActivities,
  onLinkActivity,
  onUnlinkActivity,
  isLinking,
  isUnlinking,
}: DayCellProps) {
  const [showLinkMenu, setShowLinkMenu] = useState(false);
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
            <div className={styles.sessionName}>{workout.session_name}</div>
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
                                  workout.compliance.breakdown.duration !== null
                                    ? getComplianceColor(
                                        workout.compliance.breakdown.duration
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
                                  matchedActivity.moving_time / 60
                                )}
                              </div>
                              <div>
                                <span className={styles.tooltipLabel}>
                                  Target:
                                </span>{" "}
                                {formatDurationForTooltip(
                                  workout.duration_target_minutes
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
                                  {workout.compliance.breakdown.durationRatio >=
                                    0.8 &&
                                    workout.compliance.breakdown
                                      .durationRatio <= 1.2 &&
                                    "✓ On target"}
                                  {workout.compliance.breakdown.durationRatio <
                                    0.8 &&
                                    `↓ Too short (${Math.round(
                                      workout.compliance.breakdown
                                        .durationRatio * 100
                                    )}%)`}
                                  {workout.compliance.breakdown.durationRatio >
                                    1.2 &&
                                    `↑ Too long (${Math.round(
                                      workout.compliance.breakdown
                                        .durationRatio * 100
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

                        {/* HR Zone Section */}
                        <div className={styles.tooltipSection}>
                          <div className={styles.tooltipSectionHeader}>
                            <span>Heart Rate</span>
                            <span
                              style={{
                                color:
                                  workout.compliance.breakdown.hrZone !== null
                                    ? getComplianceColor(
                                        workout.compliance.breakdown.hrZone
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
                                    Could not map "{workout.intensity_target}"
                                    to HR zone
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

                        {/* Intervals Section */}
                        {workout.compliance.breakdown.intervals && (
                          <div className={styles.tooltipSection}>
                            <div className={styles.tooltipSectionHeader}>
                              <span>Intervals</span>
                              <span
                                style={{
                                  color: getComplianceColor(
                                    workout.compliance.breakdown.intervals.score
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
                                ({workout.compliance.breakdown.intervals.score}
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
                                    .targetDurationSec / 60
                                )}
                                min @ Zone{" "}
                                {
                                  workout.compliance.breakdown.intervals
                                    .targetZone
                                }
                              </div>
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
                                            className={styles.intervalDuration}
                                          >
                                            {Math.floor(
                                              interval.durationSec / 60
                                            )}
                                            :
                                            {String(
                                              Math.round(
                                                interval.durationSec % 60
                                              )
                                            ).padStart(2, "0")}
                                          </span>
                                          <span className={styles.intervalHR}>
                                            {interval.avgHR} bpm
                                          </span>
                                          <span
                                            className={styles.intervalStatus}
                                            style={{
                                              color:
                                                interval.status === "completed"
                                                  ? "var(--green-9)"
                                                  : interval.status ===
                                                    "wrong_zone"
                                                  ? "var(--red-9)"
                                                  : "var(--yellow-9)",
                                            }}
                                          >
                                            {interval.status === "completed" &&
                                              "✓"}
                                            {interval.status === "too_short" &&
                                              "↓"}
                                            {interval.status === "too_long" &&
                                              "↑"}
                                            {interval.status === "wrong_zone" &&
                                              "Z"}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  )
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
                        workout.compliance.score
                      ),
                    }}
                  />
                </div>
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
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { isLoading: athleteLoading, isError: athleteError } = useAthlete();

  // Week navigation state
  const [currentWeek, setCurrentWeek] = useState(() => getWeekStart());

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");

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

  const isLoading = authLoading || athleteLoading;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, isLoading, navigate]);

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

  if (isLoading) {
    return (
      <Box className={styles.page}>
        <header className={styles.header}>
          <Container size="4">
            <Flex justify="between" align="center" py="4">
              <Heading size="5">Training Plan</Heading>
              <Skeleton height="32px" width="100px" />
            </Flex>
          </Container>
        </header>
        <Container size="4" className={styles.container}>
          <Skeleton height="400px" />
        </Container>
      </Box>
    );
  }

  if (athleteError || !isAuthenticated) {
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
    <Box className={styles.page}>
      <header className={styles.header}>
        <Container size="4">
          <Flex justify="between" align="center" py="4">
            <Flex align="center" gap="4">
              <Heading size="5">Training Plan</Heading>
            </Flex>
            <AuthButton />
          </Flex>
        </Container>
      </header>

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

            <Flex gap="2">
              <Button variant="soft" onClick={() => setShowImportModal(true)}>
                <FiPlus size={16} />
                Import Plan
              </Button>
              {workouts.length > 0 && (
                <Button
                  variant="soft"
                  color="red"
                  onClick={handleDeleteWeek}
                  disabled={deleteMutation.isPending}
                >
                  <FiTrash2 size={16} />
                  Clear Week
                </Button>
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

      <footer className={styles.footer}>
        <Container size="4">
          <Flex justify="center" align="center" py="4">
            <a
              href="https://www.strava.com"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.poweredByLink}
            >
              <img
                src="/api_logo_pwrdBy_strava_horiz_orange.svg"
                alt="Powered by Strava"
                height="24"
              />
            </a>
          </Flex>
        </Container>
      </footer>
    </Box>
  );
}
