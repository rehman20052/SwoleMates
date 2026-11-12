# Workout Analytics

Access: **Train → Workout Analytics**. Available without a subscription. The pure calculation module (`src/lib/workout-analytics.ts`) is separate from presentation and any future feature entitlements.

The overview shows the actual selected dates, completed sessions, recorded-load volume, PR improvements, and Strength Progression for the selected lift. The KPI cards and shortcuts open scoped details. Strength Progression keeps the selected lift across date ranges, offers search and saved workout-day filters, and shows charts for weight, volume and reps directly on the overview. Estimated 1RM shows the best weight by rep count and an estimated single-rep range for the selected period. Consistency shows the current calendar week's goal and lets users open workouts from the activity calendar.

## Data and refresh

Uses `useAppData().logs`, the same authenticated history as the workout logger and calendar. Existing account sync reads private completed set data from the `workout_logs` namespace through owner-scoped `account_read_delta` / RLS-protected `account_records`. Partner attendance logs are merged by the existing Dashboard integration; they have no private sets unless the user logged them. No new queries, tables, payloads, migrations, writes, subscriptions, or external AI calls are introduced. The existing foreground account refresh remains responsible for cloud updates. Logging, editing and deleting updates the shared store and recalculates analytics. Pending local saves are included and labeled; sync errors expose retry and a stale-history notice.

The schema document's original workout table diagram predates the existing account-sync implementation; this feature follows current access paths rather than moving or copying records. `.cursor/rules/supabase-tables.mdc` was read from the working tree because this path is absent from local `main`. No schema change was planned or applied, so no database-owner approval was needed.

Only finalized SessionLogs enter this store; planned, canceled and draft workouts are separate. Analytics additionally excludes tombstoned IDs, duplicate planned-workout keys, impossible dates, and future dates. A completed check-in with no sets contributes to workout counts and activity but cannot produce strength or volume. Coverage is displayed. Invalid exercises are omitted without discarding the workout's activity.

## Definitions

- The 7-, 30- and 90-day periods include today and the preceding N−1 local calendar dates. Comparisons use the immediately preceding N dates. All time shows the first through last available workout dates and omits a comparison. Calendar math uses dates across DST.
- Workouts counts sessions. Weekly goals and frequency count distinct workout days. The current goal uses the full current Monday–Sunday week even when the selected range is different. Streaks use distinct dates in the selected period. A current streak can end today or yesterday.
- Recorded-load volume sums recorded load × reps per set after converting to the selected lb/kg unit. A genuine zero is valid. Missing set data and a missing previous-period baseline are displayed separately from zero. Recognized bodyweight exercises default to Best reps. Positive logged load on bodyweight exercises counts as added load, and explicitly assisted exercises are excluded from the load totals. Bodyweight work is also shown as sets and reps.
- Est. 1RM uses the Epley calculation in Strength Progression. A logged single uses its actual load. Positive loaded sets can qualify, with the rep contribution capped at 10 for higher-rep sets. Known bodyweight and assisted exercises are excluded. The range card uses the best estimate in the selected period and shows its source set and date. Its lower and upper bounds start at 95% and 100% of that estimate and round down where practical.
- Personal Records tracks heaviest set, best session volume, and most reps in one set. The first qualifying result is a baseline and ties retain the earlier result. The KPI counts improvements to those records. Lifetime bests are grouped by lift and identify bests that remain baselines. Rows with a source open the completed workout.
- Known lifts use the catalog ID. Custom and legacy names without a catalog match use the normalized name key already used by the logger. Logged row IDs identify individual source rows. A legacy workout with no set details uses its saved uniform set count and values when available.
- Weekly bars use Monday–Sunday buckets and label partial weeks. Long all-time views show at most the latest 12 available calendar weeks, while totals retain the full selected history. The activity calendar shows up to 91 days and displays its actual coverage. Volume breakdowns cover the full selected period.
- Insights use deterministic comparisons from the same analytics model.

## Unsupported existing data

Muscle Balance matches completed sets to the bundled wger primary muscle metadata, app exercise defaults, and saved classifications. A set targeting multiple primary groups is split evenly across those groups. The chart uses classified sets as its denominator. The full group view includes zero-set groups, and each group can show the exercises and set allocations that contributed to its total.

Custom classifications use the existing account-synced settings records with `preference:exercise-muscles:` IDs. Exercise names are matched by normalized case and whitespace. Assigning a classification also covers historical logs with the same name. The stored set format has no separate warm-up, assistance, body mass or load-type fields. Known bodyweight work uses existing equipment metadata and established lift names. Without a recognized exercise or explicit assistance label, analytics uses the load as logged. Custom names without a catalog ID cannot be linked across renames.

## Verification

- `npm run typecheck`
- `npm test` (includes pure calculation edge cases)
- `npx expo export --platform web --max-workers 2 --output-dir artifacts/workout-analytics-web`
- `npx expo export --platform ios --platform android --max-workers 2 --output-dir artifacts/workout-analytics-native`
- `node tests/workout-analytics-smoke.cjs` (isolated mocked APIs; no production writes)

UI uses React Native, existing SVG and SafeArea components. Physical iOS/Android interaction testing remains necessary; web checks do not establish native device behavior.
