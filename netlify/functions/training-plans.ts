import type { Context } from "@netlify/functions";
import {
  withAuth,
  jsonResponseWithCookies,
  jsonResponse,
  parseTokensFromCookies,
  handleCorsPreFlight,
  getCorsHeaders,
} from "./lib/strava.js";
import {
  getTrainingWorkoutsForWeek,
  getTrainingWorkoutById,
  upsertTrainingWorkoutsBatch,
  linkActivityToWorkout,
  unlinkActivityFromWorkout,
  deleteTrainingWorkoutsForWeek,
  getActivitiesForDateRange,
  getActivityStreams,
  getAthleteZones,
  type DbTrainingWorkout,
  type DbActivity,
  type HRZoneRange,
} from "./lib/db.js";
import {
  parseTrainingPlanTable,
  convertToDbWorkouts,
} from "./lib/training-plan-parser.js";

/**
 * Format a date to YYYY-MM-DD (handles both Date objects and strings)
 */
function formatDateString(date: Date | string): string {
  if (typeof date === "string") {
    return date.split("T")[0];
  }
  // Format in local timezone to avoid UTC shift issues
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string as a UTC date
 * Using UTC ensures consistent behavior across server environments
 */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

// Activity type mapping for auto-matching
const SESSION_TYPE_MAP: Record<string, string[]> = {
  // Cycling sessions
  endurance: ["Ride", "VirtualRide", "EBikeRide"],
  "long ride": ["Ride", "VirtualRide"],
  "easy trainer": ["VirtualRide", "Ride"],
  "trainer": ["VirtualRide", "Ride"],
  "controlled effort": ["Ride", "VirtualRide"],
  tempo: ["Ride", "VirtualRide"],
  intervals: ["Ride", "VirtualRide"],
  "cadence drills": ["Ride", "VirtualRide"],
  // Strength/gym sessions
  strength: ["WeightTraining", "Workout", "Crossfit"],
  gym: ["WeightTraining", "Workout", "Crossfit"],
  // Rest/recovery
  off: [],
  rest: [],
  "travel day": [],
  recovery: ["Walk", "Yoga"],
};

/**
 * Find matching Strava activity types for a session name
 */
function getMatchingActivityTypes(sessionName: string): string[] {
  const lower = sessionName.toLowerCase();

  for (const [key, types] of Object.entries(SESSION_TYPE_MAP)) {
    if (lower.includes(key)) {
      return types;
    }
  }

  // Default: match any cycling activity
  return ["Ride", "VirtualRide", "Run", "Walk", "WeightTraining", "Workout"];
}

/**
 * Auto-match activities to workouts based on date and type
 */
function autoMatchActivities(
  workouts: DbTrainingWorkout[],
  activities: DbActivity[]
): Map<number, DbActivity | null> {
  const matches = new Map<number, DbActivity | null>();

  // Group activities by date (YYYY-MM-DD)
  const activitiesByDate = new Map<string, DbActivity[]>();
  for (const activity of activities) {
    const data = activity.data as { start_date_local?: string; type?: string };
    if (!data.start_date_local) continue;

    const date = data.start_date_local.split("T")[0];
    if (!activitiesByDate.has(date)) {
      activitiesByDate.set(date, []);
    }
    activitiesByDate.get(date)!.push(activity);
  }

  // Match each workout
  for (const workout of workouts) {
    // Skip if manually linked
    if (workout.is_manually_linked && workout.matched_activity_id) {
      const existingMatch = activities.find(
        (a) => a.id === workout.matched_activity_id
      );
      matches.set(workout.id, existingMatch || null);
      continue;
    }

    const workoutDate = formatDateString(workout.workout_date);

    const dayActivities = activitiesByDate.get(workoutDate) || [];

    if (dayActivities.length === 0) {
      matches.set(workout.id, null);
      continue;
    }

    // Get expected activity types for this session
    const expectedTypes = getMatchingActivityTypes(workout.session_name);

    // Find best match
    let bestMatch: DbActivity | null = null;
    let bestScore = -1;

    for (const activity of dayActivities) {
      const data = activity.data as {
        type?: string;
        moving_time?: number;
      };

      let score = 0;

      // Type match bonus
      if (expectedTypes.length === 0) {
        // Rest day - no match expected
        continue;
      }

      if (data.type && expectedTypes.includes(data.type)) {
        score += 10;
      }

      // Duration proximity bonus (if we have a target)
      if (workout.duration_target_minutes && data.moving_time) {
        const actualMinutes = data.moving_time / 60;
        const ratio = actualMinutes / workout.duration_target_minutes;
        // Closer to 1.0 is better
        if (ratio >= 0.7 && ratio <= 1.3) {
          score += 5;
        }
      }

      // Prefer longer activities (more likely to be the "main" workout)
      if (data.moving_time) {
        score += Math.min(data.moving_time / 3600, 2); // Up to 2 points for 2+ hours
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = activity;
      }
    }

    matches.set(workout.id, bestMatch);
  }

  return matches;
}

// Keyword to HR zone mapping (1-indexed: Zone 1 = recovery, Zone 5 = max effort)
const INTENSITY_KEYWORD_TO_ZONE: Record<string, number> = {
  // Zone 1 - Recovery
  "recovery": 1,
  "very easy": 1,
  "z1": 1,
  "zone 1": 1,
  // Zone 2 - Endurance
  "easy": 2,
  "endurance": 2,
  "z2": 2,
  "zone 2": 2,
  "aerobic": 2,
  // Zone 3 - Tempo
  "tempo": 3,
  "moderate": 3,
  "z3": 3,
  "zone 3": 3,
  "controlled": 3,
  // Zone 4 - Threshold
  "threshold": 4,
  "hard": 4,
  "z4": 4,
  "zone 4": 4,
  "lactate": 4,
  "sweet spot": 4,
  // Zone 5 - VO2max
  "vo2": 5,
  "vo2max": 5,
  "max": 5,
  "z5": 5,
  "zone 5": 5,
  "anaerobic": 5,
};

/**
 * Parse intensity target to get target zone index (1-5)
 * Returns null if unable to determine zone
 */
function parseIntensityToZone(intensityTarget: string): number | null {
  const lower = intensityTarget.toLowerCase();

  // Check for explicit zone mentions first (z1, z2, zone 1, zone 2, etc.)
  const zoneMatch = lower.match(/z(?:one\s*)?(\d)/i);
  if (zoneMatch) {
    const zone = parseInt(zoneMatch[1], 10);
    if (zone >= 1 && zone <= 5) return zone;
  }

  // Check keyword mappings
  for (const [keyword, zone] of Object.entries(INTENSITY_KEYWORD_TO_ZONE)) {
    if (lower.includes(keyword)) {
      return zone;
    }
  }

  return null;
}

/**
 * Parsed interval structure from workout text
 */
interface ParsedIntervalStructure {
  count: number;
  durationSec: number;
  targetZone: number | null;
  rawText: string;
}

/**
 * Parse interval structure from text (e.g., "3x10min tempo", "6x1' hard", "4x5mins Z4")
 * Searches session_name, notes, and intensity_target fields
 */
function parseIntervalStructure(
  sessionName: string,
  notes: string | null,
  intensityTarget: string | null
): ParsedIntervalStructure | null {
  // Combine all text sources to search
  const textSources = [sessionName, notes, intensityTarget].filter(Boolean);

  // Pattern: NxDURATION [UNIT] [@ INTENSITY]
  // Examples: 3x10min, 6x1', 4x5mins Z4, 5x2min @ threshold, 3x10' tempo
  const patterns = [
    // 3x10min, 3x10mins, 3x10minute, 3x10minutes
    /(\d+)\s*x\s*(\d+)\s*(min(?:ute)?s?)\s*(?:@\s*)?(\S+)?/i,
    // 3x10' (single quote for minutes)
    /(\d+)\s*x\s*(\d+)\s*['′]\s*(?:@\s*)?(\S+)?/i,
    // 3x30sec, 3x30secs, 3x30second, 3x30seconds
    /(\d+)\s*x\s*(\d+)\s*(sec(?:ond)?s?)\s*(?:@\s*)?(\S+)?/i,
    // 3x30" (double quote for seconds)
    /(\d+)\s*x\s*(\d+)\s*["″]\s*(?:@\s*)?(\S+)?/i,
  ];

  for (const text of textSources) {
    if (!text) continue;

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const count = parseInt(match[1], 10);
        const duration = parseInt(match[2], 10);
        const unit = match[3]?.toLowerCase() || "";
        const intensityPart = match[4] || match[3]; // Intensity might be in different capture group

        // Convert to seconds
        let durationSec: number;
        if (unit.includes("sec") || unit === '"' || unit === '″') {
          durationSec = duration;
        } else {
          // Default to minutes
          durationSec = duration * 60;
        }

        // Try to parse target zone from intensity part or from overall intensity target
        let targetZone: number | null = null;
        if (intensityPart) {
          targetZone = parseIntensityToZone(intensityPart);
        }
        if (targetZone === null && intensityTarget) {
          targetZone = parseIntensityToZone(intensityTarget);
        }

        // Validate reasonable values
        if (count >= 1 && count <= 20 && durationSec >= 10 && durationSec <= 3600) {
          return {
            count,
            durationSec,
            targetZone,
            rawText: match[0],
          };
        }
      }
    }
  }

  return null;
}

/**
 * Detected interval from HR stream analysis
 */
interface DetectedInterval {
  startSec: number;
  endSec: number;
  durationSec: number;
  avgHR: number;
  maxHR: number;
  zone: number; // 1-5 based on where avgHR falls
}

/**
 * Detect intervals from HR stream data
 * Looks for sustained periods where HR is in or above the target zone
 */
function detectIntervals(
  timeData: number[], // Elapsed seconds array
  hrData: number[], // HR values array
  hrZones: HRZoneRange[],
  targetZone: number, // 1-5
  minDurationSec: number // Minimum interval duration to detect
): DetectedInterval[] {
  if (timeData.length !== hrData.length || timeData.length === 0) {
    return [];
  }

  const intervals: DetectedInterval[] = [];
  const zoneIndex = targetZone - 1;

  if (zoneIndex < 0 || zoneIndex >= hrZones.length) {
    return [];
  }

  const targetMin = hrZones[zoneIndex].min;
  const targetMax = hrZones[zoneIndex].max;

  // Hysteresis: require 5 bpm below min to exit, allow 5 bpm tolerance above
  const entryThreshold = targetMin - 5;
  const exitThreshold = targetMin - 10;

  // Minimum time to consider as entering an interval (avoid noise)
  const minEntryTime = 10; // seconds

  // Skip warm-up (first 5 minutes) for interval detection
  const warmupEndSec = 300;

  let inInterval = false;
  let intervalStart = 0;
  let intervalHRSum = 0;
  let intervalHRCount = 0;
  let intervalMaxHR = 0;
  let consecutiveAboveThreshold = 0;
  let consecutiveBelowThreshold = 0;

  for (let i = 0; i < timeData.length; i++) {
    const time = timeData[i];
    const hr = hrData[i];

    // Skip warm-up period
    if (time < warmupEndSec) continue;

    if (!inInterval) {
      // Looking to start an interval
      if (hr >= entryThreshold) {
        consecutiveAboveThreshold++;
        if (consecutiveAboveThreshold >= minEntryTime) {
          // Start interval
          inInterval = true;
          intervalStart = time - minEntryTime;
          intervalHRSum = hr * minEntryTime;
          intervalHRCount = minEntryTime;
          intervalMaxHR = hr;
          consecutiveBelowThreshold = 0;
        }
      } else {
        consecutiveAboveThreshold = 0;
      }
    } else {
      // In an interval, accumulate data
      intervalHRSum += hr;
      intervalHRCount++;
      intervalMaxHR = Math.max(intervalMaxHR, hr);

      if (hr < exitThreshold) {
        consecutiveBelowThreshold++;
        // Exit interval after 10 seconds below threshold
        if (consecutiveBelowThreshold >= 10) {
          const endTime = time - 10;
          const durationSec = endTime - intervalStart;

          // Only record if meets minimum duration (at least 50% of target)
          if (durationSec >= minDurationSec * 0.5) {
            const avgHR = Math.round(intervalHRSum / intervalHRCount);

            // Determine which zone the avgHR falls into
            let actualZone = 1;
            for (let z = hrZones.length - 1; z >= 0; z--) {
              if (avgHR >= hrZones[z].min) {
                actualZone = z + 1;
                break;
              }
            }

            intervals.push({
              startSec: intervalStart,
              endSec: endTime,
              durationSec,
              avgHR,
              maxHR: intervalMaxHR,
              zone: actualZone,
            });
          }

          inInterval = false;
          consecutiveAboveThreshold = 0;
          consecutiveBelowThreshold = 0;
          intervalHRSum = 0;
          intervalHRCount = 0;
          intervalMaxHR = 0;
        }
      } else {
        consecutiveBelowThreshold = 0;
      }
    }
  }

  // Handle case where activity ends while still in interval
  if (inInterval && intervalHRCount > 0) {
    const endTime = timeData[timeData.length - 1];
    const durationSec = endTime - intervalStart;

    if (durationSec >= minDurationSec * 0.5) {
      const avgHR = Math.round(intervalHRSum / intervalHRCount);

      let actualZone = 1;
      for (let z = hrZones.length - 1; z >= 0; z--) {
        if (avgHR >= hrZones[z].min) {
          actualZone = z + 1;
          break;
        }
      }

      intervals.push({
        startSec: intervalStart,
        endSec: endTime,
        durationSec,
        avgHR,
        maxHR: intervalMaxHR,
        zone: actualZone,
      });
    }
  }

  return intervals;
}

/**
 * Interval compliance result type
 */
interface IntervalComplianceResult {
  expected: number;
  completed: number;
  score: number;
  targetDurationSec: number;
  targetZone: number;
  intervals: Array<{
    index: number;
    durationSec: number;
    targetDurationSec: number;
    avgHR: number;
    targetZone: number;
    status: "completed" | "too_short" | "too_long" | "wrong_zone" | "missing";
  }>;
}

/**
 * Calculate compliance score for a workout-activity pair
 */
async function calculateCompliance(
  workout: DbTrainingWorkout,
  activity: DbActivity | null,
  hrZones: HRZoneRange[] | null
): Promise<{
  score: number;
  breakdown: {
    duration: number | null;
    durationRatio: number | null;
    hrZone: number | null;
    hrDetails: {
      actualAvg: number;
      targetZone: number;
      targetMin: number;
      targetMax: number;
      direction: "on_target" | "too_low" | "too_high";
    } | null;
    intervals: IntervalComplianceResult | null;
    activityDone: number;
  };
}> {
  if (!activity) {
    return {
      score: 0,
      breakdown: { duration: null, durationRatio: null, hrZone: null, hrDetails: null, intervals: null, activityDone: 0 },
    };
  }

  const data = activity.data as {
    type?: string;
    moving_time?: number;
    average_heartrate?: number;
  };

  let durationScore: number | null = null;
  let durationRatio: number | null = null;
  let hrZoneScore: number | null = null;
  let hrDetails: {
    actualAvg: number;
    targetZone: number;
    targetMin: number;
    targetMax: number;
    direction: "on_target" | "too_low" | "too_high";
  } | null = null;
  let intervalsCompliance: IntervalComplianceResult | null = null;
  const activityDoneScore = 100; // Activity exists

  // Duration compliance (40% weight)
  if (workout.duration_target_minutes && data.moving_time) {
    const actualMinutes = data.moving_time / 60;
    durationRatio = actualMinutes / workout.duration_target_minutes;

    if (durationRatio >= 0.8 && durationRatio <= 1.2) {
      durationScore = 100;
    } else if (durationRatio >= 0.6 && durationRatio <= 1.4) {
      durationScore = 70;
    } else if (durationRatio >= 0.4) {
      durationScore = 40;
    } else {
      durationScore = 20;
    }
  }

  // HR Zone compliance (40% weight)
  if (workout.intensity_target && data.average_heartrate) {
    const avgHR = data.average_heartrate;

    // Try to parse HR target from intensity string (e.g., "130-150 bpm")
    const hrMatch = workout.intensity_target.match(
      /(\d+)\s*[-–]\s*(\d+)\s*bpm/i
    );

    if (hrMatch) {
      // Explicit BPM range provided
      const targetMin = parseInt(hrMatch[1], 10);
      const targetMax = parseInt(hrMatch[2], 10);

      let direction: "on_target" | "too_low" | "too_high" = "on_target";
      if (avgHR < targetMin) {
        direction = "too_low";
      } else if (avgHR > targetMax) {
        direction = "too_high";
      }

      if (avgHR >= targetMin && avgHR <= targetMax) {
        hrZoneScore = 100;
      } else if (avgHR >= targetMin - 10 && avgHR <= targetMax + 10) {
        hrZoneScore = 70;
      } else {
        hrZoneScore = 30;
      }

      hrDetails = {
        actualAvg: Math.round(avgHR),
        targetZone: 0, // Not using zone system
        targetMin,
        targetMax,
        direction,
      };
    } else if (hrZones && hrZones.length >= 5) {
      // Use athlete's Strava zones with keyword mapping
      const targetZone = parseIntensityToZone(workout.intensity_target);

      if (targetZone !== null) {
        // Strava zones are 0-indexed, but our keywords are 1-indexed
        const zoneIndex = targetZone - 1;
        const zone = hrZones[zoneIndex];

        if (zone) {
          const targetMin = zone.min;
          const targetMax = zone.max;

          let direction: "on_target" | "too_low" | "too_high" = "on_target";
          if (avgHR < targetMin) {
            direction = "too_low";
          } else if (avgHR > targetMax) {
            direction = "too_high";
          }

          // Score based on how well HR matches the target zone
          if (avgHR >= targetMin && avgHR <= targetMax) {
            hrZoneScore = 100;
          } else {
            // Check if within adjacent zone (±1 zone)
            const lowerBound = zoneIndex > 0 ? hrZones[zoneIndex - 1].min : targetMin - 20;
            const upperBound = zoneIndex < hrZones.length - 1 ? hrZones[zoneIndex + 1].max : targetMax + 20;

            if (avgHR >= lowerBound && avgHR <= upperBound) {
              hrZoneScore = 60; // One zone off
            } else {
              hrZoneScore = 30; // More than one zone off
            }
          }

          hrDetails = {
            actualAvg: Math.round(avgHR),
            targetZone,
            targetMin,
            targetMax,
            direction,
          };
        }
      }
    }
  }

  // Interval compliance - parse and analyze interval structure
  const intervalStructure = parseIntervalStructure(
    workout.session_name,
    workout.notes,
    workout.intensity_target
  );

  if (intervalStructure && hrZones && hrZones.length >= 5) {
    const targetZone = intervalStructure.targetZone ?? 3; // Default to Zone 3 (tempo)

    try {
      // Fetch activity streams for detailed analysis
      const streams = await getActivityStreams(activity.id);

      if (streams?.streams) {
        const streamData = streams.streams as {
          time?: { data: number[] };
          heartrate?: { data: number[] };
        };

        if (streamData.time?.data && streamData.heartrate?.data) {
          // Detect intervals from HR stream
          const detectedIntervals = detectIntervals(
            streamData.time.data,
            streamData.heartrate.data,
            hrZones,
            targetZone,
            intervalStructure.durationSec
          );

          // Match detected intervals to expected structure
          const intervalResults: IntervalComplianceResult["intervals"] = [];
          let intervalScoreSum = 0;

          for (let i = 0; i < intervalStructure.count; i++) {
            const detected = detectedIntervals[i];

            if (!detected) {
              // Missing interval
              intervalResults.push({
                index: i + 1,
                durationSec: 0,
                targetDurationSec: intervalStructure.durationSec,
                avgHR: 0,
                targetZone,
                status: "missing",
              });
              // 0 points for missing
            } else {
              // Calculate status
              const durationRatioInt = detected.durationSec / intervalStructure.durationSec;
              const zoneMatch = detected.zone === targetZone;
              const zoneClose = Math.abs(detected.zone - targetZone) === 1;

              let status: "completed" | "too_short" | "too_long" | "wrong_zone";
              let intervalScore = 0;

              if (zoneMatch && durationRatioInt >= 0.8 && durationRatioInt <= 1.2) {
                status = "completed";
                intervalScore = 100;
              } else if (durationRatioInt < 0.8) {
                status = "too_short";
                intervalScore = zoneMatch ? 70 : (zoneClose ? 50 : 30);
              } else if (durationRatioInt > 1.2) {
                status = "too_long";
                intervalScore = zoneMatch ? 70 : (zoneClose ? 50 : 30);
              } else if (!zoneMatch) {
                status = "wrong_zone";
                intervalScore = zoneClose ? 50 : 30;
              } else {
                status = "completed";
                intervalScore = 100;
              }

              intervalResults.push({
                index: i + 1,
                durationSec: detected.durationSec,
                targetDurationSec: intervalStructure.durationSec,
                avgHR: detected.avgHR,
                targetZone,
                status,
              });
              intervalScoreSum += intervalScore;
            }
          }

          const completedCount = intervalResults.filter(
            (r) => r.status === "completed"
          ).length;

          intervalsCompliance = {
            expected: intervalStructure.count,
            completed: completedCount,
            score: Math.round(intervalScoreSum / intervalStructure.count),
            targetDurationSec: intervalStructure.durationSec,
            targetZone,
            intervals: intervalResults,
          };
        }
      }
    } catch {
      // Ignore stream fetch errors, intervals will be null
    }
  }

  // Calculate weighted score
  // Weights adjust based on what's available
  let totalWeight = 0;
  let weightedSum = 0;

  // If intervals are present, they take higher priority
  if (intervalsCompliance !== null) {
    // Intervals: 50% weight when present
    weightedSum += intervalsCompliance.score * 0.5;
    totalWeight += 0.5;

    // Duration: 20% weight
    if (durationScore !== null) {
      weightedSum += durationScore * 0.2;
      totalWeight += 0.2;
    }

    // HR Zone (overall): 10% weight
    if (hrZoneScore !== null) {
      weightedSum += hrZoneScore * 0.1;
      totalWeight += 0.1;
    }
  } else {
    // Standard weights without intervals
    // Duration: 40% weight
    if (durationScore !== null) {
      weightedSum += durationScore * 0.4;
      totalWeight += 0.4;
    }

    // HR Zone: 40% weight
    if (hrZoneScore !== null) {
      weightedSum += hrZoneScore * 0.4;
      totalWeight += 0.4;
    }
  }

  // Activity done: 20% weight (always)
  weightedSum += activityDoneScore * 0.2;
  totalWeight += 0.2;

  const finalScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  return {
    score: finalScore,
    breakdown: {
      duration: durationScore,
      durationRatio,
      hrZone: hrZoneScore,
      hrDetails,
      intervals: intervalsCompliance,
      activityDone: activityDoneScore,
    },
  };
}

export default async function handler(request: Request, _context: Context) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return handleCorsPreFlight();
  }

  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);

  // Check if this is a link/unlink request: /api/training-plans/:id/link or /unlink
  const isLinkRequest =
    pathParts.length >= 3 &&
    pathParts[pathParts.length - 1] === "link";
  const isUnlinkRequest =
    pathParts.length >= 3 &&
    pathParts[pathParts.length - 1] === "unlink";

  if (request.method === "PATCH" && (isLinkRequest || isUnlinkRequest)) {
    return withAuth(request, async (req, _accessToken, newCookies) => {
      try {
        const cookieHeader = req.headers.get("cookie");
        const { athleteId } = parseTokensFromCookies(cookieHeader);

        if (!athleteId) {
          return jsonResponse({ error: "No athlete ID" }, 400);
        }

        // Extract workout ID from path
        const workoutIdStr = pathParts[pathParts.length - 2];
        const workoutId = parseInt(workoutIdStr, 10);

        if (isNaN(workoutId)) {
          return jsonResponse({ error: "Invalid workout ID" }, 400);
        }

        // Verify workout belongs to this athlete
        const workout = await getTrainingWorkoutById(workoutId);
        if (!workout || workout.athlete_id !== athleteId) {
          return jsonResponse({ error: "Workout not found" }, 404);
        }

        if (isUnlinkRequest) {
          // Unlink activity
          const updated = await unlinkActivityFromWorkout(workoutId);
          return jsonResponseWithCookies(
            { success: true, workout: updated },
            newCookies
          );
        } else {
          // Link activity
          const body = await req.json();
          const activityId = body.activityId;

          if (!activityId || typeof activityId !== "number") {
            return jsonResponse({ error: "Activity ID required" }, 400);
          }

          const updated = await linkActivityToWorkout(
            workoutId,
            activityId,
            true // manual link
          );
          return jsonResponseWithCookies(
            { success: true, workout: updated },
            newCookies
          );
        }
      } catch (error) {
        console.error("Link/unlink error:", error);
        return jsonResponse({ error: "Operation failed" }, 500);
      }
    });
  }

  // GET: Fetch workouts for a week
  if (request.method === "GET") {
    return withAuth(request, async (req, _accessToken, newCookies) => {
      try {
        const cookieHeader = req.headers.get("cookie");
        const { athleteId } = parseTokensFromCookies(cookieHeader);

        if (!athleteId) {
          return jsonResponse({ error: "No athlete ID" }, 400);
        }

        const weekParam = url.searchParams.get("week");
        if (!weekParam) {
          return jsonResponse(
            { error: "Week parameter required (YYYY-MM-DD)" },
            400
          );
        }

        // Get workouts for the week
        const workouts = await getTrainingWorkoutsForWeek(athleteId, weekParam);

        // Get activities for the week (for matching)
        // Calculate week end using local date arithmetic
        const [year, month, day] = weekParam.split("-").map(Number);
        const weekEndDate = new Date(year, month - 1, day + 7);
        const weekEndStr = `${weekEndDate.getFullYear()}-${String(weekEndDate.getMonth() + 1).padStart(2, "0")}-${String(weekEndDate.getDate()).padStart(2, "0")}`;

        const activities = await getActivitiesForDateRange(
          athleteId,
          weekParam,
          weekEndStr
        );

        // Get athlete's HR zones for compliance calculation
        const athleteZones = await getAthleteZones(athleteId);
        const hrZones = athleteZones?.heart_rate_zones as HRZoneRange[] | null;

        // Auto-match activities to workouts
        const matches = autoMatchActivities(workouts, activities);

        // Calculate compliance scores
        const workoutsWithMatches = await Promise.all(
          workouts.map(async (workout) => {
            const matchedActivity = matches.get(workout.id) || null;
            const compliance = await calculateCompliance(
              workout,
              matchedActivity,
              hrZones
            );

            return {
              ...workout,
              // Format workout_date as YYYY-MM-DD string to avoid timezone shift during JSON serialization
              // PostgreSQL DATE comes back as midnight in server's local TZ, which shifts when serialized to UTC
              workout_date: formatDateString(workout.workout_date),
              matched_activity: matchedActivity
                ? {
                    id: matchedActivity.id,
                    data: matchedActivity.data,
                  }
                : null,
              compliance,
            };
          })
        );

        // Also return unmatched activities for manual linking
        const matchedActivityIds = new Set(
          workoutsWithMatches
            .filter((w) => w.matched_activity)
            .map((w) => w.matched_activity!.id)
        );

        const unmatchedActivities = activities
          .filter((a) => !matchedActivityIds.has(a.id))
          .map((a) => ({
            id: a.id,
            data: a.data,
          }));

        return jsonResponseWithCookies(
          {
            workouts: workoutsWithMatches,
            unmatchedActivities,
            weekStart: weekParam,
          },
          newCookies
        );
      } catch (error) {
        console.error("GET training plans error:", error);
        return jsonResponse({ error: "Failed to fetch training plans" }, 500);
      }
    });
  }

  // POST: Import training plan from markdown
  if (request.method === "POST") {
    return withAuth(request, async (req, _accessToken, newCookies) => {
      try {
        const cookieHeader = req.headers.get("cookie");
        const { athleteId } = parseTokensFromCookies(cookieHeader);

        if (!athleteId) {
          return jsonResponse({ error: "No athlete ID" }, 400);
        }

        const body = await req.json();
        const { markdown, referenceDate } = body;

        if (!markdown || typeof markdown !== "string") {
          return jsonResponse({ error: "Markdown content required" }, 400);
        }

        // Parse the markdown table
        const parsed = parseTrainingPlanTable(markdown);

        if (parsed.workouts.length === 0) {
          return jsonResponse(
            {
              error: "No workouts found in table",
              parseErrors: parsed.errors,
            },
            400
          );
        }

        // Convert to DB format - use the reference date (which should be the Monday of the week)
        const refDate = referenceDate ? parseLocalDate(referenceDate) : new Date();
        const dbWorkouts = convertToDbWorkouts(parsed, athleteId, refDate);

        // Upsert workouts
        const count = await upsertTrainingWorkoutsBatch(dbWorkouts);

        return jsonResponseWithCookies(
          {
            success: true,
            imported: count,
            workouts: dbWorkouts,
            parseErrors: parsed.errors,
          },
          newCookies
        );
      } catch (error) {
        console.error("POST training plans error:", error);
        return jsonResponse({ error: "Failed to import training plan" }, 500);
      }
    });
  }

  // DELETE: Clear workouts for a week
  if (request.method === "DELETE") {
    return withAuth(request, async (req, _accessToken, newCookies) => {
      try {
        const cookieHeader = req.headers.get("cookie");
        const { athleteId } = parseTokensFromCookies(cookieHeader);

        if (!athleteId) {
          return jsonResponse({ error: "No athlete ID" }, 400);
        }

        const weekParam = url.searchParams.get("week");
        if (!weekParam) {
          return jsonResponse(
            { error: "Week parameter required (YYYY-MM-DD)" },
            400
          );
        }

        const deleted = await deleteTrainingWorkoutsForWeek(
          athleteId,
          weekParam
        );

        return jsonResponseWithCookies(
          { success: true, deleted },
          newCookies
        );
      } catch (error) {
        console.error("DELETE training plans error:", error);
        return jsonResponse({ error: "Failed to delete training plans" }, 500);
      }
    });
  }

  // Method not allowed
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(),
    },
  });
}

