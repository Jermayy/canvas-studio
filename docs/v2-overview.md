# Canvas Studio v2: what changed and why

Branch: `feature-canvas-studio-v2`, built fresh from `main` (v1), then `feature/canvas-studio-hybrid`, which brings back v1's server features (real sync, share links, account deletion) on top of v2's encrypted client. The hybrid is what merges into `main`. This page summarises how it differs from v1, the parts of the code worth reading first, what was verified, and what's left before going live. The original v2 brief is at the bottom.

## At a glance

|                 | v1 (main)                            | v2 hybrid (this branch)                                                                                                                                                                                       |
| --------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering       | Konva (HTML canvas)                  | One React SVG renderer for editor, thumbnails and exports (ADR 0009)                                                                                                                                          |
| Export          | PDF, PNG                             | PDF, PNG, JPEG, **SVG (vector)**; 1–4× scale with dpi readout; JPEG quality; transparent PNG/SVG; custom, validated file names                                                                                |
| Sign-in         | Supabase only (or offline guest)     | Pluggable: device-local accounts (PBKDF2 + throttling) or Supabase Auth; **password reset with recovery codes** that keeps encrypted designs (ADR 0011)                                                       |
| Data at rest    | Plain IndexedDB                      | **AES-256-GCM envelope encryption** per account (ADR 0010)                                                                                                                                                    |
| No-account mode | Guest mode, saved locally            | **Sandbox**: full editor, nothing saved, clearly signposted                                                                                                                                                   |
| Sync            | Real Supabase sync + realtime        | **Real Supabase sync, ciphertext only** (ADR 0012): version-checked pushes, conflicted copies, realtime + polling, encrypted images; the wrapped key roams so every device unlocks with the password          |
| Sharing         | Download, Web Share, view-only links | **View-only links** (`/s/<token>`, publish/update/stop), native share sheet, **email draft** (mailto + auto-download), **copy image** to clipboard                                                            |
| Account         | Self-service deletion                | Self-service deletion (cloud files, account, keys, local data), change password, recovery codes                                                                                                               |
| Home            | List of designs                      | **Projects dashboard**: filter by template type, created and last-edited ranges, search, sort, grid/list, all in the URL                                                                                      |
| Elements        | Shapes, text, stickers, images       | 9 shapes, gradients, outlines, shadows, lines/arrows/connectors, 53 icons, text styles and font pairings, images                                                                                              |
| Editor          | Toolbar + properties                 | Tool rail and insert panel, inspector, **Layers panel with plain-language descriptions**, status bar, smart guides, marquee select, rotate/resize handles, **⌘K command palette**, copy/paste, shortcut sheet |
| Feedback        | Basic                                | Live save state (Unsaved → Saving → Saved / Retry), sync state, export phases, skeletons, inline validation, toasts with undo                                                                                 |
| Customisation   | –                                    | Theme (system/light/dark), 6 accents, density, interface scale, canvas backdrop, snapping, layer hints, reduced motion                                                                                        |
| Routing         | Single screen + share page           | `/`, `/sign-in`, `/sign-up`, `/reset-password`, `/projects?…`, `/studio/:id`, `/sandbox`, `/s/:token` (History API, guarded)                                                                                  |

## Code worth reading first

- **`document/domain/geometry.ts`**: resizing rotated boxes in their own frame, with the opposite handle fixed. This is the maths behind professional-feeling handles.
- **`studio/state/studioStore.ts`**: every edit goes through `commit` (pure operation → zod validation → one undo step → optimistic save). Drags use `beginGesture` / `previewGesture` / `endGesture`, so a drag is a single undo step and a single save.
- **`workspace/state/workspaceStore.ts`**: the optimistic cache with per-document write-behind, flush on hide, retry on failure, delete rollback, and restore for undo.
- **`auth/infrastructure/keyring.ts`** + **`passwordKdf.ts`**: envelope encryption with non-extractable keys; a wrong password fails the GCM tag.
- **`render/DesignSvg.tsx`**: one renderer, so what you see is exactly what you export.
- **`studio/commands.ts`**: one command registry feeds the palette, and shortcuts reuse the same store actions.
- **`document/domain/layers.ts`**: human-readable layer titles, details, state notes and stack positions, shared by the Layers panel, status bar and screen readers.
- **`sync/syncEngine.ts`** + **`sync/envelope.ts`**: v1's sync algorithm over sealed payloads. It decrypts and validates everything it pulls, never overwrites an unsaved edit, and keeps the losing side of a conflict as a copy.
- **`app/composeServices.ts`**: the composition root; everything else depends on ports. `src/test/testServices.tsx` swaps in fakes to run whole screens in jsdom.

Design principles in practice:

- **SOLID:** small ports (`IdentityProvider`, `Keyring`, `SessionVault`, `DocumentStore`, `AssetStore`, `WrappedKeyStore`, `RemoteWorkspace`, `SyncMetaStore`, `ShareStore`, `Rasterizer`, `PdfWriter`, `SvgRenderer`, `FileDelivery`) with swappable adapters.
- **DRY:** one renderer, one command registry, shared export settings between the Export and Share dialogs, and a shared template picker.
- **YAGNI:** no groups or rulers, and no merge of concurrent edits (conflicts keep both versions); the ports leave room for them.

