# Team workflow

The SwoleMates team members are Abdur, Gio, Habib, Noor, Zub, and Yunus.

## Feature branches

Branches are organized by feature area instead of by teammate. Multiple members can collaborate on the same feature branch when needed:

| Branch | Feature area | Scope |
|---|---|---|
| `feature/profile-preferences` | Profiles and preferences | Onboarding, public profile fields, photos, gym preference, availability, and dealbreakers |
| `feature/discovery-matching` | Partner discovery | Match cards, filters, compatibility scoring, nearby partners, and "show outside range" behavior |
| `feature/match-requests-chat` | Requests and messaging | Sending match requests, accept/decline states, private chat starter, and notifications |
| `feature/workout-planning` | Workout scheduling | Proposed session times, gym selection, workout focus, invitations, and calendar-style planning |
| `feature/reliability-checkins` | Reliability and attendance | Two-sided attendance confirmation, cancellations, unmatching, and reliability history |
| `feature/progress-dashboard` | Workout dashboard | Workout logs, key lifts, streaks, personal progress, and quick dashboard totals |
| `feature/safety-privacy` | Safety and privacy | Blocks, reports, approximate location, visibility settings, and content/account review hooks |

## Meeting schedule

- Tuesdays before 12:15 p.m. Senior Project class
- Thursdays from 10:00 a.m. to 12:00 p.m.

## Current direction

The main focus is a gym-partner matchmaking app. Supporting features like calorie tracking, recipes, nutrition guidance, goals, and competitions should stay secondary until the matching flow works well.

## Development routine

1. Start from the feature branch that matches the work.
2. Pull the latest `main` changes before working.
3. Keep each change focused on one feature or screen.
4. Test with `npm run typecheck` before asking teammates to review.
5. Merge through pull requests so everyone can see what changed.
