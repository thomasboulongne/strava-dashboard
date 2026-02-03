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
  getLapsForActivity,
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
  trainer: ["VirtualRide", "Ride"],
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
  activities: DbActivity[],
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
        (a) => a.id === workout.matched_activity_id,
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
  recovery: 1,
  "very easy": 1,
  z1: 1,
  "zone 1": 1,
  // Zone 2 - Endurance
  easy: 2,
  endurance: 2,
  z2: 2,
  "zone 2": 2,
  aerobic: 2,
  // Zone 3 - Tempo
  tempo: 3,
  moderate: 3,
  z3: 3,
  "zone 3": 3,
  controlled: 3,
  // Zone 4 - Threshold
  threshold: 4,
  hard: 4,
  z4: 4,
  "zone 4": 4,
  lactate: 4,
  "sweet spot": 4,
  // Zone 5 - VO2max
  vo2: 5,
  vo2max: 5,
  max: 5,
  z5: 5,
  "zone 5": 5,
  anaerobic: 5,
};

// Power zone mappings (same 1-5 zones for power)
const POWER_KEYWORD_TO_ZONE: Record<string, number> = {
  // Zone 1 - Active Recovery (< 55% FTP)
  recovery: 1,
  "very easy": 1,
  "active recovery": 1,
  // Zone 2 - Endurance (56-75% FTP)
  easy: 2,
  endurance: 2,
  aerobic: 2,
  z2: 2,
  "zone 2": 2,
  // Zone 3 - Tempo (76-90% FTP)
  tempo: 3,
  moderate: 3,
  z3: 3,
  "zone 3": 3,
  controlled: 3,
  // Zone 4 - Threshold (91-105% FTP)
  threshold: 4,
  ftp: 4,
  "sweet spot": 4,
  z4: 4,
  "zone 4": 4,
  // Zone 5 - VO2max (106-120% FTP)
  vo2: 5,
  vo2max: 5,
  z5: 5,
  "zone 5": 5,
  // Zone 6-7 can map to Zone 5 for simplicity
  anaerobic: 5,
  neuromuscular: 5,
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
 * Parse power target from intensity string
 * Returns { min, max } watts or zone number, or null if unable to parse
 */
function parsePowerTarget(
  intensityTarget: string,
):
  | { type: "watts"; min: number; max: number }
  | { type: "zone"; zone: number }
  | null {
  const lower = intensityTarget.toLowerCase();

  // Check for explicit wattage ranges (e.g., "200-220W", "180-200 watts", "250W")
  const wattsRangeMatch = lower.match(/(\d+)\s*[-–]\s*(\d+)\s*w(?:atts?)?/i);
  if (wattsRangeMatch) {
    const min = parseInt(wattsRangeMatch[1], 10);
    const max = parseInt(wattsRangeMatch[2], 10);
    if (min > 0 && max > min && max < 2000) {
      // Sanity check
      return { type: "watts", min, max };
    }
  }

  // Check for single wattage (e.g., "200W", "@ 250 watts")
  const singleWattsMatch = lower.match(/(\d+)\s*w(?:atts?)?/i);
  if (singleWattsMatch) {
    const watts = parseInt(singleWattsMatch[1], 10);
    if (watts > 0 && watts < 2000) {
      // Allow ±5% tolerance
      return {
        type: "watts",
        min: Math.round(watts * 0.95),
        max: Math.round(watts * 1.05),
      };
    }
  }

  // Check for FTP percentage (e.g., "85% FTP", "@ 90%")
  const ftpMatch = lower.match(/(\d+)%(?:\s*ftp)?/i);
  if (ftpMatch) {
    const percentage = parseInt(ftpMatch[1], 10);
    // Map FTP percentage to zone (rough approximation)
    // Zone 1: <55%, Zone 2: 56-75%, Zone 3: 76-90%, Zone 4: 91-105%, Zone 5: >105%
    if (percentage < 55) return { type: "zone", zone: 1 };
    if (percentage <= 75) return { type: "zone", zone: 2 };
    if (percentage <= 90) return { type: "zone", zone: 3 };
    if (percentage <= 105) return { type: "zone", zone: 4 };
    return { type: "zone", zone: 5 };
  }

  // Check for explicit zone mentions
  const zoneMatch = lower.match(/z(?:one\s*)?(\d)/i);
  if (zoneMatch) {
    const zone = parseInt(zoneMatch[1], 10);
    if (zone >= 1 && zone <= 7)
      return { type: "zone", zone: Math.min(zone, 5) }; // Cap at zone 5
  }

  // Check keyword mappings
  for (const [keyword, zone] of Object.entries(POWER_KEYWORD_TO_ZONE)) {
    if (lower.includes(keyword)) {
      return { type: "zone", zone };
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
  recoveryDurationSec?: number; // Optional recovery time between intervals
}

/**
 * Parse interval structure from text (e.g., "3x10min tempo", "6x1' hard", "4x5mins Z4")
 * Searches session_name, notes, and intensity_target fields
 */
function parseIntervalStructure(
  sessionName: string,
  notes: string | null,
  intensityTarget: string | null,
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
        if (unit.includes("sec") || unit === '"' || unit === "″") {
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

        // Try to parse recovery time from the same text
        // Patterns: "/ 3min recovery", "with 2min rest", "(3min recovery)", "/ 2min easy"
        let recoveryDurationSec: number | undefined = undefined;

        const recoveryPatterns = [
          // "/ 3min recovery" or "/ 3min rest" or "/ 3min easy"
          /\/\s*(\d+)\s*(min(?:ute)?s?|sec(?:ond)?s?|['′"])\s*(?:recovery|rest|easy)?/i,
          // "with 3min recovery" or "with 3min rest"
          /with\s+(\d+)\s*(min(?:ute)?s?|sec(?:ond)?s?|['′"])\s*(?:recovery|rest|easy)?/i,
          // "(3min recovery)" or "(3min rest)"
          /\(\s*(\d+)\s*(min(?:ute)?s?|sec(?:ond)?s?|['′"])\s*(?:recovery|rest|easy)?\s*\)/i,
        ];

        for (const recoveryPattern of recoveryPatterns) {
          const recoveryMatch = text.match(recoveryPattern);
          if (recoveryMatch) {
            const recoveryDuration = parseInt(recoveryMatch[1], 10);
            const recoveryUnit = recoveryMatch[2]?.toLowerCase() || "";

            // Convert to seconds
            if (
              recoveryUnit.includes("sec") ||
              recoveryUnit === '"' ||
              recoveryUnit === "″"
            ) {
              recoveryDurationSec = recoveryDuration;
            } else {
              // Default to minutes
              recoveryDurationSec = recoveryDuration * 60;
            }

            // Validate reasonable recovery time (10 sec to 30 min)
            if (recoveryDurationSec < 10 || recoveryDurationSec > 1800) {
              recoveryDurationSec = undefined;
            }
            break;
          }
        }

        // Validate reasonable values
        if (
          count >= 1 &&
          count <= 20 &&
          durationSec >= 10 &&
          durationSec <= 3600
        ) {
          return {
            count,
            durationSec,
            targetZone,
            rawText: match[0],
            recoveryDurationSec,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Detected interval from stream analysis (HR or power)
 */
interface DetectedInterval {
  startSec: number;
  endSec: number;
  durationSec: number;
  avgHR: number;
  maxHR: number;
  avgPower?: number;
  maxPower?: number;
  zone: number; // 1-5 based on where avgHR or avgPower falls
  basedOn: 'hr' | 'power'; // Which metric was used for detection
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
  minDurationSec: number, // Minimum interval duration to detect
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
              basedOn: 'hr',
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
        basedOn: 'hr',
      });
    }
  }

  return intervals;
}

/**
 * Detect intervals from power stream data
 * Looks for sustained periods where power is in or above the target zone
 */
function detectIntervalsFromPower(
  timeData: number[], // Elapsed seconds array
  powerData: number[], // Power values array
  powerZones: Array<{ min: number; max: number }>,
  targetZone: number, // 1-5
  minDurationSec: number, // Minimum interval duration to detect
  hrData?: number[], // Optional HR data to include in results
): DetectedInterval[] {
  if (timeData.length !== powerData.length || timeData.length === 0) {
    return [];
  }

  const intervals: DetectedInterval[] = [];
  const zoneIndex = targetZone - 1;

  if (zoneIndex < 0 || zoneIndex >= powerZones.length) {
    return [];
  }

  const targetMin = powerZones[zoneIndex].min;

  // Hysteresis: require 10W below min to exit, allow 10W tolerance for entry
  const entryThreshold = targetMin - 10;
  const exitThreshold = targetMin - 20;

  // Minimum time to consider as entering an interval (avoid noise)
  const minEntryTime = 10; // seconds

  // Skip warm-up (first 5 minutes) for interval detection
  const warmupEndSec = 300;

  let inInterval = false;
  let intervalStart = 0;
  let intervalPowerSum = 0;
  let intervalPowerCount = 0;
  let intervalMaxPower = 0;
  let intervalHRSum = 0;
  let intervalHRCount = 0;
  let intervalMaxHR = 0;
  let consecutiveAboveThreshold = 0;
  let consecutiveBelowThreshold = 0;

  for (let i = 0; i < timeData.length; i++) {
    const time = timeData[i];
    const power = powerData[i];
    const hr = hrData?.[i];

    // Skip warm-up period
    if (time < warmupEndSec) continue;

    if (!inInterval) {
      // Looking to start an interval
      if (power >= entryThreshold) {
        consecutiveAboveThreshold++;
        if (consecutiveAboveThreshold >= minEntryTime) {
          // Start interval
          inInterval = true;
          intervalStart = time - minEntryTime;
          intervalPowerSum = power * minEntryTime;
          intervalPowerCount = minEntryTime;
          intervalMaxPower = power;
          if (hr !== undefined) {
            intervalHRSum = hr * minEntryTime;
            intervalHRCount = minEntryTime;
            intervalMaxHR = hr;
          }
          consecutiveBelowThreshold = 0;
        }
      } else {
        consecutiveAboveThreshold = 0;
      }
    } else {
      // In an interval, accumulate data
      intervalPowerSum += power;
      intervalPowerCount++;
      intervalMaxPower = Math.max(intervalMaxPower, power);

      if (hr !== undefined) {
        intervalHRSum += hr;
        intervalHRCount++;
        intervalMaxHR = Math.max(intervalMaxHR, hr);
      }

      if (power < exitThreshold) {
        consecutiveBelowThreshold++;
        // Exit interval after 10 seconds below threshold
        if (consecutiveBelowThreshold >= 10) {
          const endTime = time - 10;
          const durationSec = endTime - intervalStart;

          // Only record if meets minimum duration (at least 50% of target)
          if (durationSec >= minDurationSec * 0.5) {
            const avgPower = Math.round(intervalPowerSum / intervalPowerCount);

            // Determine which zone the avgPower falls into
            let actualZone = 1;
            for (let z = powerZones.length - 1; z >= 0; z--) {
              if (avgPower >= powerZones[z].min) {
                actualZone = z + 1;
                break;
              }
            }

            intervals.push({
              startSec: intervalStart,
              endSec: endTime,
              durationSec,
              avgHR: intervalHRCount > 0 ? Math.round(intervalHRSum / intervalHRCount) : 0,
              maxHR: intervalMaxHR,
              avgPower,
              maxPower: intervalMaxPower,
              zone: actualZone,
              basedOn: 'power',
            });
          }

          inInterval = false;
          consecutiveAboveThreshold = 0;
          consecutiveBelowThreshold = 0;
          intervalPowerSum = 0;
          intervalPowerCount = 0;
          intervalMaxPower = 0;
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
  if (inInterval && intervalPowerCount > 0) {
    const endTime = timeData[timeData.length - 1];
    const durationSec = endTime - intervalStart;

    if (durationSec >= minDurationSec * 0.5) {
      const avgPower = Math.round(intervalPowerSum / intervalPowerCount);

      let actualZone = 1;
      for (let z = powerZones.length - 1; z >= 0; z--) {
        if (avgPower >= powerZones[z].min) {
          actualZone = z + 1;
          break;
        }
      }

      intervals.push({
        startSec: intervalStart,
        endSec: endTime,
        durationSec,
        avgHR: intervalHRCount > 0 ? Math.round(intervalHRSum / intervalHRCount) : 0,
        maxHR: intervalMaxHR,
        avgPower,
        maxPower: intervalMaxPower,
        zone: actualZone,
        basedOn: 'power',
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
  source: "laps" | "hr_detection" | "power_detection"; // Indicates if data comes from laps, HR detection, or power detection
  intervals: Array<{
    index: number;
    durationSec: number;
    targetDurationSec: number;
    avgHR: number;
    avgPower?: number; // Average power for the interval (if available)
    targetZone: number;
    status: "completed" | "too_short" | "too_long" | "wrong_zone" | "missing";
    lapIndex?: number; // If mapped from a lap, which lap index
  }>;
}

/**
 * Determine if a lap is likely a recovery lap based on heuristics
 */
function isRecoveryLap(
  lapData: {
    elapsed_time?: number;
    moving_time?: number;
    average_heartrate?: number;
    average_watts?: number;
  },
  expectedIntervalDurationSec: number,
  targetZone: number,
  hrZones: HRZoneRange[],
  powerZones: Array<{ min: number; max: number }> | null,
): boolean {
  const durationSec = lapData.moving_time || lapData.elapsed_time || 0;
  const avgHR = lapData.average_heartrate || 0;
  const avgPower = lapData.average_watts;

  // Heuristic 1: Short duration (less than 50% of expected interval duration)
  const isShort = durationSec < expectedIntervalDurationSec * 0.5;

  // Heuristic 2: Low heart rate (in zone 1 or 2, or below target zone threshold)
  let isLowHR = false;
  if (avgHR > 0 && hrZones.length >= 5) {
    // Check if HR is in recovery zones (Zone 1 or 2)
    const zone2Max = hrZones[1]?.max || 0;
    if (avgHR <= zone2Max) {
      isLowHR = true;
    } else {
      // Check if HR is significantly below target zone (at least 2 zones below)
      const targetZoneIndex = targetZone - 1;
      if (targetZoneIndex >= 2) {
        const twoZonesBelowMax = hrZones[targetZoneIndex - 2]?.max || 0;
        if (avgHR <= twoZonesBelowMax) {
          isLowHR = true;
        }
      }
    }
  }

  // Heuristic 3: Low power (in zone 1 or 2, if power data available)
  let isLowPower = false;
  if (avgPower && powerZones && powerZones.length >= 5) {
    const zone2Max = powerZones[1]?.max || 0;
    if (avgPower <= zone2Max) {
      isLowPower = true;
    }
  }

  // Consider it a recovery lap if it's short AND (low HR OR low power)
  // Or if it has both low HR and low power (even if not that short)
  return (isShort && (isLowHR || isLowPower)) || (isLowHR && isLowPower);
}

/**
 * Map activity laps to interval structure when intervals are detected
 * This is used when the workout has an interval structure (e.g., "3x10min")
 * and we want to see if the laps match up with the expected intervals
 */
async function mapLapsToIntervals(
  activityId: number,
  expectedCount: number,
  expectedDurationSec: number,
  targetZone: number,
  hrZones: HRZoneRange[],
  powerZones: Array<{ min: number; max: number }> | null,
): Promise<IntervalComplianceResult | null> {
  try {
    // Fetch laps for this activity
    const laps = await getLapsForActivity(activityId);

    if (laps.length === 0) {
      return null; // No laps available
    }

    // Skip first lap if it looks like a warm-up (typically longer and easier)
    // Common pattern: warm-up lap, then interval laps (with recovery), then cool-down
    let workingLaps = laps;

    // If we have more laps than expected intervals, try to identify warm-up/cool-down
    if (laps.length > expectedCount) {
      // Simple heuristic: skip first lap if it's significantly longer than expected interval
      const firstLapData = laps[0].data as {
        elapsed_time?: number;
        moving_time?: number;
        average_heartrate?: number;
        average_watts?: number;
      };
      const firstLapDuration =
        firstLapData.elapsed_time || laps[0].elapsed_time;

      if (firstLapDuration > expectedDurationSec * 1.5) {
        // First lap is likely warm-up
        workingLaps = laps.slice(1);
      }

      // Also skip last lap if we still have too many and it looks like cool-down
      if (workingLaps.length > expectedCount) {
        const lastLap = workingLaps[workingLaps.length - 1];
        const lastLapData = lastLap.data as {
          elapsed_time?: number;
          moving_time?: number;
          average_heartrate?: number;
          average_watts?: number;
        };
        const lastLapDuration =
          lastLapData.elapsed_time || lastLap.elapsed_time;

        if (lastLapDuration > expectedDurationSec * 1.5) {
          workingLaps = workingLaps.slice(0, -1);
        }
      }
    }

    // Filter out recovery laps intelligently
    // We expect intervals to potentially have recovery laps between them
    const intervalLaps: typeof laps = [];

    for (const lap of workingLaps) {
      const lapData = lap.data as {
        elapsed_time?: number;
        moving_time?: number;
        average_heartrate?: number;
        average_watts?: number;
      };

      // Check if this lap is a recovery lap
      if (
        isRecoveryLap(
          lapData,
          expectedDurationSec,
          targetZone,
          hrZones,
          powerZones,
        )
      ) {
        // Skip recovery laps
        continue;
      }

      intervalLaps.push(lap);

      // Stop once we have enough interval laps
      if (intervalLaps.length >= expectedCount) {
        break;
      }
    }

    // Use the filtered interval laps for analysis
    const lapsToAnalyze = intervalLaps;

    const intervalResults: IntervalComplianceResult["intervals"] = [];
    let intervalScoreSum = 0;

    for (let i = 0; i < expectedCount; i++) {
      const lap = lapsToAnalyze[i];

      if (!lap) {
        // Missing interval
        intervalResults.push({
          index: i + 1,
          durationSec: 0,
          targetDurationSec: expectedDurationSec,
          avgHR: 0,
          targetZone,
          status: "missing",
        });
        // 0 points for missing
      } else {
        const lapData = lap.data as {
          elapsed_time?: number;
          moving_time?: number;
          average_heartrate?: number;
          average_watts?: number;
        };

        const durationSec =
          lapData.moving_time || lapData.elapsed_time || lap.moving_time;
        const avgHR = lapData.average_heartrate || 0;
        const avgPower = lapData.average_watts;

        // Determine which zone the lap falls into
        // Prioritize power zones when power data is available
        let actualZone = 1;

        if (avgPower && powerZones && powerZones.length >= 5) {
          // Use power zones
          for (let z = powerZones.length - 1; z >= 0; z--) {
            if (avgPower >= powerZones[z].min) {
              actualZone = z + 1;
              break;
            }
          }
        } else if (avgHR > 0 && hrZones.length >= 5) {
          // Fall back to HR zones
          for (let z = hrZones.length - 1; z >= 0; z--) {
            if (avgHR >= hrZones[z].min) {
              actualZone = z + 1;
              break;
            }
          }
        }

        // Calculate status
        const durationRatio = durationSec / expectedDurationSec;
        const zoneMatch = actualZone === targetZone;
        const zoneClose = Math.abs(actualZone - targetZone) === 1;

        let status: "completed" | "too_short" | "too_long" | "wrong_zone";
        let intervalScore = 0;

        if (zoneMatch && durationRatio >= 0.8 && durationRatio <= 1.2) {
          status = "completed";
          intervalScore = 100;
        } else if (durationRatio < 0.8) {
          status = "too_short";
          intervalScore = zoneMatch ? 70 : zoneClose ? 50 : 30;
        } else if (durationRatio > 1.2) {
          status = "too_long";
          intervalScore = zoneMatch ? 70 : zoneClose ? 50 : 30;
        } else if (!zoneMatch) {
          status = "wrong_zone";
          intervalScore = zoneClose ? 50 : 30;
        } else {
          status = "completed";
          intervalScore = 100;
        }

        intervalResults.push({
          index: i + 1,
          durationSec: Math.round(durationSec),
          targetDurationSec: expectedDurationSec,
          avgHR: Math.round(avgHR),
          avgPower: avgPower ? Math.round(avgPower) : undefined,
          targetZone,
          status,
          lapIndex: lap.lap_index,
        });
        intervalScoreSum += intervalScore;
      }
    }

    const completedCount = intervalResults.filter(
      (r) => r.status === "completed",
    ).length;

    return {
      expected: expectedCount,
      completed: completedCount,
      score: Math.round(intervalScoreSum / expectedCount),
      targetDurationSec: expectedDurationSec,
      targetZone,
      source: "laps",
      intervals: intervalResults,
    };
  } catch (error) {
    console.error("Error mapping laps to intervals:", error);
    return null;
  }
}

/**
 * Calculate compliance score for a workout-activity pair
 */
async function calculateCompliance(
  workout: DbTrainingWorkout,
  activity: DbActivity | null,
  hrZones: HRZoneRange[] | null,
  powerZones: Array<{ min: number; max: number }> | null,
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
    powerZone: number | null;
    powerDetails: {
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
      breakdown: {
        duration: null,
        durationRatio: null,
        hrZone: null,
        hrDetails: null,
        powerZone: null,
        powerDetails: null,
        intervals: null,
        activityDone: 0,
      },
    };
  }

  const data = activity.data as {
    type?: string;
    moving_time?: number;
    average_heartrate?: number;
    average_watts?: number;
    weighted_average_watts?: number;
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
  let powerZoneScore: number | null = null;
  let powerDetails: {
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
      /(\d+)\s*[-–]\s*(\d+)\s*bpm/i,
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
            const lowerBound =
              zoneIndex > 0 ? hrZones[zoneIndex - 1].min : targetMin - 20;
            const upperBound =
              zoneIndex < hrZones.length - 1
                ? hrZones[zoneIndex + 1].max
                : targetMax + 20;

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

  // Power Zone compliance (similar weight to HR Zone)
  if (
    workout.intensity_target &&
    (data.average_watts || data.weighted_average_watts)
  ) {
    const avgPower = data.weighted_average_watts || data.average_watts || 0;

    // Try to parse power target from intensity string
    const powerTarget = parsePowerTarget(workout.intensity_target);

    if (powerTarget?.type === "watts") {
      // Explicit wattage range provided
      const { min: targetMin, max: targetMax } = powerTarget;

      let direction: "on_target" | "too_low" | "too_high" = "on_target";
      if (avgPower < targetMin) {
        direction = "too_low";
      } else if (avgPower > targetMax) {
        direction = "too_high";
      }

      if (avgPower >= targetMin && avgPower <= targetMax) {
        powerZoneScore = 100;
      } else if (avgPower >= targetMin - 20 && avgPower <= targetMax + 20) {
        powerZoneScore = 70;
      } else {
        powerZoneScore = 30;
      }

      powerDetails = {
        actualAvg: Math.round(avgPower),
        targetZone: 0, // Not using zone system
        targetMin,
        targetMax,
        direction,
      };
    } else if (
      powerTarget?.type === "zone" &&
      powerZones &&
      powerZones.length >= 5
    ) {
      // Use athlete's Strava power zones with keyword mapping
      const targetZone = powerTarget.zone;

      // Strava power zones are 0-indexed, but our keywords are 1-indexed
      const zoneIndex = targetZone - 1;
      const zone = powerZones[zoneIndex];

      if (zone) {
        const targetMin = zone.min;
        const targetMax = zone.max;

        let direction: "on_target" | "too_low" | "too_high" = "on_target";
        if (avgPower < targetMin) {
          direction = "too_low";
        } else if (avgPower > targetMax) {
          direction = "too_high";
        }

        // Score based on how well power matches the target zone
        if (avgPower >= targetMin && avgPower <= targetMax) {
          powerZoneScore = 100;
        } else {
          // Check if within adjacent zone (±1 zone)
          const lowerBound =
            zoneIndex > 0 ? powerZones[zoneIndex - 1].min : targetMin - 30;
          const upperBound =
            zoneIndex < powerZones.length - 1
              ? powerZones[zoneIndex + 1].max
              : targetMax + 30;

          if (avgPower >= lowerBound && avgPower <= upperBound) {
            powerZoneScore = 60; // One zone off
          } else {
            powerZoneScore = 30; // More than one zone off
          }
        }

        powerDetails = {
          actualAvg: Math.round(avgPower),
          targetZone,
          targetMin,
          targetMax,
          direction,
        };
      }
    }
  }

  // Interval compliance - parse and analyze interval structure
  const intervalStructure = parseIntervalStructure(
    workout.session_name,
    workout.notes,
    workout.intensity_target,
  );

  if (intervalStructure && hrZones && hrZones.length >= 5) {
    const targetZone = intervalStructure.targetZone ?? 3; // Default to Zone 3 (tempo)

    // Try laps first - they're more reliable if available
    intervalsCompliance = await mapLapsToIntervals(
      activity.id,
      intervalStructure.count,
      intervalStructure.durationSec,
      targetZone,
      hrZones,
      powerZones,
    );

    // Fall back to stream detection if laps aren't available or didn't work
    // Prioritize power detection when power zones and power data are available
    if (!intervalsCompliance) {
      try {
        // Fetch activity streams for detailed analysis
        const streams = await getActivityStreams(activity.id);

        if (streams?.streams) {
          const streamData = streams.streams as {
            time?: { data: number[] };
            heartrate?: { data: number[] };
            watts?: { data: number[] };
          };

          let detectedIntervals: DetectedInterval[] = [];
          let detectionSource: "power_detection" | "hr_detection" = "hr_detection";

          // Try power detection first if power zones and power data are available
          if (
            powerZones &&
            powerZones.length >= 5 &&
            streamData.time?.data &&
            streamData.watts?.data
          ) {
            detectedIntervals = detectIntervalsFromPower(
              streamData.time.data,
              streamData.watts.data,
              powerZones,
              targetZone,
              intervalStructure.durationSec,
              streamData.heartrate?.data, // Include HR data if available
            );
            detectionSource = "power_detection";
          }

          // Fall back to HR detection if power detection didn't work or isn't available
          if (
            detectedIntervals.length === 0 &&
            streamData.time?.data &&
            streamData.heartrate?.data
          ) {
            detectedIntervals = detectIntervals(
              streamData.time.data,
              streamData.heartrate.data,
              hrZones,
              targetZone,
              intervalStructure.durationSec,
            );
            detectionSource = "hr_detection";

            // Calculate average power for each detected interval if power data is available
            if (streamData.watts?.data && streamData.time?.data) {
              for (const interval of detectedIntervals) {
                if (interval) {
                  // Find power values within this interval's time range
                  const powerValues = streamData.watts.data.filter((_, idx) => {
                    const time = streamData.time!.data[idx];
                    return time >= interval.startSec && time <= interval.endSec;
                  });

                  if (powerValues.length > 0) {
                    const avgPower =
                      powerValues.reduce((sum, p) => sum + p, 0) /
                      powerValues.length;
                    interval.avgPower = Math.round(avgPower);
                  }
                }
              }
            }
          }

          // Match detected intervals to expected structure (if we found any)
          if (detectedIntervals.length > 0) {
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
                const durationRatioInt =
                  detected.durationSec / intervalStructure.durationSec;
                const zoneMatch = detected.zone === targetZone;
                const zoneClose = Math.abs(detected.zone - targetZone) === 1;

                let status:
                  | "completed"
                  | "too_short"
                  | "too_long"
                  | "wrong_zone";
                let intervalScore = 0;

                if (
                  zoneMatch &&
                  durationRatioInt >= 0.8 &&
                  durationRatioInt <= 1.2
                ) {
                  status = "completed";
                  intervalScore = 100;
                } else if (durationRatioInt < 0.8) {
                  status = "too_short";
                  intervalScore = zoneMatch ? 70 : zoneClose ? 50 : 30;
                } else if (durationRatioInt > 1.2) {
                  status = "too_long";
                  intervalScore = zoneMatch ? 70 : zoneClose ? 50 : 30;
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
                  avgPower: detected.avgPower,
                  targetZone,
                  status,
                });
                intervalScoreSum += intervalScore;
              }
            }

            const completedCount = intervalResults.filter(
              (r) => r.status === "completed",
            ).length;

            intervalsCompliance = {
              expected: intervalStructure.count,
              completed: completedCount,
              score: Math.round(intervalScoreSum / intervalStructure.count),
              targetDurationSec: intervalStructure.durationSec,
              targetZone,
              source: detectionSource,
              intervals: intervalResults,
            };
          }
        }
      } catch {
        // Ignore stream fetch errors, intervals will be null
      }
    }
  }

  // Calculate weighted score
  // Weights adjust based on what's available
  let totalWeight = 0;
  let weightedSum = 0;

  // If intervals are present, they take dominant priority
  // We ignore overall HR/power averages because they're dragged down by warmup/cooldown/recovery
  if (intervalsCompliance !== null) {
    // Intervals: 70% weight - this is what matters most
    weightedSum += intervalsCompliance.score * 0.7;
    totalWeight += 0.7;

    // Duration: 20% weight - total workout duration still matters
    if (durationScore !== null) {
      weightedSum += durationScore * 0.2;
      totalWeight += 0.2;
    }

    // Activity Done: 10% weight
    weightedSum += activityDoneScore * 0.1;
    totalWeight += 0.1;

    // NOTE: We intentionally ignore hrZoneScore and powerZoneScore when intervals exist
    // because overall averages are meaningless for interval workouts
  } else {
    // Standard weights without intervals
    // Duration: 40% weight
    if (durationScore !== null) {
      weightedSum += durationScore * 0.4;
      totalWeight += 0.4;
    }

    // HR Zone & Power Zone: split the 40% intensity weight
    // If both are available, 20% each. If only one, 40%
    const intensityMetricsCount =
      (hrZoneScore !== null ? 1 : 0) + (powerZoneScore !== null ? 1 : 0);

    if (intensityMetricsCount > 0) {
      const intensityWeight = 0.4 / intensityMetricsCount;

      if (hrZoneScore !== null) {
        weightedSum += hrZoneScore * intensityWeight;
        totalWeight += intensityWeight;
      }

      if (powerZoneScore !== null) {
        weightedSum += powerZoneScore * intensityWeight;
        totalWeight += intensityWeight;
      }
    }

    // Activity done: 20% weight (only for non-interval workouts)
    weightedSum += activityDoneScore * 0.2;
    totalWeight += 0.2;
  }

  const finalScore =
    totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  return {
    score: finalScore,
    breakdown: {
      duration: durationScore,
      durationRatio,
      hrZone: hrZoneScore,
      hrDetails,
      powerZone: powerZoneScore,
      powerDetails,
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
    pathParts.length >= 3 && pathParts[pathParts.length - 1] === "link";
  const isUnlinkRequest =
    pathParts.length >= 3 && pathParts[pathParts.length - 1] === "unlink";

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
            newCookies,
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
            true, // manual link
          );
          return jsonResponseWithCookies(
            { success: true, workout: updated },
            newCookies,
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
            400,
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
          weekEndStr,
        );

        // Get athlete's HR and Power zones for compliance calculation
        const athleteZones = await getAthleteZones(athleteId);
        const hrZones = athleteZones?.heart_rate_zones as HRZoneRange[] | null;
        const powerZones = athleteZones?.power_zones as Array<{
          min: number;
          max: number;
        }> | null;

        // Auto-match activities to workouts
        const matches = autoMatchActivities(workouts, activities);

        // Calculate compliance scores
        const workoutsWithMatches = await Promise.all(
          workouts.map(async (workout) => {
            const matchedActivity = matches.get(workout.id) || null;
            const compliance = await calculateCompliance(
              workout,
              matchedActivity,
              hrZones,
              powerZones,
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
          }),
        );

        // Also return unmatched activities for manual linking
        const matchedActivityIds = new Set(
          workoutsWithMatches
            .filter((w) => w.matched_activity)
            .map((w) => w.matched_activity!.id),
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
          newCookies,
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
            400,
          );
        }

        // Convert to DB format - use the reference date (which should be the Monday of the week)
        const refDate = referenceDate
          ? parseLocalDate(referenceDate)
          : new Date();
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
          newCookies,
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
            400,
          );
        }

        const deleted = await deleteTrainingWorkoutsForWeek(
          athleteId,
          weekParam,
        );

        return jsonResponseWithCookies({ success: true, deleted }, newCookies);
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
