// Training plan markdown table parser
// Phase 1: Regex-based parser for pipe-separated markdown tables
// Phase 2 (future): AI-enhanced parsing for complex formats

export interface ParsedWorkout {
  dayOfWeek: string; // "Mon", "Tue", etc.
  dayNumber: number; // Day of month
  sessionName: string;
  durationMinutes: number | null; // Max duration in minutes
  durationRaw: string | null; // Original duration string
  intensityTarget: string | null;
  notes: string | null;
}

export interface ParsedPlan {
  workouts: ParsedWorkout[];
  errors: string[];
}

// Map day abbreviations to day offset from Monday (Mon=0, Tue=1, etc.)
const DAY_OFFSET_MAP: Record<string, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

/**
 * Parse duration string like "1:00-1:15" or "0:45-1:00" into minutes
 * Returns the maximum duration if a range is given
 */
export function parseDuration(durationStr: string): number | null {
  if (!durationStr || durationStr.trim() === "" || durationStr.toLowerCase() === "off") {
    return null;
  }

  // Clean up the string
  const cleaned = durationStr.trim();

  // Handle ranges like "1:00-1:15" or "1:00–1:15" (different dash types)
  const rangeMatch = cleaned.match(/(\d+):(\d+)\s*[-–]\s*(\d+):(\d+)/);
  if (rangeMatch) {
    const maxHours = parseInt(rangeMatch[3], 10);
    const maxMinutes = parseInt(rangeMatch[4], 10);
    return maxHours * 60 + maxMinutes;
  }

  // Handle single duration like "1:00" or "0:45"
  const singleMatch = cleaned.match(/(\d+):(\d+)/);
  if (singleMatch) {
    const hours = parseInt(singleMatch[1], 10);
    const minutes = parseInt(singleMatch[2], 10);
    return hours * 60 + minutes;
  }

  // Handle plain minutes like "45" or "90"
  const plainMinutes = parseInt(cleaned, 10);
  if (!isNaN(plainMinutes)) {
    return plainMinutes;
  }

  return null;
}

/**
 * Parse day string like "Mon 5" or "Tue 6" into components
 */
export function parseDay(dayStr: string): { dayOfWeek: string; dayNumber: number } | null {
  const match = dayStr.trim().match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
  if (!match) {
    return null;
  }

  return {
    dayOfWeek: match[1],
    dayNumber: parseInt(match[2], 10),
  };
}

/**
 * Resolve a day reference like "Mon 5" to an actual date
 * The dayNumber (5) is the actual day of the month
 * The referenceDate is used to determine the month/year
 *
 * Uses UTC methods to avoid server timezone issues
 * Searches through the entire year to find the occurrence closest to the reference date
 */
export function resolveDateFromDay(
  dayOfWeek: string,
  dayNumber: number, // The actual day of the month (e.g., 5 for "Mon 5")
  referenceDate: Date = new Date()
): string {
  // Use UTC methods to avoid timezone issues on server
  const refYear = referenceDate.getUTCFullYear();
  const refTime = referenceDate.getTime();

  // Check if the day of week matches what was specified
  const expectedDayIndex = DAY_OFFSET_MAP[dayOfWeek.toLowerCase()];

  if (expectedDayIndex === undefined) {
    // Invalid day of week, fall back to reference month
    const refMonth = referenceDate.getUTCMonth();
    return formatDateUTC(new Date(Date.UTC(refYear, refMonth, dayNumber)));
  }

  // Find all occurrences of this day-of-month in the year that match the day-of-week
  const matches: Date[] = [];

  // Check all 12 months
  for (let month = 0; month < 12; month++) {
    const candidateDate = new Date(Date.UTC(refYear, month, dayNumber));

    // Verify this date is actually in the month we tried to create it in
    // (handles cases like Feb 31 which would roll over to March)
    if (candidateDate.getUTCMonth() !== month) {
      continue;
    }

    // Convert JS day (0=Sun) to our offset (0=Mon), using UTC day
    const actualDayOffset = candidateDate.getUTCDay() === 0 ? 6 : candidateDate.getUTCDay() - 1;

    // Check if the day of week matches
    if (actualDayOffset === expectedDayIndex) {
      matches.push(candidateDate);
    }
  }

  // If no matches found in this year, fall back to previous behavior
  if (matches.length === 0) {
    const refMonth = referenceDate.getUTCMonth();
    return formatDateUTC(new Date(Date.UTC(refYear, refMonth, dayNumber)));
  }

  // Find the match closest to the reference date
  let closestDate = matches[0];
  let closestDistance = Math.abs(matches[0].getTime() - refTime);

  for (let i = 1; i < matches.length; i++) {
    const distance = Math.abs(matches[i].getTime() - refTime);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestDate = matches[i];
    }
  }

  return formatDateUTC(closestDate);
}

/**
 * Format a date to YYYY-MM-DD using UTC (for server-side consistency)
 */
function formatDateUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse a markdown table row into cells
 */
function parseTableRow(row: string): string[] {
  // Remove leading/trailing pipes and split by pipe
  const cleaned = row.trim();
  if (!cleaned.startsWith("|") || !cleaned.endsWith("|")) {
    // Still try to parse if it has pipes
    if (!cleaned.includes("|")) {
      return [];
    }
  }

  return cleaned
    .split("|")
    .map((cell) => cell.trim())
    .filter((_, index, arr) => index > 0 && index < arr.length - 1 || arr.length === 1);
}

/**
 * Check if a row is a separator row (e.g., "| --- | --- |")
 */
function isSeparatorRow(row: string): boolean {
  return /^\|?\s*[-:]+\s*\|/.test(row);
}

/**
 * Parse a markdown table containing a training plan
 */
export function parseTrainingPlanTable(markdown: string): ParsedPlan {
  const lines = markdown.split("\n").filter((line) => line.trim() !== "");
  const workouts: ParsedWorkout[] = [];
  const errors: string[] = [];

  // Find header row and determine column indices
  let headerIndex = -1;
  let columnMap: Record<string, number> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip separator rows
    if (isSeparatorRow(line)) {
      continue;
    }

    const cells = parseTableRow(line);
    if (cells.length === 0) continue;

    // Check if this looks like a header row
    const lowerCells = cells.map((c) => c.toLowerCase());
    if (
      lowerCells.some((c) => c.includes("day")) ||
      lowerCells.some((c) => c.includes("session"))
    ) {
      headerIndex = i;

      // Map column names to indices
      cells.forEach((cell, index) => {
        const lower = cell.toLowerCase();
        if (lower.includes("day")) columnMap.day = index;
        else if (lower.includes("session")) columnMap.session = index;
        else if (lower.includes("duration")) columnMap.duration = index;
        else if (lower.includes("intensity")) columnMap.intensity = index;
        else if (lower.includes("notes") || lower.includes("note")) columnMap.notes = index;
      });

      break;
    }
  }

  if (headerIndex === -1) {
    // Try to infer columns from first data row
    // Assume standard format: Day | Session | Duration | Intensity | Notes
    columnMap = { day: 0, session: 1, duration: 2, intensity: 3, notes: 4 };
    headerIndex = -1; // Start from first row
  }

  // Parse data rows
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    // Skip separator rows
    if (isSeparatorRow(line)) {
      continue;
    }

    const cells = parseTableRow(line);
    if (cells.length === 0) continue;

    // Extract values using column map
    const dayCell = cells[columnMap.day ?? 0] ?? "";
    const sessionCell = cells[columnMap.session ?? 1] ?? "";
    const durationCell = cells[columnMap.duration ?? 2] ?? "";
    const intensityCell = cells[columnMap.intensity ?? 3] ?? "";
    const notesCell = cells[columnMap.notes ?? 4] ?? "";

    // Parse day
    const dayParsed = parseDay(dayCell);
    if (!dayParsed) {
      if (dayCell && !isSeparatorRow(line)) {
        errors.push(`Could not parse day: "${dayCell}"`);
      }
      continue;
    }

    // Parse duration
    const durationMinutes = parseDuration(durationCell);

    workouts.push({
      dayOfWeek: dayParsed.dayOfWeek,
      dayNumber: dayParsed.dayNumber,
      sessionName: sessionCell || "Workout",
      durationMinutes,
      durationRaw: durationCell || null,
      intensityTarget: intensityCell || null,
      notes: notesCell || null,
    });
  }

  return { workouts, errors };
}

/**
 * Convert parsed workouts to database format with resolved dates
 */
export function convertToDbWorkouts(
  parsedPlan: ParsedPlan,
  athleteId: number,
  referenceDate: Date = new Date()
): Array<{
  athlete_id: number;
  workout_date: string;
  session_name: string;
  duration_target_minutes: number | null;
  intensity_target: string | null;
  notes: string | null;
}> {
  return parsedPlan.workouts.map((workout) => ({
    athlete_id: athleteId,
    workout_date: resolveDateFromDay(
      workout.dayOfWeek,
      workout.dayNumber,
      referenceDate
    ),
    session_name: workout.sessionName,
    duration_target_minutes: workout.durationMinutes,
    intensity_target: workout.intensityTarget,
    notes: workout.notes,
  }));
}

// ============================================
// Future AI Enhancement Interface
// ============================================

export interface AIParserOptions {
  model?: string;
  apiKey?: string;
}

/**
 * AI-enhanced parser interface (for future implementation)
 * This function signature allows easy integration of AI parsing
 */
export async function parseWithAI(
  _markdown: string,
  _options?: AIParserOptions
): Promise<ParsedPlan> {
  // Phase 2: Implement AI parsing here
  // For now, fall back to regex parser
  throw new Error("AI parsing not yet implemented. Use parseTrainingPlanTable instead.");
}

