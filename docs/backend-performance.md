# Database load audit

These client changes reduce unnecessary work. They are not evidence that the
reported CPU spike has been attributed or resolved on the hosted database.
Deploy the updated app before measuring the effect; existing clients keep their
old subscriptions and polling until they reload/update.

## Implemented

- Account record subscriptions filter by authenticated `user_id`, rebind on
  account changes and unsubscribe on cleanup. Tombstone sync is unchanged.
- Social feed, notification badges and comment views share one upstream channel
  for the four social tables instead of each opening their own four subscriptions.
  The channel is released when its last consumer leaves.
- Chat refreshes on Realtime events. Its existing two-second fallback remains
  during connection failures; while connected, a safety read runs approximately
  every 16 seconds for attendance changes and missed events. This changes idle
  chat polling from 30 batches/minute to about 4, excluding live events.
  Each batch may issue several database requests. Messages, edits, reactions and
  workout-plan events still request an immediate refresh, batched by 200 ms.
- Inbox, chat, account sync, workout verification, shared workout sessions and
  social refreshes skip network polling in hidden browser tabs/background native
  apps. Focus, visibility, connectivity and native foreground events catch up.
- Refresh queues combine bursts and serialize reads, retaining one trailing
  refresh when an event arrives during a request.
- The global message-alert subscription no longer reconnects for every tab or
  navigation-stack change. Inbox and alert refreshes combine overlapping triggers.

RLS policies, indexes, save RPCs, conflict detection, save receipts and advisory
locks are unchanged. No database migration is needed for these client changes.

## Remaining opportunities

Social events, incoming-message alerts and reaction subscriptions still require
some table-wide subscriptions under the current schema. Filtering reaction events
by the current user's ID would lose other participants' reactions. Limiting
incoming-message alerts to INSERT would lose edits/deletions. Those shortcuts
were deliberately avoided.

Private Broadcast is a possible next step for those remaining subscriptions.
It requires deployed database triggers and topic authorization that reproduce
participant, blocking and social visibility rules, plus tests for revoked access.
Keep fallback reads during that rollout. Do not substitute a public channel or
remove RLS. Supabase's guidance:
https://supabase.com/docs/guides/realtime/subscribing-to-database-changes

Consolidating the flagged attendance/group_events/match_requests policies needs
the actual deployed definitions and representative permission tests. Repository
SQL alone cannot establish which overlapping policies are currently installed.

## Verify on the hosted project

1. Record the exact CPU spike window and timezone. Compare Database CPU, Query
   Performance, Realtime Postgres Changes Events, connections and API traffic for
   that same window; cumulative query statistics cannot identify a short spike.
2. After clients update, compare equal-duration windows with similar active-user
   counts: CPU, `realtime.list_changes` total execution time/calls, database read
   request rate, Realtime subscriptions, errors and p95 query latency.
3. Check an idle chat: about four safety batches/minute with a healthy channel,
   fast fallback with Realtime unavailable, and no polling while hidden.
4. Check two clients: send/edit/delete messages, toggle reactions, change workout
   invitations and attendance, and modify shared workouts. Check cross-device
   account saves/deletes, offline recovery and foreground catch-up.
5. Opening feed and notifications together should keep a single social channel.
   Repeated navigation should not grow the active-channel count. Sign out/in as
   another account and check that only that account's record channel remains.

Treat PostgREST setup statement executions as database statement counts, not a
proven one-to-one count of HTTP requests. Compare them with actual API traffic
before concluding that a request storm occurred.
