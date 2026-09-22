# Product and architecture decisions

This file records decisions that affect the whole team. Update it when a decision changes rather than relying on chat history.

## 2026-09-15 — Product focus

**Decision:** The MVP centers on the complete partner journey: profile, discovery, mutual match, chat, scheduled workout, attendance confirmation, reliability history, and personal workout progress.

**Reason:** This is SwoleMates' distinctive value. Completing this loop well is stronger than presenting many disconnected, partially working tabs.

**Consequences:**

- Recipes, AI recipe generation/video, trainer commerce, and gym administration are not in the MVP.
- A small nutrition snapshot is optional after the core flow is complete.
- Social/community posting and Gymie are extensions unless required by the grading rubric.
- Reliability is transparent and commitment-based; ordinary inactivity or ending a match is not penalized.

## 2026-09-15 — Initial technology stack

**Decision:** Proceed with an Expo/React Native TypeScript client and a Supabase/PostgreSQL backend, subject to any course-specific technology requirement.

**Reason:** The stack supports one iOS/Android codebase and fits the relational, realtime, media, authentication, and authorization needs of the product.

**Consequences:**

- Use Expo Router for application navigation.
- Keep database changes in migrations and enforce private-data access with Row Level Security.
- Keep AI, nutrition-provider, moderation, and other secret-bearing calls in trusted server-side functions.
- Never commit provider secrets or service-role credentials.

