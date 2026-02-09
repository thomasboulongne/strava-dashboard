Any weekly training plan has to be a markdown table and follow the following format:

```
| Day    | Session      | Duration  | Intensity target  | Notes |
| ------ | ------------ | --------- | ----------------- | ----- |
| Mon 5  | Endurance    | 1:00-1:15 | Z2                | Easy  |
| Tue 6  | Intervals    | 1:00      | 3x10min @ Z4      |       |
| Wed 7  | Recovery     | 0:45      | Z1                |       |
| Thu 8  | Tempo        | 1:30      | Z3                |       |
| Fri 9  | Off          |           |                   | Rest  |
| Sat 10 | Long Ride    | 3:00-3:30 | Z2                |       |
| Sun 11 | Strength     | 0:45      | Gym               |       |
```

## Column Specifications

### 1. Day (REQUIRED)

Format: `Day 5`, `Mon 5`, `Tue 6`, etc.

- **Must include**: 3-letter day abbreviation + day of the month number
- Examples: `Mon 5`, `Tue 6`, `Wed 7`, `Thu 8`, `Fri 9`, `Sat 10`, `Sun 11`
- The day number should be the actual calendar date

### 2. Session (REQUIRED)

The name/type of the workout.

- Examples: `Endurance`, `Intervals`, `Tempo`, `Long Ride`, `Recovery`, `Off`, `Strength`, `Gym`
- Can include interval structure here (e.g., `3x10min Tempo`)

### 3. Duration

Format: `H:MM` or `H:MM-H:MM` (range) or plain minutes

- Single duration: `1:00`, `0:45`, `2:30`
- Range: `1:00-1:15`, `2:00-2:30` (app uses the maximum)
- Plain minutes: `45`, `90`
- Leave empty for rest days or when duration is flexible

### 4. Intensity target

**This field is crucial for proper workout analysis.** The app uses this to:

- Match activities to target heart rate or power zones
- Detect and analyze interval execution
- Calculate compliance scores

#### Supported formats (examples):

**Intensity keywords**

recovery, very easy, active recovery, easy, endurance, aerobic, z2, zone 2, tempo, moderate, z3, zone 3, controlled, threshold, ftp, sweet spot, z4, zone 4, vo2, vo2max, z5, zone 5, anaerobic, neuromuscular, z1, zone 1, hard, lactate, max

**Heart Rate:**

- Zone notation: `Z1`, `Z2`, `Zone 3`, `z4`, `zone 5`
- Explicit BPM range: `130-150 bpm`, `145-160 bpm`

**Power:**

- Zone notation: `Z2`, `Zone 3`
- FTP percentage: `85% FTP`, `90%`, `95-100%`
- Explicit watts: `200-220W`, `250W`, `180W`

**Intervals:**
Include interval structure here for automatic detection:

- `3x10min @ Z4` (3 intervals of 10 minutes at Zone 4)
- `5x2min @ threshold` (5 intervals of 2 minutes at threshold)
- `6x1' @ VO2max` (6 intervals of 1 minute at VO2max)
- `4x8min @ 165-175 bpm` (4 intervals of 8 minutes at specific HR range)
- `8x30sec @ 110% FTP` (8 intervals of 30 seconds at 110% FTP)

Supported patterns:

- `NxDURATION` where DURATION can be: `10min`, `5mins`, `1'`, `30sec`, `2"`
- Examples: `3x10min`, `6x1'`, `4x5mins`, `8x30sec`

**Recovery Duration (OPTIONAL but RECOMMENDED):**

You can specify expected recovery time between intervals. This helps the app accurately identify which laps are work intervals vs. recovery laps, especially when your heart rate stays elevated during recovery.

Supported recovery formats:

- `3x10min / 3min` - 3 intervals with 3 minutes recovery between each
- `5x2min / 90sec` - 5 intervals with 90 seconds recovery
- `3x10min with 3min recovery` - alternative "with" syntax
- `3x10min (3min recovery)` - parenthetical syntax
- `3x10min / 3min easy` - recovery can be marked as "easy", "rest", or "recovery"