## What was verified

- `npm run check`: Prettier, ESLint (strict, type-aware), TypeScript (strict), 302 Vitest tests with coverage thresholds (domain/state/data/application/sync ≥ 90% lines, components ≥ 70%) all pass. Sync tests run two "devices" against an in-memory cloud with the server's rules: conflicts, tombstones and restore, unsaved-edit conflicts, images, paging, offline, retries, realtime, wrong keys and swapped rows.
- `npm run test:db`: RLS and function tests on Postgres, including 21 checks for the encrypted-workspace migration (owner-only keys and designs, version enforcement, no ciphertext on tombstones, share links, account deletion cascade).
- `npm run test:e2e` (Playwright, production build): sandbox → real PNG, JPEG, SVG and PDF downloads with checked file signatures; sign-up → edit → hidden-tab flush → reload → ciphertext-only IndexedDB → dashboard filters; strict CSP; no console errors.
- Manual check in Chrome (dev server): landing, sandbox, drag/resize/undo, export of all four formats (PNG checked visually), sign-up with inline validation, encrypted reload, filters/search, save/sync chips, command palette, light theme with teal accent.

## Known gaps and trade-offs

- **Not end-to-end against a malicious auth operator** (ADR 0012): the server stores only ciphertext and wrapped keys, but the same password signs in to Supabase Auth.
- Conflicts keep both versions instead of merging. Unused library images don't roam; only images that a synced design uses are downloaded.
- The Supabase adapters are tested with fakes and the SQL on plain Postgres; the full flow must be smoke-tested against the staging project before production.
- **Password reset needs the recovery code** (ADR 0011): losing both the password and the code still means a lost workspace, by design. The Supabase email-reset path is unit-tested with fakes only.
- PDF is a high-resolution raster inside a vector page, not native vector.
- System fonts only (CSP), so typography can vary slightly between operating systems.
- Mobile layout works but is tuned for tablet and desktop. Touch gestures (pinch-zoom on the canvas) are basic.
- No groups or rulers. v1 designs (test data) aren't migrated.
- Bundle: the main chunk is ~151 KB gzipped (React, zod, Dexie); the editor and exporters load on demand.

## Action points to take the hybrid live

1. **Apply the migration to staging:** `npx supabase db push --remote` against the staging project (`20261125000000_encrypted_workspaces.sql`). It's expand-only, so the live v1 app keeps working.
2. **Smoke-test the preview deployment against staging:** sign up, then sign in on a second browser and check the design appears; edit on both to see a conflicted copy; upload an image; create, open, update and stop a share link; reset a password by email (add `/reset-password` to the redirect allow-list); delete the account and confirm the rows and files are gone. `E2E_BASE_URL=<preview> npm run test:e2e` also checks the security headers.
3. **Apply `20261126000000_share_and_quota_hardening.sql` to production** (`npx supabase db push --remote`), before merging, so the share page's signed URLs work.
4. **Review and merge** the hybrid PR (CI and branch protection as before).
5. **Let the merge deploy.** Both migrations are already on production by then (`20261125000000` was applied on 2026-11-25), so v2 clients never meet a missing table or policy.
6. **Before real users:** set up custom SMTP (Authentication → SMTP Settings). Supabase's built-in email only sends a few messages an hour for the whole project, so sign-ups and password resets fail with "We can't send more emails right now". Also add an error tracker (open playbook question on the vendor).
7. **Later (contract migration):** drop v1's `designs`, `design_shares` and their buckets once nothing reads them.

## Original brief

Kept verbatim for future reference.

```text
push the branch with the PR description included in it (any live syncing to the cloud can be simulated for now but UI and feedback should be visible for User experience)

VERSION CONTROL:
- switch back to the original branch
- New Branch should be called "feature-canvas-studio-v2"
- Completely fresh implementation

VERSION 2 REQUIREMENTS:
- Implement an advanced version of this application with these key features:
- SECURE login/auth capabilities, offline version with no saving available on the landing page
- Multiple Export/Download file formats: PDF, Jpeg, PNG, Vector
- Filtering by template type, date of creation,last edited
- Live update to local storage with optimistic caching
- dynamic UI feedback on saving, user input
- larger variety of elements for user to interact with
- custom file name input field
- native sharing and email sharing capabilities
- Loading states for UI feedback
- customisable app UI
- user uploaded image use on canvas
- clearer messaging on layers for each element on the canvas

IMPLEMENTATION APPROACH:
- This should feel like a professional business graphic application, assume you are a power user who needs to build high quality graphics for their full time work for professional events. This app should be friendly to casual and professionals alike

Make this implementation completely different to version 1:
- Different UI components and patterns
- Different User Experience Flow
- More Sophisticated Code Architecture
- professional polish and attention to detail

PROCESS:
1. Refer to Main branch with original implementation
2. git branch -b to  "feature-canvas-studio-v2"
3. implement new version of the application respecting all steering files and foundational system design principles (SOLID, YAGNI, DRY, etc)
4. Thoroughly test all functionality
5. Point out final action points required from me to turn this version live if I wish
6. Create a new documentation file that outlines key differences or code stand outs + this prompt for future referral
5. Commit changes and run new dev server when ready

Show me something that would be production/portfolio ready for an employer and ready to market status
```
