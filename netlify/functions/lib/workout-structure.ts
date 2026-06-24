// Shared parsing of structured interval workouts into "sets".
//
// A workout can contain MULTIPLE sets, e.g. "3x10min @ Z4 then 2x20min @ Z3".
// Sets are parsed from the intervals.icu `workout_text` DSL (the precise source
// of truth) when present, otherwise best-effort from the free-text session
// fields. Both the Garmin serializer and the compliance analysis consume this
// so a multi-set plan transfers correctly AND is scored accurately.

export interface IntervalSet {
  count: number;
  workSec: number;
  targetZone: number | null;
  recoverySec: number | null;
}

// A single expected work interval (sets flattened out, one entry per rep).
export interface ExpectedInterval {
  durationSec: number;
  targetZone: number;
  recoverySec: number | null;
}

// Keyword -> zone, ordered most-specific first.
const KEYWORD_TO_ZONE: Array<[RegExp, number]> = [
  [/active recovery|very easy|recovery/i, 1],
  [/endurance|aerobic|easy/i, 2],
  [/sweet ?spot|tempo|moderate|controlled/i, 3],
  [/threshold|lactate|ftp/i, 4],
  [/vo2 ?max|vo2|anaerobic|sprint|neuromuscular|\bmax\b|\bhard\b/i, 5],
];

// %FTP -> training zone (matches the app's existing power-zone thresholds).
export function pctToZone(pct: number): number {
  if (pct < 55) return 1;
  if (pct <= 75) return 2;
  if (pct <= 90) return 3;
  if (pct <= 105) return 4;
  return 5;
}

// Free-text intensity -> zone (explicit zN, %FTP, or keyword).
function textToZone(text: string | null | undefined): number | null {
  if (!text) return null;
  const z = text.match(/z(?:one)?\s*([1-5])/i);
  if (z) return parseInt(z[1], 10);
  const pct = text.match(/(\d{2,3})\s*%/);
  if (pct) return pctToZone(parseInt(pct[1], 10));
  for (const [re, zone] of KEYWORD_TO_ZONE) if (re.test(text)) return zone;
  return null;
}

function toSeconds(value: number, unit: string): number {
  const u = unit.toLowerCase();
  const isSec = u.startsWith("sec") || u === "s" || u === '"' || u === "\u2033";
  return isSec ? value : value * 60;
}

function parseRecoverySec(scope: string): number | null {
  const m = scope.match(
    /(?:\/|with|after|then|,|\()\s*(\d+)\s*(min(?:ute)?s?|m|sec(?:ond)?s?|s|['\u2032"\u2033])\s*(?:recovery|rest|easy|spin)?/i,
  );
  if (!m) return null;
  const sec = toSeconds(parseInt(m[1], 10), m[2]);
  return sec >= 5 && sec <= 1800 ? sec : null;
}

// Matches an "Nx<dur>" block, e.g. "3x10min", "6x1'", "8x30sec".
const SET_RE =
  /(\d+)\s*[x\u00d7]\s*(\d+)\s*(min(?:ute)?s?|m|sec(?:ond)?s?|s|['\u2032"\u2033])/gi;

/**
 * Parse one or more "Nx<dur>" blocks from the free-text session fields.
 * Each block's intensity/recovery is read from the text following it (its
 * "scope"), falling back to the overall intensity target.
 */
export function parseSetsFromText(
  sessionName: string,
  intensityTarget: string | null,
): IntervalSet[] {
  const text = [sessionName, intensityTarget].filter(Boolean).join("  ");
  const matches = [...text.matchAll(SET_RE)];
  if (matches.length === 0) return [];

  const sets: IntervalSet[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const count = parseInt(m[1], 10);
    const workSec = toSeconds(parseInt(m[2], 10), m[3]);
    if (count < 1 || count > 30 || workSec < 5 || workSec > 7200) continue;

    const start = (m.index ?? 0) + m[0].length;
    const end =
      i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length;
    const scope = text.slice(start, end);

    const targetZone = textToZone(scope) ?? textToZone(intensityTarget);
    const recoverySec = parseRecoverySec(scope);
    sets.push({ count, workSec, targetZone, recoverySec });
  }
  return sets;
}

// Matches an intervals.icu DSL repeat line, e.g. "3x10m 88-93% 5m 55%".
const DSL_REPEAT_RE =
  /(\d+)\s*x\s*(\d+)\s*(min(?:ute)?s?|sec(?:ond)?s?|m|s)?\s*(\d+)(?:\s*-\s*(\d+))?\s*%(?:\s+(\d+)\s*(min(?:ute)?s?|sec(?:ond)?s?|m|s)?\s*(\d+)(?:\s*-\s*(\d+))?\s*%)?/i;

/**
 * Parse sets from the intervals.icu workout_text DSL. Only repeat lines
 * (e.g. "- 3x10m 88-93% 5m 55%") count as interval sets; plain steps
 * (warm-up / cool-down / steady) are ignored.
 */
export function parseSetsFromDsl(dsl: string): IntervalSet[] {
  const sets: IntervalSet[] = [];
  for (const rawLine of dsl.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^-\s*/, "");
    const m = line.match(DSL_REPEAT_RE);
    if (!m) continue;

    const count = parseInt(m[1], 10);
    const workSec = toSeconds(parseInt(m[2], 10), m[3] || "m");
    if (count < 1 || count > 30 || workSec < 5 || workSec > 7200) continue;

    const workLo = parseInt(m[4], 10);
    const workHi = m[5] ? parseInt(m[5], 10) : workLo;
    const workPct = (workLo + workHi) / 2;

    let recoverySec: number | null = null;
    if (m[6]) {
      const sec = toSeconds(parseInt(m[6], 10), m[7] || "m");
      recoverySec = sec >= 5 && sec <= 1800 ? sec : null;
    }

    sets.push({ count, workSec, targetZone: pctToZone(workPct), recoverySec });
  }
  return sets;
}

/**
 * Resolve the interval sets for a workout: the DSL workout_text is the source
 * of truth when present, otherwise derive from the free-text fields.
 */
export function getWorkoutSets(workout: {
  workout_text: string | null;
  session_name: string;
  intensity_target: string | null;
}): IntervalSet[] {
  if (workout.workout_text && workout.workout_text.trim()) {
    return parseSetsFromDsl(workout.workout_text);
  }
  return parseSetsFromText(workout.session_name, workout.intensity_target);
}

// Flatten sets into one ExpectedInterval per rep (used by compliance mapping).
export function flattenSets(
  sets: IntervalSet[],
  defaultZone = 3,
): ExpectedInterval[] {
  const expected: ExpectedInterval[] = [];
  for (const s of sets) {
    for (let i = 0; i < s.count; i++) {
      expected.push({
        durationSec: s.workSec,
        targetZone: s.targetZone ?? defaultZone,
        recoverySec: s.recoverySec,
      });
    }
  }
  return expected;
}

/**
 * Whether a workout has interval structure worth pushing as a Garmin workout.
 * Plain steady/endurance rides (no repeats) return false. The DSL workout_text
 * counts only when it actually contains interval repeats.
 */
export function hasIntervalStructure(workout: {
  workout_text: string | null;
  session_name: string;
  intensity_target: string | null;
}): boolean {
  return getWorkoutSets(workout).length > 0;
}
