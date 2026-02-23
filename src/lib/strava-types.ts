// Strava API Types

export interface Athlete {
  id: number;
  username: string | null;
  resource_state: number;
  firstname: string;
  lastname: string;
  bio: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  sex: "M" | "F" | null;
  premium: boolean;
  summit: boolean;
  created_at: string;
  updated_at: string;
  badge_type_id: number;
  weight: number | null;
  profile_medium: string;
  profile: string;
  follower_count: number;
  friend_count: number;
  measurement_preference: "feet" | "meters";
  ftp: number | null;
}

export interface AthleteStats {
  biggest_ride_distance: number | null;
  biggest_climb_elevation_gain: number | null;
  recent_ride_totals: ActivityTotal;
  recent_run_totals: ActivityTotal;
  recent_swim_totals: ActivityTotal;
  ytd_ride_totals: ActivityTotal;
  ytd_run_totals: ActivityTotal;
  ytd_swim_totals: ActivityTotal;
  all_ride_totals: ActivityTotal;
  all_run_totals: ActivityTotal;
  all_swim_totals: ActivityTotal;
}

export interface ActivityTotal {
  count: number;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  elevation_gain: number;
  achievement_count?: number;
}

export interface Activity {
  id: number;
  resource_state: number;
  athlete: {
    id: number;
    resource_state: number;
  };
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  type: ActivityType;
  sport_type: string;
  workout_type: number | null;
  start_date: string;
  start_date_local: string;
  timezone: string;
  utc_offset: number;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  achievement_count: number;
  kudos_count: number;
  comment_count: number;
  athlete_count: number;
  photo_count: number;
  map: {
    id: string;
    summary_polyline: string | null;
    resource_state: number;
  };
  trainer: boolean;
  commute: boolean;
  manual: boolean;
  private: boolean;
  visibility: "everyone" | "followers_only" | "only_me";
  flagged: boolean;
  gear_id: string | null;
  start_latlng: [number, number] | null;
  end_latlng: [number, number] | null;
  average_speed: number;
  max_speed: number;
  average_cadence?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  kilojoules?: number;
  device_watts?: boolean;
  has_heartrate: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  heartrate_opt_out: boolean;
  display_hide_heartrate_option: boolean;
  elev_high?: number;
  elev_low?: number;
  upload_id: number | null;
  upload_id_str: string | null;
  external_id: string | null;
  from_accepted_tag: boolean;
  pr_count: number;
  total_photo_count: number;
  has_kudoed: boolean;
  suffer_score?: number;
  perceived_exertion?: number; // 0-10 scale, athlete's subjective rating
  laps?: Lap[];
}

export interface Lap {
  id: number;
  resource_state: number;
  name: string;
  activity: {
    id: number;
  };
  athlete: {
    id: number;
  };
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  start_date_local: string;
  distance: number;
  start_index: number;
  end_index: number;
  total_elevation_gain: number;
  average_speed: number;
  max_speed: number;
  average_cadence?: number;
  device_watts?: boolean;
  average_watts?: number;
  lap_index: number;
  split: number;
  average_heartrate?: number;
  max_heartrate?: number;
  pace_zone?: number;
}

export type ActivityType =
  | "AlpineSki"
  | "BackcountrySki"
  | "Canoeing"
  | "Crossfit"
  | "EBikeRide"
  | "Elliptical"
  | "Golf"
  | "Handcycle"
  | "Hike"
  | "IceSkate"
  | "InlineSkate"
  | "Kayaking"
  | "Kitesurf"
  | "NordicSki"
  | "Ride"
  | "RockClimbing"
  | "RollerSki"
  | "Rowing"
  | "Run"
  | "Sail"
  | "Skateboard"
  | "Snowboard"
  | "Snowshoe"
  | "Soccer"
  | "StairStepper"
  | "StandUpPaddling"
  | "Surfing"
  | "Swim"
  | "Velomobile"
  | "VirtualRide"
  | "VirtualRun"
  | "Walk"
  | "WeightTraining"
  | "Wheelchair"
  | "Windsurf"
  | "Workout"
  | "Yoga";

// OAuth Types
export interface StravaTokenResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete: Athlete;
}

export interface StravaRefreshResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
}

// API Response Types for our endpoints
export interface AuthUrlResponse {
  url: string;
}

export interface AuthStatus {
  authenticated: boolean;
  athlete?: Pick<Athlete, "id" | "firstname" | "lastname" | "profile">;
}

// Heart Rate Zone Types
export interface HeartRateZoneRange {
  min: number;
  max: number;
}

export interface HeartRateZones {
  custom_zones: boolean;
  zones: HeartRateZoneRange[];
}

