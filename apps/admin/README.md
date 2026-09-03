# Amar Dentist Admin

The responsive platform console for Super Admins and invitation-only
operational administrators.

The UI uses focused HeroUI v3 primitives for accessible actions and status
chips. Animated overlays are source-owned Animate UI registry components, so
their interaction and motion remain reviewable inside this repository.

```bash
pnpm dev
pnpm test
pnpm test:e2e
pnpm build
```

Only the Supabase publishable key belongs in the browser environment. The
service-role key remains an Edge Function secret.
