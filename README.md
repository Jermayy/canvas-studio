# Canvas Studio

**Live app: [canvas-studio-jermayys-projects.vercel.app](https://canvas-studio-jermayys-projects.vercel.app)** (production, deployed from `main`).

A professional, browser-based studio for event graphics: posters, invitations, slides, social posts and banners, for birthdays and Christmas parties through to conferences and award nights. Start from a template or a blank canvas, design with precision tools, and export print-ready PDF, PNG, JPEG or vector SVG.

> **v2** is a fresh implementation; this **hybrid** branch adds v1's real cloud sync, share links and account deletion back on top of it, encrypted before anything leaves the browser. For what changed from v1, the code worth reading and the go-live checklist, see **[docs/v2-overview.md](docs/v2-overview.md)**.

## Why

Event graphics shouldn't need an install, a subscription or a design degree, and work files shouldn't be readable by whoever uses the computer next. Canvas Studio opens from a link, works offline once loaded, saves as you type, and encrypts your designs with a key only your password unlocks.

## Features

- **Secure accounts.** Device-local accounts (PBKDF2-SHA256, 600k iterations; throttled after 5 failed attempts; generic errors) or Supabase Auth when configured. Sessions last 12 hours, or 30 days with "keep me signed in", and an open tab signs out when its session expires.
- **Encrypted workspaces.** Every design and uploaded image is sealed with AES-256-GCM using a per-account key that only your password unlocks (ADR 0010).
- **Encrypted cloud sync.** With Supabase, designs and images sync between your devices as ciphertext: the server never sees them unencrypted. Your key is stored wrapped by your password and recovery code, so any device unlocks it. Edits from other devices arrive live (realtime, with polling as a fallback). Conflicting edits never overwrite each other: the cloud copy wins and yours is kept as a "(conflicted copy)". An open design changed elsewhere offers **Load latest** (ADR 0012).
- **Password reset that keeps your designs.** Each account gets a one-time recovery code at sign-up; "Forgot password?" takes your email, the code and a new password and re-encrypts the key, so nothing is lost. Signed in, **Account & security** changes the password or issues a new code (ADR 0011).
- **Delete your account.** **Account & security → Delete account**, confirmed with your password, deletes everything: cloud designs, images, share links, your sign-in, the wrapped key and this device's copy. With Supabase, the reset starts from an emailed link.
- **Sandbox, no account needed.** The full editor from the landing page, offline-capable. Nothing is saved, and the UI says so (banner, "Not saved" chip, leave-page warning).
- **Projects dashboard.** Filter by template type, date created and last edited; search and sort; grid or list view. Filters live in the URL. Rename, duplicate, and delete with undo.
- **Templates and formats.** 10 templates across birthday, Christmas, wedding, corporate, conference and party, plus blank canvases in 8 formats (A4, Letter, 5×7 invitation, square, portrait, story, 16:9 slide, web banner).
- **Elements.** Text styles and font pairings (11 system font families), 9 shapes (with corner radius, gradient fills, outlines, drop shadows), lines, arrows and connectors, 53 icons, and your own images (PNG, JPEG, GIF or WebP up to 15 MB, checked by file signature).
- **Precision editor.** Drag, resize and rotate handles (resizing works along a rotated element's own axes), smart guides with snapping (hold Alt to move freely), box select, multi-select, align and distribute, layer order, copy/paste, numeric position and size, undo/redo, zoom and fit, and in-place text editing.
- **Clear layers.** Every layer says what it is and what state it's in ("Text · Didot · 30px · Regular", "Locked — can't be moved, resized or deleted", "Hidden — not shown or exported", "Layer 3 of 9 from the front"). Drag or Alt+↑/↓ to reorder; F2 to rename.
- **Power-user tools.** ⌘K command palette, single-key panel shortcuts, a shortcut sheet (`?`), and a live status bar with size, position, rotation and stack position.
- **Export.** PDF, PNG, JPEG or SVG with a validated custom file name, 1–4× size with output pixels and dpi shown, JPEG quality, and transparent PNG/SVG. Progress shows each phase.
- **Share.** A **view-only link** (`/s/<token>`, with Supabase): anyone with it sees the design's name and an image, and can download a PNG; update it after changes or stop sharing at any time. Also the device's native share sheet (files), an email draft in your mail app (the file is downloaded to attach), or copy the image to the clipboard.
- **Live feedback.** Optimistic saving (Unsaved changes → Saving… → Saved, or Save failed · Retry), cloud sync status (Syncing / Synced / Offline / Sync paused, live or polling), skeleton loading, inline validation, a password strength meter, and toasts with undo.
- **Make it yours.** System/light/dark theme, 6 accent colours, comfortable/compact density, 3 interface sizes, dotted/grid/plain canvas backdrop, snapping, layer hints and reduced motion.

## Quick start

```bash
volta install node@24        # or use .nvmrc; Node >= 24 is required
npm install
npm run dev                  # http://localhost:5173
npm test                     # unit + component tests
npm run check                # format, lint, typecheck, tests with coverage
npx playwright install chromium   # once
npm run test:e2e             # browser journeys against the production build
npm run test:db              # v1 SQL tests (RLS, functions); needs a Postgres, see below
```

**No backend is needed.** With no `.env`, accounts are device-local and everything works. Create an account, or choose "Try without an account" for the sandbox.

## Configuration

| Variable                        | Required              | Description                                                  |
| ------------------------------- | --------------------- | ------------------------------------------------------------ |
| `VITE_SUPABASE_URL`             | for Supabase accounts | Supabase project URL (https; http only for a local Supabase) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | for Supabase accounts | Supabase publishable/anon key                                |

Set both or neither; setting only one is a startup error, and a `service_role`/secret key is refused. The values are compiled into the bundle, so they're public by design. When set, Supabase Auth verifies credentials (email confirmation supported), and designs sync encrypted, with share links available. Without them, accounts and designs stay on the device and there's no sync or share links.

## Setting up Supabase (optional)

1. Create a project in **Sydney (ap-southeast-2)**.
2. Under **Authentication → Providers**, keep Email enabled. "Confirm email" on is recommended.
3. Under **Authentication → URL Configuration**, set the Site URL and allow-list redirects to `/sign-in` (see [docs/runbooks/deploy.md](docs/runbooks/deploy.md)).
4. Apply the migrations: `npx supabase link --project-ref <ref>` then `npx supabase db push --remote`. `20261125000000_encrypted_workspaces.sql` adds the v2 tables (`workspace_keys`, `workspace_designs`, `workspace_shares`), buckets (`workspace-assets` private, `workspace-shares` public) and functions. Rollbacks are in `supabase/rollback/`.
5. Copy the URL and publishable key into `.env` (`cp .env.example .env`).

v1's tables (`designs`, `design_shares`) and buckets are still created by the older migrations but unused; a later contract migration drops them.

## Tests

- **Unit and component (Vitest + Testing Library):** 302 tests across the domain, stores, crypto, auth, sync and export pipeline, plus full-screen flows (sign-up → dashboard → studio, canvas gestures, keyboard shortcuts, export/share dialogs, share links, account deletion). Sync runs two "devices" against an in-memory cloud with the server's rules (conflicts, tombstones, images, offline, retries, realtime, wrong keys). Coverage thresholds: domain/application/state/data/sync ≥ 90% lines, components ≥ 70%.
- **End to end (Playwright, production build):** the sandbox exports real PNG, JPEG, SVG and PDF files (signatures checked); sign-up → edit → hidden-tab flush → reload → ciphertext-only IndexedDB → filters; strict CSP with no console errors. Against a deployment, `E2E_BASE_URL=https://<preview-url> npm run test:e2e` also checks the HTTP security headers.
- **Database:** `supabase/tests/*.test.sql` check RLS, version enforcement, tombstones without ciphertext, share links and account deletion on plain Postgres with Supabase stand-ins. Locally: `docker run --rm -d -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17 && npm run test:db`.

## Deploying (Vercel)

A static SPA. `vercel.json` sets the build, SPA rewrites, long-lived caching for hashed assets and the security headers (HSTS, `frame-ancestors`, nosniff, COOP, Permissions-Policy). The CSP is injected into `index.html` at build time. Every PR gets a preview; merging to `main` deploys production. Rollback: promote the previous deployment. Details, environments and dashboard-only settings: [docs/runbooks/deploy.md](docs/runbooks/deploy.md).

**Live:** https://canvas-studio-jermayys-projects.vercel.app (production Supabase project `Canva-Studio-Production`, Sydney).

## Keyboard shortcuts

| Action                   | Shortcut                                             |
| ------------------------ | ---------------------------------------------------- |
| Command palette          | ⌘K                                                   |
| Undo / redo              | ⌘Z / ⇧⌘Z (Ctrl on Windows/Linux)                     |
| Save now / export        | ⌘S / ⌘E                                              |
| Select all / deselect    | ⌘A / Esc                                             |
| Duplicate / copy / paste | ⌘D / ⌘C / ⌘V                                         |
| Delete                   | Delete / Backspace (locked layers kept)              |
| Nudge                    | Arrow keys (Shift = 10 px)                           |
| Layer order              | [ ] (Shift: to back / front)                         |
| Edit text                | Enter or double-click; ⌘Enter to finish              |
| Zoom                     | ⌘+ / ⌘−, ⌘+scroll, Shift+1 fit, Shift+0 100%         |
| Panels                   | T text · S shapes · I icons · U uploads · B backdrop |
| All shortcuts            | ?                                                    |

## Project structure

```
index.html              App shell (CSP injected at build time)
build/                  Build-time helpers (CSP), run by vite.config.mts
src/
  main.tsx              Entry point: logger, text metrics, config, services
  app/                  App shell, router, service container, composition root
  shared/               Logger, AES-GCM crypto, utilities, design-system UI
  modules/
    document/domain     Schema, geometry, operations, history, snapping, text layout, layers, filters
    library/            Templates, presets, icon catalog, template picker
    render/             SVG renderer shared by editor, thumbnails and exports
    workspace/          Storage ports, encrypted IndexedDB stores, optimistic cache, upload rules
    auth/               Credentials, throttling, AuthService, local + Supabase providers, keyring
    sync/               Sync engine, sealed envelopes, bookkeeping, Supabase adapter, status chip
    export/             Export options, pipeline, browser encoders, file delivery, dialog
    share/              Share links (store, card, public page), email drafts, share dialog
    account/            Account deletion use case and cloud-file cleanup
    preferences/        Interface customisation
    dashboard/          Projects page
    studio/             Editor: store, gestures, shortcuts, commands, panels, canvas
    landing/            Marketing page
  styles/               Tokens, base, components, pages, studio
  test/                 Factories and a fake service container
e2e/                    Playwright journeys
supabase/               SQL migrations (+ rollbacks, RLS tests on Postgres)
docs/                   Architecture, ADRs, runbooks, v2 overview
```

## Architecture

See [docs/architecture.md](docs/architecture.md) and [docs/adr/](docs/adr/): one SVG renderer for everything ([ADR 0009](docs/adr/0009-svg-renderer-for-editor-and-exports.md)); encrypted workspaces and device-local accounts ([ADR 0010](docs/adr/0010-encrypted-local-workspaces-and-simulated-sync.md)); password reset with recovery codes ([ADR 0011](docs/adr/0011-password-reset-with-recovery-codes.md)); encrypted cloud sync, server-held wrapped keys and share links ([ADR 0012](docs/adr/0012-encrypted-cloud-sync-and-share-links.md)). The v1 decisions (ADRs 0001–0008) are kept for history.

## Data and privacy

- **In this browser:** device-local accounts (email, name, salted password verifier, and the data key wrapped by your password and by your recovery code; never the code itself), the current session, and your designs and images, encrypted with your account key. Interface preferences and sign-in throttling counters are in localStorage.
- **Leaves the device:** nothing, with device-local accounts. With Supabase configured (Sydney): your email, name and password hash (Supabase Auth); your data key **wrapped** by your password and by your recovery code; and your designs and images **as ciphertext**, plus the sync metadata needed (ids, versions, timestamps, deletion markers). Deleted designs keep only that metadata, not their content.
- **Public (only what you share):** for each shared design, its name and a PNG image, readable by anyone with the link until you stop sharing (CDN caches may keep the image up to a minute).
- **Not end-to-end against the auth provider:** the same password signs in to Supabase Auth, so whoever runs the auth server could in principle capture it and unwrap the key. A database or backup leak alone exposes only ciphertext and the wrapped key (ADR 0012).
- **Account deletion (self-service):** deletes cloud files and share images, then the account (keys, designs and links cascade), then this device's copy. Each step is safe to retry.
- **Sandbox:** nothing is stored; closing the tab discards the design.
- **No analytics or tracking.**

## Known gaps

- **Conflicts aren't merged.** When two devices edit the same design, both versions are kept (the other as a "(conflicted copy)").
- **Only images used by a synced design roam.** Library images that no design uses stay on the device that uploaded them.
- **Supabase is tested with fakes and plain Postgres.** Smoke-test sync, share links, email reset and account deletion against the staging project before production.
- **Lost password and lost recovery code** means the encrypted workspace can't be recovered (by design, ADR 0011). The Supabase email-reset path is tested with fakes only; smoke-test it in staging.
- **PDF is raster inside a vector page** (up to 384 dpi), not native vector.
- **System fonts only** (CSP), so typography can vary slightly between operating systems.
- **v1 data isn't migrated** (it was test data). v1 share links (`/s/<token>` from v1) stop working.
- **Opening or reloading the app offline needs a service worker** (planned). The sandbox works offline once loaded.
- **No error-tracking service yet**; logs are structured JSON in the console.
- **Held-back dependencies:** TypeScript stays on 6.x until typescript-eslint supports 7, and `@types/node` on 24.x to match the runtime (see `.github/dependabot.yml`).

## Contributing

Every pull request updates this README to match the change. CI's **README** check fails a PR that doesn't touch it; add the `skip-readme` label only when there's genuinely nothing to document. Dependabot PRs are exempt.

`main` is protected: changes land through a pull request with the `check`, `database`, `e2e` and `readme-updated` checks green and the branch up to date; force-pushes and deletion are blocked, for admins too.

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md) (GitHub private vulnerability reporting), not in a public issue.

## Standards

Follows the engineering playbook (`~/Coding Projects/engineering-playbook`).