The recovery indicator can appear in either the **Session** or **Intensity target** column.

Examples:
- Session: `Intervals`, Intensity: `3x10min @ Z4 / 3min` - ✅ recovery parsed (work: Z4, recovery: 3min)
- Session: `3x10min / 2min`, Intensity: `Z4` - ✅ recovery parsed (work: Z4, recovery: 2min)
- Session: `Intervals`, Intensity: `5x2min @ threshold with 90sec rest` - ✅ recovery parsed (work: threshold, recovery: 90sec)
- Session: `Intervals`, Intensity: `2×12min @ 165–172bpm / 6min recovery` - ✅ recovery parsed (work: 165-172bpm, recovery: 6min, NOT Zone 1!)

**Why specify recovery duration?**

When you don't specify recovery duration, the app uses heuristics to identify recovery laps:
- Short duration (< 40% of interval length)
- Low heart rate or power
- Sequential pattern analysis (work → recovery → work)

However, HR often stays elevated during recovery, which can cause recovery laps to be misidentified as intervals. By explicitly stating the expected recovery duration (e.g., `/ 3min`), the app can accurately identify recovery laps even when HR remains high.

**Important note on "recovery" keyword:**

The word "recovery" when used to describe rest periods (e.g., `2×12min @ 165–172bpm / 6min recovery`) is correctly parsed as a recovery duration descriptor, NOT as a Zone 1 intensity keyword. The app intelligently strips recovery duration patterns before parsing intensity targets, so your work intervals will be analyzed at the correct intensity (165-172bpm in this example, not Zone 1).

**Other:**

- `Gym`, `Strength` (for weight training sessions)
- Leave empty for flexibility/rest days

### 5. Notes (OPTIONAL)

Additional context or instructions.

- Examples: `Easy spin`, `Include warm-up/cool-down`, `Focus on cadence`, `Upper body`

## Complete Examples

Here are complete example training plan tables showing different workout types and formatting:

### Example 1: Basic week with intervals

```markdown
| Day    | Session      | Duration  | Intensity target    | Notes |
| ------ | ------------ | --------- | ------------------- | ----- |
| Mon 3  | Endurance    | 1:00      | Z2                  | Easy  |
| Tue 4  | Intervals    | 1:00      | 3x10min @ Z4 / 3min | Warm up 15min |
| Wed 5  | Recovery     | 0:45      | Z1                  |       |
| Thu 6  | Tempo        | 1:30      | Z3                  |       |
| Fri 7  | Off          |           |                     | Rest  |
| Sat 8  | Long Ride    | 3:00      | Z2                  |       |
| Sun 9  | Strength     | 0:45      | Gym                 |       |
```

### Example 2: Alternative interval formatting

All of these are valid and equivalent:

**Option A - Recovery in intensity column:**
- Session: `Intervals`, Intensity: `5x2min @ threshold / 90sec`

**Option B - Recovery with "with" keyword:**
- Session: `Intervals`, Intensity: `5x2min @ threshold with 90sec rest`

**Option C - Recovery in parentheses:**
- Session: `Intervals`, Intensity: `5x2min @ threshold (90sec recovery)`

**Option D - Interval structure in session name:**
- Session: `5x2min / 90sec`, Intensity: `threshold`

### Example 3: Pyramid workout

For pyramid workouts (e.g., 2min → 4min → 6min → 4min → 2min), you can either:

**Option A - Use explicit recovery durations:**
```markdown
| Day    | Session      | Duration  | Intensity target              | Notes |
| ------ | ------------ | --------- | ----------------------------- | ----- |
| Tue 4  | Pyramid      | 1:15      | 2min, 4min, 6min, 4min, 2min @ Z4 with 2min recovery | |
```

**Option B - Let the app detect the pattern:**
```markdown
| Day    | Session      | Duration  | Intensity target    | Notes |
| ------ | ------------ | --------- | ------------------- | ----- |
| Tue 4  | Pyramid      | 1:15      | Z4                  | 2-4-6-4-2min intervals |
```

For pyramid workouts, the sequential pattern detection will identify the varying interval lengths.
