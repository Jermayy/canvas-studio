# Runbook · Deploy, environments and migrations

How Canvas Studio is deployed, which settings live outside the repo, and the routine for shipping a change. Keep this current when a dashboard setting changes.

## Environments

| Environment | Frontend (Vercel)                                          | Backend (Supabase, Sydney)                | Data          |
| ----------- | ---------------------------------------------------------- | ----------------------------------------- | ------------- |
| Local       | `npm run dev` → `http://localhost:5173`                    | staging, via `.env` (or none: local-only) | test accounts |
| Preview     | one per PR, `canvas-studio-*-jermayys-projects.vercel.app` | staging (`lgizlqdryvafefrdwruc`)          | test accounts |
| Production  | `https://canvas-studio-jermayys-projects.vercel.app`       | production project                        | real users    |

Previews never use production data (playbook 12: isolated environments).

## Settings that live outside the repo

`vercel.json` holds build, rewrites, caching and security headers. These do not, so record changes here:

**Vercel project `jermayys-projects/canvas-studio`**

- Connected to GitHub `Jermayy/canvas-studio` (renamed from `Canva-Studio`; GitHub redirects the old URL); production branch `main`; Git deployments **enabled** (the CLI created the project with them disabled).
- Node.js version **24.x** (also pinned by `engines` in `package.json`, `.nvmrc` and CI).
- Deployment Protection: **Standard** (`prod_deployment_urls_and_all_previews`). The production domain is public; previews and per-deployment URLs need a Vercel login.
- Environment variables (plain config; both values are public by design):

  | Variable                        | Production         | Preview / Development |
  | ------------------------------- | ------------------ | --------------------- |
  | `VITE_SUPABASE_URL`             | production project | staging project       |
  | `VITE_SUPABASE_PUBLISHABLE_KEY` | production project | staging project       |

  Values are compiled into the bundle: **redeploy after changing them**. Never add a `service_role`/secret key (the app refuses to start with one).

**Supabase, both projects: Authentication**

- Email provider on, "Confirm email" on, minimum password length 8 (matches the client).
- URL Configuration:

  | Project    | Site URL                                             | Redirect allow-list                                                                   |
  | ---------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
  | Staging    | `http://localhost:5173`                              | `http://localhost:5173/**`, `https://canvas-studio-*-jermayys-projects.vercel.app/**` |
  | Production | `https://canvas-studio-jermayys-projects.vercel.app` | `https://canvas-studio-jermayys-projects.vercel.app/**`                               |

## Shipping a change

1. Open a PR. CI runs checks, SQL tests and e2e; Vercel builds a preview against **staging**.
2. If the PR adds a migration, apply it to **staging** before testing the preview:
   ```bash
   npx supabase link --project-ref lgizlqdryvafefrdwruc
   npx supabase db push --remote --dry-run   # review the list
   npx supabase db push --remote
   ```
   (`--remote` matters: without it the CLI targets a local Docker stack.)
3. Test the preview (log in to Vercel to open it).
4. Merge. `main` deploys to production automatically.
5. Apply the same migration to **production** (`link --project-ref <prod-ref>`, then the two `db push --remote` commands). Migrations are written expand-only/backward compatible, so applying just before or after the deploy is safe. Check which project is linked before pushing.
6. Verify production:
   ```bash
   E2E_BASE_URL=https://canvas-studio-jermayys-projects.vercel.app npm run test:e2e
   ```
   This includes the HTTP security-header checks.

## Smoke test (staging preview, after backend changes)

1. Sign up, confirm the email, sign in.
2. Create a design and upload an image; open the same account in a second browser and check it syncs.
3. Copy link → open it in a private window → Download PNG → Stop sharing → the link shows "isn't available".
4. Delete the account; check the user's files are gone from Storage and their rows from `designs` / `design_shares`.

## Rollback

- **Frontend:** Vercel → Deployments → the previous production deployment → **Promote to Production** (instant, no rebuild).
- **Database:** run the matching file in `supabase/rollback/` in the SQL editor. Read its header first: some rollbacks are destructive and need storage buckets emptied via the Storage API beforehand.

## Known gaps

- Free-plan Supabase projects pause after about a week without activity; open the production app before sharing the link (or upgrade).
- Production backups with point-in-time recovery (playbook 05 MUST) aren't available on the free plan: a recorded deviation until real users.
- Confirmation emails on staging redirect to the Site URL (`localhost:5173`), so signing up from a preview confirms the account but lands on localhost; sign in on the preview afterwards.
- **v2 hybrid (`feature/canvas-studio-hybrid`):** with `VITE_SUPABASE_*` unset, accounts are device-local and no backend is used; with them set, Supabase Auth, encrypted sync and share links use the tables from `20261125000000_encrypted_workspaces.sql` and the hardening in `20261126000000_share_and_quota_hardening.sql`. **Apply both migrations to production before merging** (the second makes share images private; the hybrid's public page needs its signed-URL policy) (it's expand-only, so live v1 keeps working); a v2 deploy without it shows "Sync paused" and share links fail. Rollback of the migration is destructive (see its header); rolling back only the deploy is safe. Go-live checklist: [docs/v2-overview.md](../v2-overview.md#action-points-to-take-the-hybrid-live).
- **Redirects that aren't allow-listed fall back to the Site URL, silently.** A reset or confirmation link requested from `localhost` against production opens the live site, signed in, instead of `/reset-password`. To test locally against production, temporarily add `http://localhost:5173/**` to production's Redirect URLs and remove it afterwards. (In auth logs, `referer` is this redirect target, not the page the user was on.)
- **v2 password reset (Supabase mode):** reset emails link to `/reset-password`, which the existing `/**` allow-list entries cover. PKCE means the link must be opened in the browser that requested it; the user also needs their recovery code (ADR 0011).
