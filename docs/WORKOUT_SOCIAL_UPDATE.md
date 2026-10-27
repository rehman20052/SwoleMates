# Workout and social update

Resume is offered only for drafts containing user input. Opening and closing an empty logger, exercise search or untouched prefilled session does not create an active workout. Name-only drafts and partial duration input are retained. Drafts record explicit input intent; legacy empty forms and the former sample Bench press are excluded from Resume without dropping recognized real progress.

Workout logging uses a restrained graphite/sage palette, regular interface headings, consistent vector icons, compact completion indicators and the same set grid in all loggers. Discard is directly visible at the top of active sessions. It asks for confirmation before clearing a draft. Calendar corrections have a top Discard option that clears only unsaved edits and leaves the saved workout unchanged.

All workout logging entry points now use `WorkoutSetEditor` and the compact prototype styling: rounded exercise cards, weight/reps/checkmark rows, visible set removal, an exercise search sheet, empty workouts and matching saved-set cards. This includes Home, partner sessions, repeated workouts, templates used for logging, calendar additions and corrections. Template creation retains its planning controls. Editing completed workouts preserves checked sets; editing an active set clears its checkmark. Draft keys and save handlers remain scoped to the same accounts and sessions.

Apply `supabase/blocked-people.sql` in the Supabase SQL editor after the existing `reliability-safety.sql` setup. It adds `my_blocked_people`, which returns only the signed-in user's outgoing blocks with display names and photos. It does not expose private profile fields or people who blocked the caller. Existing blocks work immediately; no re-blocking is needed. Without the script, Settings displays a setup message.

Chat workout requests now offer a compact routine picker to the proposer. The existing `shared-sessions.sql` setup supplies shared exercise targets; starting personal logging locks the shared routine. Schedule date, time and location in chat, accept the request, then use Home to check in and log personal sets. Home logging also works if shared-session support is unavailable, using a saved routine or an empty workout. Attendance and set completion remain independent.

Home's current workout logger now requires checking off completed sets. Unchecked sets are omitted on save. Templates keep their full prescription. Changing an active set clears its checkmark; calendar corrections preserve completion. Checked fields use muted text and a completed border.

Saving or deleting a workout recomputes its lift contribution from saved sets. New history entries record their workout ID so subsequent corrections replace the contribution. Legacy entries are matched by exercise, date, converted weight and reps. Manual history and lift goals are retained; an old manual entry identical to a workout entry cannot be distinguished because legacy history lacked source IDs.
# Partner scheduling redesign

Run `supabase/partner-routines.sql` in the Supabase SQL Editor. This adds a read-only RPC for accepted, unblocked partners to preview each other's saved routines. It returns only routine titles, exercise names, set counts and target reps; private weights, notes and drafts remain private. It is safe to run again.

Chat now handles scheduling only. Schedule offers your gym, your partner's gym, or Other, and defaults to No routine. Both users' routines are available with a simple preview. The invite keeps a snapshot of the selected routine, including through acceptance, so later template edits do not change an agreed workout.

Incoming pending workout invites appear above conversations in Chat, independent of the latest message. Accepted workouts appear near the top of Home with the partner's profile picture. Check-in opens at the workout's start time. Only after your own check-in can the card open the main Home workout logger. A chosen routine imports its exercises with blank weights; No routine starts with an explicit empty state. Add set and labeled Remove set controls are available. Existing check-in records are updated rather than creating duplicate workout logs.

