# Implementation plan

## Recommended architecture

- **Client:** Expo + React Native + TypeScript with Expo Router for iOS and Android.
- **Backend:** Supabase Auth, PostgreSQL, Row Level Security, Storage, and Realtime.
- **Trusted server code:** Supabase Edge Functions or a small TypeScript API for matching, reliability, nutrition-provider calls, moderation, and Gymie.
- **AI:** a server-side OpenAI integration with curated-source retrieval, guardrails, and per-user authorization.
- **Media:** object storage with signed uploads, size/type validation, moderation state, and generated thumbnails.
- **Location:** geospatial database queries using a coarse location or selected gym; exact user coordinates never leave trusted server code.

PostgreSQL is preferred over a document database because SwoleMates has many explicit relationships, uniqueness rules, histories, and two-sided state transitions.

## Delivery phases

### Phase 0 — Agree on scope and foundation

- Confirm the course's required technologies and deliverables.
- Agree on MVP versus phase-two features.
- Approve naming, target users, age policy, visual direction, and privacy rules.
- Create project conventions, environment templates, CI checks, and a protected `main` branch.

### Phase 1 — App shell, authentication, and profiles

- Scaffold the mobile app and backend project.
- Add registration, login, onboarding, profile editing, photo upload, and visibility controls.
- Seed exercises, gyms, and realistic demo accounts.

### Phase 2 — Discovery and matching

- Implement preferences and dealbreakers.
- Build secure candidate filtering and explainable ranking.
- Add discovery cards, match requests, acceptance/decline, unmatch, block, and report.

### Phase 3 — Messaging, scheduling, and reliability

- Add authorized realtime conversations.
- Propose and accept workout sessions.
- Add two-sided attendance confirmation, disputes, reliability events, and a transparent summary.

This phase completes the product's main match-to-workout loop and should be the first major demo milestone.

### Phase 4 — Workout dashboard

- Add templates, exercises, set logging, records, calendar activity, and streak calculations.
- Add dashboard summaries and optional sharing of selected achievements.

### Phase 5 — Optional nutrition snapshot

- Add manual macro targets, lightweight daily logging, and dashboard totals only if the core flow is complete.
- Keep recipes and external food-provider integration out of the graded MVP.

### Phase 6 — Social and Gymie

- Add friends-only feed, posts, comments, reactions, and moderation.
- Add Gymie only through the backend with citations, privacy boundaries, and health-safety responses.

### Phase 7 — Polish and evaluation

- Accessibility, performance, offline/error states, notifications, analytics, and security review.
- Automated tests for authorization and every match/session state transition.
- Seeded demo flow, presentation material, and deployment documentation.

## Team workflow

- Keep `main` deployable and use short feature branches such as `feature/profile-onboarding`.
- Open a pull request for each coherent feature and require at least one teammate review.
- Do not commit `.env` files, access tokens, service-role keys, or private user data.
- Record database changes as ordered migrations and review them like application code.
- Give each teammate a clear domain owner while still reviewing across domains.

Suggested ownership for four people:

1. Mobile UI and design system.
2. Authentication, profiles, discovery, and matching.
3. Messaging, scheduling, workouts, and reliability.
4. Nutrition journal, Gymie, testing, and deployment integration.

## First implementation milestone

Build a vertical slice before building every tab: two seeded users sign in, discover one another, match, send a message, schedule a workout, confirm attendance, and see reliability update. This proves the riskiest product and data-model decisions early.

## Decisions needed before scaffolding

1. Is Expo/React Native acceptable for the course, or is another frontend required?
2. Is Supabase/PostgreSQL acceptable, or must the team use a specific backend/database?
3. Are trainers and gyms required actors for the graded MVP?
4. Is the app restricted to adults (recommended for the first release)?
5. How many teammates are building it, and what is the delivery date?

## Product boundary

SwoleMates remains one app, but not every planned capability ships at once. Keep the codebase modular so matching, workouts, nutrition, social, trainers, and gyms can evolve independently. The first release should expose no more than five primary destinations: `Discover`, `Matches`, `Dashboard`, `Community` (optional), and `Profile`. Nutrition belongs inside the dashboard when introduced; there is no recipe tab in the current scope.
