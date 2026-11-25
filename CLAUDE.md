# Canvas Studio

Follows Jem's engineering playbook: @~/.claude/playbook/PLAYBOOK.md
(Global standards live in `~/Coding Projects/engineering-playbook`. Anything below overrides them for this project.)

## What this is

Local-first web app (static SPA on Vercel) for designing event graphics from templates and drag-and-drop elements, with PDF/PNG/JPEG/SVG export, view-only share links, native/email sharing, encrypted workspaces and encrypted cloud sync. Stage: v2 hybrid on `feature/canvas-studio-hybrid` (v2's rebuild plus v1's sync, share links and account deletion; see `docs/v2-overview.md`). v1 was migrated from Electron (ADR 0005).

## Stack

- Runtime: Node 24 for tooling (pinned in `.nvmrc` and `package.json#volta`); runs in modern browsers
- Frameworks: React 19, TypeScript 6 (TS 7 isn't supported by typescript-eslint yet), Vite 8, zustand, zod 4, lucide (icons), jsPDF (lazy). Rendering is React SVG (ADR 0009); no Konva
- Storage: IndexedDB through Dexie: `canvas-studio-v2-accounts` (verifiers, wrapped keys, session) and one AES-GCM-sealed workspace DB per user (ADR 0010), with plaintext sync bookkeeping tables. Supabase (when configured): `workspace_keys` (wrapped keys), `workspace_designs` (ciphertext, versioned), `workspace_shares`, buckets `workspace-assets`/`workspace-shares` (ADR 0012). v1's `designs`/`design_shares` are unused, awaiting a contract migration
- Auth: `IdentityProvider` port: device-local PBKDF2 accounts by default, Supabase Auth when `VITE_SUPABASE_*` are set (session in localStorage under `canvas-studio-auth`, ADR 0006). Password reset goes through recovery codes that re-wrap the data key (ADR 0011)
- Hosting: Vercel (`vercel.json`: headers, rewrites, caching); Supabase in Sydney (ap-southeast-2)

## Commands

```bash
npm install                  # deps (Node >= 24)
npm run dev                  # http://localhost:5173 (no .env needed: local-only)
npm test                     # all tests (node + jsdom projects)
npm run test:coverage        # with coverage thresholds
npm run test:db              # SQL/RLS tests on Postgres (PG* env vars; CI uses a service container)
npm run test:e2e             # Playwright journeys on the production build (E2E_BASE_URL for a deployment)
npm run lint                 # ESLint (type-aware, strict)
npm run format:check         # Prettier
npm run typecheck            # tsc for node + web projects
npm run check                # everything above; run before saying "done"
npm run build                # typecheck + production bundle in dist/
npm run preview              # serve dist/ locally
```

DB migration: `npx supabase db push --remote` (staging, then production after merge). Deploys, environments, dashboard-only Vercel/Supabase settings and rollback: `docs/runbooks/deploy.md`.

## Structure

- `src/main.tsx` — wiring only; `src/app/composeServices.ts` is the composition root (browser adapters → `AppServices`).
- `src/modules/<feature>/{domain,application,data,infrastructure,state,hooks,components}` — domain is pure and framework-free; screens reach services only through `app/services.ts` hooks.
- Browser APIs (downloads, Web Share, clipboard, canvas, IndexedDB, Web Crypto) sit behind ports so they're unit-testable.
- `src/shared` — logger, crypto, lib, design-system `ui/`. `src/styles` — CSS tokens and layers. `build/` — CSP helpers.
- `src/test` — factories and `testServices.tsx` (full fake service container for screen-level tests).

## Conventions specific to this project

Adapted from the portable steering kit the project was started with:

- Absolute imports only (`@/…`, `@build/…`); relative imports fail lint (config files excepted).
- Every `if` uses braces (`curly: all`). No non-null assertions in source (allowed in tests after an expectation).
- Every document entering the editor or arriving from the cloud is parsed with zod (`designDocumentSchema`). Patches and new elements are re-validated in `document/domain/operations.ts`.
- Components are functions, never stored in variables; extract a component instead of a `renderX()` helper. Non-component helpers live in non-`.tsx` files (Fast Refresh rule).
- No `setState` inside effects (React Compiler lint): use the "draft is null until edited" pattern (see `fields.tsx`) or set state in callbacks.
- Add tests to an existing test file where one exists. Coverage targets: domain/state/data/sync ≥ 90% lines, components ≥ 70% (enforced in `vitest.config.mts`).
- Logging only via `@shared/logger` (structured JSON, secret keys redacted). `console` is lint-banned elsewhere.
- Never commit or push unless explicitly asked.
- Every PR updates `README.md` (features, setup, config, structure, known gaps — whatever the change affects). CI enforces it (`.github/workflows/readme.yml`); the `skip-readme` label opts out only when there's genuinely nothing to document.

## Deviations from the playbook

- "MUST NOT store tokens in localStorage": **deviation**. A static SPA can't set HttpOnly cookies; the Supabase session is in localStorage, mitigated by a strict CSP and a lint ban on raw HTML injection. Threat model and revisit triggers in ADR 0006.
- No server API of our own: Supabase PostgREST + RLS is the API (ADR 0002). Health endpoints, rate limiting and auth throttling come from Supabase.
- Error tracker not yet integrated (open playbook question on vendor).

## Gotchas

- jsdom lacks canvas, `showModal`, ResizeObserver, DragEvent, pointer capture and object URLs: `test/setup.ts` stubs object URLs and pointer capture; `Dialog` falls back to the `open` attribute; text metrics use a deterministic estimate unless `configureTextMeasure` is called (main.tsx installs a canvas one).
- zustand selectors must return stable values: wrap array/object selectors in `useShallow` or the component re-renders forever.
- Workspace data is encrypted: inspecting IndexedDB shows only `{id, payload: {iv, data}}`. A wrong key makes records "skipped", not errors.
- Zod 4 runs `.refine` even after a prior check fails; guard inputs inside refinements.
- With fake timers in sync tests, fake only `setTimeout/setInterval` (fake-indexeddb needs real `setImmediate`).
- Browsers can unload a page before an IndexedDB write started in `beforeunload` finishes: autosave also flushes on `visibilitychange`/`pagehide`, and prompts to leave only while edits are unsaved.
- E2E specs run `page.evaluate` code in the browser, hence the separate `tsconfig.e2e.json` with DOM types.
- Element `x,y` is the top-left of the unrotated box; rotation is about the centre (`rotate(r, cx, cy)`). Text height is derived from content (`withAutoHeight`), so never set it directly.
- The app's own CSP blocks `fetch` of `blob:` URLs; read blobs directly.
- Never change a password without re-wrapping the data key (`Keyring.changePassword` / `recover`); otherwise the workspace becomes unreadable. Server-side password updates run in `beforeCommit` so a failure leaves the keyring untouched.
- The server only ever gets ciphertext: seal through `sync/envelope.ts`, never send a `DesignDocument` or image to Supabase directly. Pulled data is untrusted even after it decrypts (validate with zod; check the sealed id matches the row).
- Sync bookkeeping writes go through the engine's `mark` queue; never set a design's server `version` outside the engine, or the next push conflicts.
- Wrapped-key updates are version-checked (`WrappedKeyStore.update`); a `stale` AuthError means another device changed the key first, so nothing was stored.

## Sensitive areas

- `build/csp.ts`, `vercel.json` (security headers), `src/modules/auth/*` (KDF, keyring, throttling), `src/shared/crypto/*`, `src/modules/workspace/data/encryptedStores.ts`, `src/modules/auth/infrastructure/wrappedKeyStores.ts`, `src/modules/sync/envelope.ts`, `src/modules/account/*`, `src/modules/share/infrastructure/*`, `src/modules/workspace/domain/imageUpload.ts`, `src/modules/export/infrastructure/fileDelivery.ts`, `src/app/router.ts` (`safeNext`), `supabase/migrations/*`. Changes here need a security review (`/security-review`).