// Power Zone Types
export interface PowerZoneRange {
  min: number;
  max: number;
}

export interface PowerZones {
  zones: PowerZoneRange[];
}

// Combined Athlete Zones
export interface AthleteZones {
  heart_rate: HeartRateZones | null;
  power: PowerZones | null;
}

export interface AthleteZonesResponse {
  zones: AthleteZones;
  cached: boolean;
  stale?: boolean;
  updated_at: string;
}

// Activity Stream Types (time-series data)
export interface StreamData {
  data: number[];
  series_type?: string;
  original_size?: number;
  resolution?: string;
}

export interface ActivityStreams {
  time?: StreamData;
  heartrate?: StreamData;
  watts?: StreamData;
  cadence?: StreamData;
  distance?: StreamData;
  altitude?: StreamData;
  velocity_smooth?: StreamData;
}

export interface ActivityStreamsMap {
  [activityId: number]: ActivityStreams;
}

export interface ActivityStreamsResponse {
  streams: ActivityStreamsMap;
  count: number;
}

// Zone Distribution Types (computed from streams)
export interface ZoneTimeData {
  zone: number;
  label: string;
  seconds: number;
  percentage: number;
  color: string;
}

export interface ActivityZoneBreakdown {
  activityId: number;
  activityName: string;
  date: string;
  totalSeconds: number;
  hrZones: ZoneTimeData[];
  powerZones?: ZoneTimeData[];
}

// Training Plan Types
export interface TrainingWorkout {
  id: number;
  athlete_id: number;
  workout_date: string; // YYYY-MM-DD
  session_name: string;
  duration_target_minutes: number | null;
  intensity_target: string | null;
  notes: string | null;
  matched_activity_id: number | null;
  is_manually_linked: boolean;
  created_at: string;
  updated_at: string;
}

// Interval compliance types
export interface IntervalResult {
  index: number; // 1, 2, 3...
  durationSec: number; // Actual duration
  targetDurationSec: number;
  avgHR: number;
  avgPower?: number; // Average power for the interval
  targetZone: number;
  status: "completed" | "too_short" | "too_long" | "wrong_zone" | "missing";
  lapIndex?: number; // If mapped from a lap, which lap index
}

export interface IntervalCompliance {
  expected: number; // e.g., 3
  completed: number; // e.g., 2
  score: number; // 0-100
  targetDurationSec: number;
  targetZone: number;
  source: "laps" | "hr_detection" | "power_detection"; // Indicates if data comes from laps, HR detection, or power detection
  intervals: IntervalResult[];
}

export interface ComplianceBreakdown {
  duration: number | null;
  durationRatio: number | null; // Actual/target ratio
  hrZone: number | null;
  hrDetails: {
    actualAvg: number;
    targetZone: number; // 1-5 zone index
    targetMin: number;
    targetMax: number;
    direction: "on_target" | "too_low" | "too_high";
  } | null;
  powerZone: number | null;
  powerDetails: {
    actualAvg: number;
    targetZone: number; // 1-5 zone index (or 0 if using explicit watts)
    targetMin: number;
    targetMax: number;
    direction: "on_target" | "too_low" | "too_high";
  } | null;
  intervals: IntervalCompliance | null; // Interval structure compliance
  activityDone: number;
}

export interface ComplianceScore {
  score: number;
  breakdown: ComplianceBreakdown;
}

export interface TrainingWorkoutWithMatch extends TrainingWorkout {
  matched_activity: {
    id: number;
    data: Activity;
  } | null;
  compliance: ComplianceScore;
}

export interface UnmatchedActivity {
  id: number;
  data: Activity;
}

export interface TrainingPlanResponse {
  workouts: TrainingWorkoutWithMatch[];
  unmatchedActivities: UnmatchedActivity[];
  weekStart: string;
}

export interface ImportPlanResponse {
  success: boolean;
  imported: number;
  workouts: Array<{
    athlete_id: number;
    workout_date: string;
    session_name: string;
    duration_target_minutes: number | null;
    intensity_target: string | null;
    notes: string | null;
  }>;
  parseErrors: string[];
}

export interface LinkActivityResponse {
  success: boolean;
  workout: TrainingWorkout;
}

export interface DeletePlanResponse {
  success: boolean;
  deleted: number;
}

export interface WeeklyReport {
  id: number;
  athlete_id: number;
  week_start: string;
  title: string;
  markdown: string;
  created_at: string;
  updated_at: string;
}

export interface WeeklyReportResponse {
  report: WeeklyReport | null;
}

export interface SaveWeeklyReportResponse {
  report: WeeklyReport;
}
