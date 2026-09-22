# SwoleMates product specification

## Product statement

SwoleMates helps gym-goers find compatible, reliable workout partners and turn a match into an actual workout. Training and nutrition tools may support that promise later, but they must not compete with it in the MVP.

## Review of the supplied diagram

The diagram is a strong starting point for identifying system boundaries. Rename the center from `Gym Bro System` to `SwoleMates` and retain the external actors/services, but create a separate context diagram and ERD rather than mixing them.

The next context-diagram revision should add the flows that carry the core product:

- Authentication and profile privacy.
- Match request acceptance/decline and blocking.
- Conversations and messages between matched users.
- Workout proposals, RSVP changes, attendance confirmation, and disputes.
- Personal workout/nutrition logging and dashboard summaries.
- Friend feed posting and visibility.
- Notifications, reports, and moderation.

The AI and food providers are correctly treated as external services. Trainers and gyms are legitimate external actors, but their portals should be phase two unless the grading rubric explicitly requires them.

## Primary users

1. **Gym-goer** — discovers partners, matches, chats, schedules sessions, logs workouts, and tracks nutrition.
2. **Trainer or fitness creator** — publishes programs and may accept client requests. This is a later phase unless required for the course.
3. **Gym representative** — maintains a gym profile, classes, and events. This is a later phase unless required for the course.
4. **Moderator or administrator** — handles reports, verification, and unsafe content.

## Product principles

- Matching is the knockout feature; every other module should reinforce it.
- Exact home location is never exposed. Discovery uses an approximate distance or a selected gym.
- Preferences can be either a hard dealbreaker or a soft preference.
- Reliability must be explainable, appealable, and based on confirmed plans—not message frequency or general app activity.
- Ending a workout partnership and remaining friends are separate choices.
- Health guidance is educational and avoids diagnoses, injury treatment, or unsafe weight-change targets.

## MVP scope

### 1. Accounts and profiles

A user can:

- Register, sign in, reset credentials, and delete their account.
- Create a public profile with name, age range, pronouns/gender if they choose to share it, bio, photos, training goals, experience level, preferred workout styles, availability, and primary gym.
- Add notable lifts with exercise, weight, repetitions, unit, and date.
- Control which profile fields are public, match-only, friends-only, or private.

Do not treat a self-reported lift as verified. Label it as self-reported unless a future verification process is added.

### 2. Partner preferences and discovery

A user can set:

- Preferred genders.
- Maximum distance.
- Experience range.
- Relative strength range.
- Goals and workout styles.
- Preferred gyms and typical availability.

Each supported criterion has an `allow outside preference` setting. When disabled, it acts as a dealbreaker. When enabled, in-range candidates rank higher but the system may show other profiles.

Discovery should first apply privacy, block, age, and hard-preference filters. It can then rank eligible profiles using shared gym, schedule overlap, goals, workout style, distance, experience, and strength similarity. The UI should explain the strongest compatibility reasons instead of showing a mysterious percentage.

### 3. Matches, conversations, and friendships

- A user sends a match request with an optional short introduction.
- The recipient accepts, declines, blocks, or lets it expire.
- Acceptance creates an active workout-partner connection and a private conversation.
- Either user may end the partnership without a reliability penalty.
- When ending it, each user independently chooses whether to remain friends.
- Blocking immediately hides both users from discovery, disables contact, and overrides every other connection state.

### 4. Planned workouts and reliability

- Either partner can propose a date/time, gym or public location, and optional workout plan.
- The other participant accepts, declines, or proposes a change.
- After the scheduled time, both participants independently confirm `attended`, `partner did not attend`, or `canceled beforehand`.
- Disputed outcomes are not automatically scored as fact.

The public-facing metric should be called **reliability**, not credibility. Start with an understandable summary such as `8 of 9 confirmed workouts completed` and only calculate it after a minimum sample size. A no-show can affect it only when both users had accepted the plan, a grace period passed, and the outcome is confirmed or moderated. Ordinary inactivity, slow replies, declining an invitation, or respectfully ending a match must not lower the score.

### 5. Personal workout dashboard

- Create a workout or start from a reusable template.
- Record exercises, sets, repetitions, weight, duration, and notes.
- Show recent workouts, personal records, weekly activity, and a consistency calendar.
- Share a selected achievement or workout summary to the social feed; private logs remain private by default.
- Show today's nutrition totals as a compact dashboard summary.

### 6. Optional nutrition snapshot

This is not part of the first vertical slice. Add it only if the match-to-workout flow, workout dashboard, and safety controls are complete:

- Let users set manual calorie and macro targets privately.
- Log a simple daily calorie, protein, carbohydrate, and fat total.
- Show today's totals on the personal dashboard.
- Do not add recipe search, recipe publishing, AI recipes, or generated cooking videos to the MVP.

Avoid labels such as `extreme weight loss`. Use conservative weekly-rate choices, validation, and a recommendation to consult a qualified professional for aggressive goals, eating-disorder concerns, pregnancy, metabolic illness, or users under 18.

### 7. Safety and moderation

The first release needs:

- Minimum-age policy and date-of-birth handling.
- Block and report controls reachable from profiles, conversations, and posts.
- Photo/content moderation and an administrator review queue.
- Rate limits for match requests and messages.
- Approximate distance only; never send another user's raw coordinates to the client.
- Account deletion and deletion/export handling for sensitive fitness and location data.
- A first-meeting reminder recommending a staffed/public gym and telling a trusted person.

## Phase-two features

- Friends-only social feed, reactions, comments, and progress posts.
- Detailed food logging, recipe discovery, and user-submitted recipes.
- Trainer verification, client requests, and published workout programs.
- Gym verification, class schedules, events, and attendance.
- Push notifications and calendar integration.
- Group workouts and small accountability circles.
- Exercise demonstrations and form-check video workflows.
- Recipe media or short videos after licensing, cost, moderation, and generation latency are understood.

## Gymie assistant

Gymie can answer general exercise and nutrition questions, suggest a workout draft, and explain app data that the user explicitly shares with it. It should:

- Run through a server-side endpoint with no provider key in the app.
- Cite a curated source when making health or exercise claims.
- State uncertainty and avoid diagnoses or treatment.
- Escalate injury, severe symptom, eating-disorder, or emergency questions to an appropriate professional/service.
- Ask before using private journal data and never expose one user's information to another.

Gymie should enter the MVP only after the core match-to-workout flow works end to end.

## Success criteria for the senior-project demo

The demo is successful when two test users can:

1. Complete profiles and preferences.
2. Discover one another for understandable reasons.
3. Send and accept a request.
4. Chat and agree on a workout.
5. Confirm attendance afterward.
6. See the reliability history update.
7. Log the workout and see the dashboard/streak update.

If time remains, the optional nutrition snapshot can be demonstrated separately; it is not required to prove the product's main value.

## Short list of high-value improvements

1. Match on **availability and preferred gym** before relative strength; these better predict whether people can actually train together.
2. Replace a punitive credibility score with a transparent reliability history and dispute protection.
3. Keep friendship separate from workout-partner status so an unmatch never forces a social connection.
4. Add safety, blocking, reporting, approximate location, and public first-meeting guidance from day one.
5. Remove recipes from the MVP; later, consider a focused `Fuel` feature with saved meals and macro-aware suggestions instead of a separate recipe social network.
6. Add small accountability groups later; they provide value even when one partner is unavailable.
