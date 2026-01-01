// Neon Postgres database client and helpers
import { neon, neonConfig } from "@neondatabase/serverless";

// Configure for serverless environment
neonConfig.fetchConnectionCache = true;

// Get database connection
export function getDb() {
  const databaseUrl = process.env.NETLIFY_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("NETLIFY_DATABASE_URL environment variable is not set");
  }
  return neon(databaseUrl);
}

// Type definitions
export interface DbUser {
  id: number; // Strava athlete ID
  username: string | null;
  firstname: string;
  lastname: string;
  profile: string;
  profile_medium: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
  created_at: Date;
  updated_at: Date;
}

export interface DbActivity {
  id: number; // Strava activity ID
  athlete_id: number;
  data: Record<string, unknown>; // Full Strava activity JSON
  start_date: Date;
  created_at: Date;
  updated_at: Date;
}

// Stream types we want to store - easily extensible
export const STREAM_TYPES_TO_FETCH = ["heartrate", "watts"] as const;
export type StreamType =
  | (typeof STREAM_TYPES_TO_FETCH)[number]
  | "time"
  | "distance"
  | "altitude"
  | "velocity_smooth"
  | "cadence"
  | "latlng"
  | "grade_smooth"
  | "temp";

export interface DbActivityStreams {
  activity_id: number;
  athlete_id: number;
  streams: Record<string, unknown>; // JSONB with stream data keyed by type
  stream_types: string[]; // Array of stream types stored
  created_at: Date;
  updated_at: Date;
}

// HR Zone from Strava API
export interface HRZoneRange {
  min: number;
  max: number;
}

// Strava zones response structure
export interface StravaZonesResponse {
  heart_rate?: {
    custom_zones: boolean;
    zones: HRZoneRange[];
  };
  power?: {
    zones: Array<{ min: number; max: number }>;
  };
}

export interface DbAthleteZones {
  athlete_id: number;
  heart_rate_zones: HRZoneRange[] | null;
  heart_rate_custom: boolean;
  power_zones: Array<{ min: number; max: number }> | null;
  created_at: Date;
  updated_at: Date;
}

export type SyncStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "paused";

