# Amar Dentist

Current gated delivery status is tracked in [docs/PROGRESS.md](docs/PROGRESS.md). A context-independent implementation handoff is maintained in [docs/CONTINUATION.md](docs/CONTINUATION.md).

Amar Dentist is a Bangladesh-focused dental-care platform built as six verified vertical phases. It combines a patient booking experience, multi-clinic professional workflows, a dental EHR, clinic operations, payments, subscriptions, and carefully bounded AI assistance.

## Workspace

- `apps/mobile` — Expo patient and professional app
- `apps/admin` — responsive platform administration console
- `packages/domain` — shared roles, validation, localization, and API contracts
- `supabase` — versioned schema, RLS, tests, and Edge Functions
- `docs/design` — approved north-star design compositions

## Commands

```bash
pnpm install
pnpm dev:mobile
pnpm dev:admin
pnpm verify
```

Copy each `.env.example` to its local `.env` equivalent. Never commit provider credentials or Supabase secret keys.

## Delivery rule

Each phase must pass its gate before the next phase begins. Later-phase schema and provider integrations are not prebuilt into Phase 1.
