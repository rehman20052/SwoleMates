# SwoleMates

SwoleMates is a mobile-first gym-partner matching and fitness accountability app. It helps people discover compatible workout partners, plan sessions, track training, and build trusted fitness connections.

## Project status

The repository now contains the product-definition docs and a base Expo/React Native TypeScript app. The starter app focuses on the matching experience first: discovery, ranked matches, workout planning, and team workflow.

## Start the app

Open this folder in VS Code, then run:

```bash
npm install
npm run start
```

Use Expo Go on your phone to scan the QR code, or run one of:

```bash
npm run ios
npm run android
```

## Core MVP

- Account onboarding and a public fitness profile
- Preference-based partner discovery with explicit dealbreakers
- Mutual match requests and private messaging
- Workout planning and two-sided attendance confirmation
- A transparent reliability record based on confirmed plans
- Personal workout logging, records, and consistency calendar
- Basic safety controls: block, report, privacy, and approximate location

A lightweight nutrition summary can be added after the complete match-to-workout flow is working. Social posting, detailed nutrition, recipes, Gymie, verified trainers, gym portals, events, and generated media are extensions and must not block completion of the core matching experience.

## Planning documents

- [Product specification](docs/PRODUCT_SPEC.md)
- [System context diagram — 30 interactions](docs/CONTEXT_DIAGRAM.md)
- [Initial data model](docs/DATA_MODEL.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Nutrition and AI API strategy](docs/API_STRATEGY.md)
- [Team workflow](docs/TEAM_WORKFLOW.md)
- [Recorded product decisions](docs/DECISIONS.md)

## Feature branches

Branches are organized by feature area so teammates can collaborate around the actual app features:

- `feature/user-accounts`
- `feature/profile-preferences`
- `feature/discovery-matching`
- `feature/match-requests-chat`
- `feature/workout-planning`
- `feature/reliability-checkins`
- `feature/progress-dashboard`
- `feature/safety-privacy`

Switch branches with:

```bash
git switch feature/discovery-matching
```

Replace `feature/discovery-matching` with the feature branch you are working on.

## Recommended implementation

The recommended default is an Expo/React Native TypeScript app backed by PostgreSQL, authentication, object storage, and realtime messaging through Supabase. External nutrition and AI services should only be called from trusted server-side functions so credentials are never shipped in the mobile app.