export interface DbSyncJob {
  id: number;
  athlete_id: number;
  status: SyncStatus;
  current_page: number;
  total_activities_synced: number;
  last_error: string | null;
  started_at: Date;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Schema initialization - run once to set up tables
export async function initializeSchema() {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      username TEXT,
      firstname TEXT NOT NULL,
      lastname TEXT NOT NULL,
      profile TEXT,
      profile_medium TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      token_expires_at BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS activities (
      id BIGINT PRIMARY KEY,
      athlete_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      start_date TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_activities_athlete_id ON activities(athlete_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_activities_start_date ON activities(start_date DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_activities_athlete_date ON activities(athlete_id, start_date DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sync_jobs (
      id SERIAL PRIMARY KEY,
      athlete_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      current_page INTEGER DEFAULT 1,
      total_activities_synced INTEGER DEFAULT 0,
      last_error TEXT,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sync_jobs_athlete_id ON sync_jobs(athlete_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status)
  `;

  // Activity streams table - stores HR, power, and other time-series data
  await sql`
    CREATE TABLE IF NOT EXISTS activity_streams (
      activity_id BIGINT PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
      athlete_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      streams JSONB NOT NULL,
      stream_types TEXT[] NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_activity_streams_athlete_id ON activity_streams(athlete_id)
  `;

  // Athlete zones table - stores HR and power zone definitions from Strava
  await sql`
    CREATE TABLE IF NOT EXISTS athlete_zones (
      athlete_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      heart_rate_zones JSONB,
      heart_rate_custom BOOLEAN DEFAULT false,
      power_zones JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  return { success: true };
}

// User operations
export async function upsertUser(user: {
  id: number;
  username: string | null;
  firstname: string;
  lastname: string;
  profile: string;
  profile_medium: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
}): Promise<DbUser> {
  const sql = getDb();

  const result = await sql`
    INSERT INTO users (id, username, firstname, lastname, profile, profile_medium, access_token, refresh_token, token_expires_at, updated_at)
    VALUES (${user.id}, ${user.username}, ${user.firstname}, ${user.lastname}, ${user.profile}, ${user.profile_medium}, ${user.access_token}, ${user.refresh_token}, ${user.token_expires_at}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username,
      firstname = EXCLUDED.firstname,
      lastname = EXCLUDED.lastname,
      profile = EXCLUDED.profile,
      profile_medium = EXCLUDED.profile_medium,
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      token_expires_at = EXCLUDED.token_expires_at,
      updated_at = NOW()
    RETURNING *
  `;

  return result[0] as DbUser;
}

export async function getUserById(id: number): Promise<DbUser | null> {
  const sql = getDb();
  const result = await sql`SELECT * FROM users WHERE id = ${id}`;
  return (result[0] as DbUser) || null;
}

export async function updateUserTokens(
  id: number,
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE users
    SET access_token = ${accessToken},
        refresh_token = ${refreshToken},
        token_expires_at = ${expiresAt},
        updated_at = NOW()
    WHERE id = ${id}
  `;
}

// Activity operations
export async function upsertActivity(
  activityId: number,
  athleteId: number,
  data: Record<string, unknown>,
  startDate: string
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO activities (id, athlete_id, data, start_date, updated_at)
    VALUES (${activityId}, ${athleteId}, ${JSON.stringify(
    data
  )}, ${startDate}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      data = EXCLUDED.data,
      start_date = EXCLUDED.start_date,
      updated_at = NOW()
  `;
}

export async function upsertActivitiesBatch(
  activities: Array<{
    id: number;
    athlete_id: number;
    data: Record<string, unknown>;
    start_date: string;
  }>
): Promise<number> {
  if (activities.length === 0) return 0;

  const sql = getDb();

  // Build values for batch insert
  const values = activities
    .map(
      (a) =>
        `(${a.id}, ${a.athlete_id}, '${JSON.stringify(a.data).replace(
          /'/g,
          "''"
        )}', '${a.start_date}', NOW(), NOW())`
    )
    .join(", ");

  await sql`
    INSERT INTO activities (id, athlete_id, data, start_date, created_at, updated_at)
    VALUES ${sql.unsafe(values)}
    ON CONFLICT (id) DO UPDATE SET
      data = EXCLUDED.data,
      start_date = EXCLUDED.start_date,
      updated_at = NOW()
  `;

  return activities.length;
}

export async function deleteActivity(activityId: number): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM activities WHERE id = ${activityId}`;
}

export async function getActivitiesForAthlete(
  athleteId: number,
  options: {
    limit?: number;
    offset?: number;
    before?: string;
    after?: string;
  } = {}
): Promise<DbActivity[]> {
  const sql = getDb();
  const { limit = 200, offset = 0, before, after } = options;

  let result;

  if (before && after) {
    result = await sql`
      SELECT * FROM activities
      WHERE athlete_id = ${athleteId}
        AND start_date < ${before}
        AND start_date > ${after}
      ORDER BY start_date DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (before) {
    result = await sql`
      SELECT * FROM activities
      WHERE athlete_id = ${athleteId} AND start_date < ${before}
      ORDER BY start_date DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (after) {
    result = await sql`
      SELECT * FROM activities
      WHERE athlete_id = ${athleteId} AND start_date > ${after}
      ORDER BY start_date DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else {
    result = await sql`
      SELECT * FROM activities
      WHERE athlete_id = ${athleteId}
      ORDER BY start_date DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  return result as DbActivity[];
}

export async function getActivityCount(athleteId: number): Promise<number> {
  const sql = getDb();
  const result =
    await sql`SELECT COUNT(*) as count FROM activities WHERE athlete_id = ${athleteId}`;
  return parseInt(result[0].count as string, 10);
}

// Get the latest activity date for an athlete (for sync comparison)
export async function getLatestActivityDate(
  athleteId: number
): Promise<string | null> {
  const sql = getDb();
  const result = await sql`
    SELECT start_date FROM activities
    WHERE athlete_id = ${athleteId}
    ORDER BY start_date DESC
    LIMIT 1
  `;
  if (result.length === 0) return null;
  return (result[0].start_date as Date).toISOString();
}

// Check if we have a specific activity by ID
export async function hasActivity(activityId: number): Promise<boolean> {
  const sql = getDb();
  const result =
    await sql`SELECT 1 FROM activities WHERE id = ${activityId} LIMIT 1`;
  return result.length > 0;
}

export async function getActivityById(
  activityId: number
): Promise<DbActivity | null> {
  const sql = getDb();
  const result = await sql`SELECT * FROM activities WHERE id = ${activityId}`;
  return (result[0] as DbActivity) || null;
}

// Sync job operations
export async function createSyncJob(athleteId: number): Promise<DbSyncJob> {
  const sql = getDb();

  // First, cancel any existing pending/in_progress sync jobs for this athlete
  await sql`
    UPDATE sync_jobs
    SET status = 'cancelled', updated_at = NOW()
    WHERE athlete_id = ${athleteId} AND status IN ('pending', 'in_progress')
  `;

  const result = await sql`
    INSERT INTO sync_jobs (athlete_id, status, started_at)
    VALUES (${athleteId}, 'pending', NOW())
    RETURNING *
  `;

  return result[0] as DbSyncJob;
}

export async function getSyncJob(athleteId: number): Promise<DbSyncJob | null> {
  const sql = getDb();
  const result = await sql`
    SELECT * FROM sync_jobs
    WHERE athlete_id = ${athleteId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return (result[0] as DbSyncJob) || null;
}

export async function getActiveSyncJob(
  athleteId: number
): Promise<DbSyncJob | null> {
  const sql = getDb();
  const result = await sql`
    SELECT * FROM sync_jobs
    WHERE athlete_id = ${athleteId} AND status IN ('pending', 'in_progress', 'paused')
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return (result[0] as DbSyncJob) || null;
}

export async function updateSyncJob(
  jobId: number,
  updates: Partial<{
    status: SyncStatus;
    current_page: number;
    total_activities_synced: number;
    last_error: string | null;
    completed_at: Date;
  }>
): Promise<void> {
  const sql = getDb();

  const setClauses: string[] = ["updated_at = NOW()"];
  const values: unknown[] = [];

  if (updates.status !== undefined) {
    setClauses.push(`status = $${values.length + 1}`);
    values.push(updates.status);
  }
  if (updates.current_page !== undefined) {
    setClauses.push(`current_page = $${values.length + 1}`);
    values.push(updates.current_page);
  }
  if (updates.total_activities_synced !== undefined) {
    setClauses.push(`total_activities_synced = $${values.length + 1}`);
    values.push(updates.total_activities_synced);
  }
  if (updates.last_error !== undefined) {
    setClauses.push(`last_error = $${values.length + 1}`);
    values.push(updates.last_error);
  }
  if (updates.completed_at !== undefined) {
    setClauses.push(`completed_at = $${values.length + 1}`);
    values.push(updates.completed_at);
  }

  // Use unsafe for dynamic query, but still parameterized for values
  if (values.length === 0) {
    await sql`UPDATE sync_jobs SET updated_at = NOW() WHERE id = ${jobId}`;
  } else if (
    updates.status &&
    updates.current_page !== undefined &&
    updates.total_activities_synced !== undefined
  ) {
    await sql`
      UPDATE sync_jobs
      SET status = ${updates.status},
          current_page = ${updates.current_page},
          total_activities_synced = ${updates.total_activities_synced},
          last_error = ${updates.last_error ?? null},
          completed_at = ${updates.completed_at ?? null},
          updated_at = NOW()
      WHERE id = ${jobId}
    `;
  } else if (updates.status) {
    await sql`
      UPDATE sync_jobs
      SET status = ${updates.status},
          last_error = ${updates.last_error ?? null},
          completed_at = ${updates.completed_at ?? null},
          updated_at = NOW()
      WHERE id = ${jobId}
    `;
  }
}

export async function markSyncJobComplete(
  jobId: number,
  totalSynced: number
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE sync_jobs
    SET status = 'completed',
        total_activities_synced = ${totalSynced},
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = ${jobId}
  `;
}

export async function markSyncJobFailed(
  jobId: number,
  error: string
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE sync_jobs
    SET status = 'failed',
        last_error = ${error},
        updated_at = NOW()
    WHERE id = ${jobId}
  `;
}

export async function markSyncJobPaused(
  jobId: number,
  currentPage: number,
  totalSynced: number
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE sync_jobs
    SET status = 'paused',
        current_page = ${currentPage},
        total_activities_synced = ${totalSynced},
        updated_at = NOW()
    WHERE id = ${jobId}
  `;
}

// Activity streams operations
export async function upsertActivityStreams(
  activityId: number,
  athleteId: number,
  streams: Record<string, unknown>,
  streamTypes: string[]
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO activity_streams (activity_id, athlete_id, streams, stream_types, updated_at)
    VALUES (${activityId}, ${athleteId}, ${JSON.stringify(
    streams
  )}, ${streamTypes}, NOW())
    ON CONFLICT (activity_id) DO UPDATE SET
      streams = EXCLUDED.streams,
      stream_types = EXCLUDED.stream_types,
      updated_at = NOW()
  `;
}

export async function getActivityStreams(
  activityId: number
): Promise<DbActivityStreams | null> {
  const sql = getDb();
  const result =
    await sql`SELECT * FROM activity_streams WHERE activity_id = ${activityId}`;
  return (result[0] as DbActivityStreams) || null;
}

export async function deleteActivityStreams(activityId: number): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM activity_streams WHERE activity_id = ${activityId}`;
}

export async function getActivitiesWithoutStreams(
  athleteId: number,
  limit: number = 50
): Promise<number[]> {
  const sql = getDb();
  // Get activity IDs that don't have streams yet
  // Only include activities that might have HR/power (rides, runs, etc.)
  const result = await sql`
    SELECT a.id
    FROM activities a
    LEFT JOIN activity_streams s ON a.id = s.activity_id
    WHERE a.athlete_id = ${athleteId}
      AND s.activity_id IS NULL
      AND (a.data->>'has_heartrate')::boolean = true
    ORDER BY a.start_date DESC
    LIMIT ${limit}
  `;
  return result.map((r) => r.id as number);
}

export async function getStreamsSyncProgress(athleteId: number): Promise<{
  total: number;
  withStreams: number;
  pending: number;
}> {
  const sql = getDb();

  // Count activities that have heart rate data (candidates for stream sync)
  const totalResult = await sql`
    SELECT COUNT(*) as count
    FROM activities
    WHERE athlete_id = ${athleteId}
      AND (data->>'has_heartrate')::boolean = true
  `;

  const withStreamsResult = await sql`
    SELECT COUNT(*) as count
    FROM activity_streams
    WHERE athlete_id = ${athleteId}
  `;

  const total = parseInt(totalResult[0].count as string, 10);
  const withStreams = parseInt(withStreamsResult[0].count as string, 10);

  return {
    total,
    withStreams,
    pending: total - withStreams,
  };
}

// Batch fetch activity streams for multiple activities
export async function getActivityStreamsBatch(
  athleteId: number,
  activityIds: number[]
): Promise<DbActivityStreams[]> {
  if (activityIds.length === 0) return [];

  const sql = getDb();
  const result = await sql`
    SELECT * FROM activity_streams
    WHERE athlete_id = ${athleteId}
      AND activity_id = ANY(${activityIds})
  `;
  return result as DbActivityStreams[];
}

// Get all activity streams for an athlete (with optional limit)
export async function getAllActivityStreamsForAthlete(
  athleteId: number,
  limit?: number
): Promise<DbActivityStreams[]> {
  const sql = getDb();

  if (limit) {
    const result = await sql`
      SELECT s.* FROM activity_streams s
      JOIN activities a ON s.activity_id = a.id
      WHERE s.athlete_id = ${athleteId}
      ORDER BY a.start_date DESC
      LIMIT ${limit}
    `;
    return result as DbActivityStreams[];
  }

  const result = await sql`
    SELECT s.* FROM activity_streams s
    JOIN activities a ON s.activity_id = a.id
    WHERE s.athlete_id = ${athleteId}
    ORDER BY a.start_date DESC
  `;
  return result as DbActivityStreams[];
}

// Athlete zones operations
export async function upsertAthleteZones(
  athleteId: number,
  zones: StravaZonesResponse
): Promise<DbAthleteZones> {
  const sql = getDb();

  const heartRateZones = zones.heart_rate?.zones ?? null;
  const heartRateCustom = zones.heart_rate?.custom_zones ?? false;
  const powerZones = zones.power?.zones ?? null;

  const result = await sql`
    INSERT INTO athlete_zones (athlete_id, heart_rate_zones, heart_rate_custom, power_zones, updated_at)
    VALUES (
      ${athleteId},
      ${heartRateZones ? JSON.stringify(heartRateZones) : null},
      ${heartRateCustom},
      ${powerZones ? JSON.stringify(powerZones) : null},
      NOW()
    )
    ON CONFLICT (athlete_id) DO UPDATE SET
      heart_rate_zones = EXCLUDED.heart_rate_zones,
      heart_rate_custom = EXCLUDED.heart_rate_custom,
      power_zones = EXCLUDED.power_zones,
      updated_at = NOW()
    RETURNING *
  `;

  return result[0] as DbAthleteZones;
}

export async function getAthleteZones(
  athleteId: number
): Promise<DbAthleteZones | null> {
  const sql = getDb();
  const result = await sql`
    SELECT * FROM athlete_zones WHERE athlete_id = ${athleteId}
  `;
  return (result[0] as DbAthleteZones) || null;
}

// Check if zones need refresh (older than 7 days)
export async function zonesNeedRefresh(athleteId: number): Promise<boolean> {
  const zones = await getAthleteZones(athleteId);
  if (!zones) return true;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  return new Date(zones.updated_at) < sevenDaysAgo;
}
