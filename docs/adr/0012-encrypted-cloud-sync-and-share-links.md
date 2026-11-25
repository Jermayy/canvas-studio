# 0012 · Encrypted cloud sync, server-held wrapped keys and share links (hybrid)

- **Status:** Accepted
- **Date:** 2026-11-25
- **Relates to:** supersedes the "simulated sync" part of ADR 0010; builds on 0003 (local-first sync), 0008 (share links), 0011 (recovery codes)

## Context

v2 (ADR 0010) encrypted every workspace with a per-account data key but shipped a **simulated** cloud, and dropped v1's share links and self-service account deletion. v1 (main) had real Supabase sync with version-checked writes, conflict copies and realtime, but stored designs in plaintext. The hybrid branch keeps v2's client and brings back v1's server features without giving up encryption.

Two things make encrypted roaming hard. The second device needs the data key. And the server can no longer validate, search or show designs.

## Options considered

1. **Port v1's sync as-is (plaintext rows).** Simple and proven, but it throws away at-rest encryption the moment data leaves the browser.
2. **Encrypted rows, key never leaves the device.** The server can't read anything, but the account only works on the device that created it. That isn't sync.
3. **Encrypted rows, wrapped key stored server-side.** The data key is uploaded only wrapped by the password-derived key and by the recovery-code-derived key (the same envelope as ADR 0011). Any device that knows the password unwraps it locally.

## Decision

Option 3.

- **Keys:** `workspace_keys` holds `{password_wrap, recovery_wrap, version}` per user (RLS: owner only, no delete; cascades with the account). The keyring talks to a `WrappedKeyStore` port. Supabase accounts use the server store (with a one-time upload of any key that only exists on this device). Local accounts keep using IndexedDB. Every update is **version-checked**, so two devices changing the password or recovery code at once can't silently undo each other. The loser gets `stale` and nothing is stored.
- **Designs:** `workspace_designs` stores `{ciphertext, iv}` (AES-256-GCM, base64) plus the plaintext sync metadata: id, server-owned version, client and server times, and the tombstone. A check constraint requires ciphertext on live rows and **forbids** it on tombstones, so deleting a design deletes its content from the server.
- **Sync algorithm:** v1's, unchanged in substance (ADR 0003): dirty marks, push with the expected version, server-wins conflicts that keep the local edit as a "(conflicted copy)", a keyset pull cursor rewound by 5 s, realtime with 30 s polling as a fallback, and a Web Lock so tabs don't race. New details:
  - Bookkeeping (`syncDesigns`, `syncAssets`, `syncValues` tables in the workspace DB) is plaintext and contains only ids, versions and flags.
  - An edit that's still waiting to be stored counts as a conflict, so a pull never overwrites typing.
  - Pulled designs are decrypted and then validated with zod; the sealed id must match the row id. Anything unreadable stops the pass with a visible "reload to update" error rather than being applied or copied.
  - An open editor is never changed underneath the user: it shows "changed on another device", with **Load latest**.
- **Images:** sealed `{meta, bytes}` JSON envelopes in the private `workspace-assets` bucket under `<user id>/<asset id>`. Upload and delete are queued like designs. A device downloads the images that the designs it pulls actually use.
- **Share links:** `workspace_shares` plus the public `workspace-shares` bucket, with the same semantics as ADR 0008. Sharing is an explicit **publish** of the design's name and a PNG (max 2400 px, 15 MB). `get_workspace_share()` returns only exact-token, non-deleted shares. The rest of the workspace stays sealed.
- **Account deletion:** deletes cloud files (v2 and legacy v1 buckets, share images) and then calls `delete_my_account()`, which now also waits for `workspace-shares` images. It then removes the wrapped key, the session and the local encrypted database. Local accounts delete their device records. Sync is stopped first so nothing is re-uploaded.
- **Expand-only:** v1's `designs` / `design_shares` tables stay in place until a later contract migration, so main keeps working until the hybrid is live.

## Consequences

- Designs roam between devices and stay unreadable to the database, its backups and anyone holding the anon key. The server sees ids, sizes, timestamps and how often designs change, plus the name and image of anything shared by link.
- **Not end-to-end against a malicious operator:** the same password is sent to Supabase Auth over TLS at sign-in. Someone who controls the auth server could capture it and unwrap the key. A database leak alone allows only an offline guessing attack on the PBKDF2-SHA256 (600k) wrap, comparable to the password hash. A separate encryption passphrase would close this, at a real UX cost; revisit if the threat model changes.
- The server can't validate design content, so clients must (they do, with zod). It also can't stop a malicious server from replaying an older ciphertext for the same row. GCM doesn't bind the row id, but the id check after decryption catches rows that were swapped. Binding versions with AAD is possible later.
- Losing both the password and the recovery code still loses the workspace (ADR 0011), now on every device.
- Conflicts are resolved per design, not merged; the user sees both versions.
- Images that no design uses don't roam (only referenced images are downloaded).
- v1 cloud designs aren't migrated (they were test data); v1 tables can be dropped in a contract migration once the hybrid is live.

## Review amendments (2026-11-26)

The parallel review of PR #15 led to these changes before merge:

- **One active tab per account.** Each tab held its own in-memory copy, so a second tab could push a stale copy over newer work. A Web Lock per account now allows one editing tab. Another tab offers **Use here**, and the previous tab saves and pauses. We chose this over per-edit base versions across tabs: it's simpler and removes the whole class of bug.
- **Password changes store the new wrap first.** The provider's password changes only afterwards, and a provider failure restores the old wrap. Previously a failed save could leave Supabase on the new password with the key wrapped by the old one. This supersedes ADR 0011's "server password changes first".
- **Sync hardening.** Each conflict makes exactly one copy (downloads happen first, and the copy is recorded). Pulls are guarded against edits that land mid-download. Existing data is reconciled on start. `dispose` waits for an in-flight pass. A delete after a lost insert response tombstones the row. Polls respect the backoff, and pulled images must match their id and an allowed type.
- **Share images are private** (migration `20261126000000`). Anyone can read one only while its share and design are live, through short-lived signed URLs. A tombstone therefore cuts access, and deleting a design also unpublishes it. A share row can't be deleted before its image.
- **Quotas:** 5,000 designs and 5,000 stored images per user.

**Accepted risks, revisit if the threat model changes:**

- A stolen session can overwrite the wrapped keys and lock the account's data on every device; the same session could also tombstone every design. Mitigations are the CSP and the raw-HTML lint ban. Revisit with wrap history or a locally cached last-good wrap.
- Supabase accounts created before keys moved to the server can end up with a different key on a second device. Only pre-hybrid preview test accounts are affected.
