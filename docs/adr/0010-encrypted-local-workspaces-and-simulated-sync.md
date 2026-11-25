# 0010 · Encrypted local workspaces, device-local accounts and simulated cloud sync (v2)

- **Status:** Accepted; the simulated-sync part is superseded by ADR 0012
- **Date:** 2026-11-20
- **Relates to:** ADR 0002 (Supabase), 0003 (local-first sync), 0006 (browser session storage), 0008 (share links)

## Context

v2 must offer secure sign-in, an offline no-save mode, and visible save/sync feedback, and it must run with no backend configured (local dev, demos, CI). The brief allowed cloud sync to be simulated for now, as long as the UX is real. v1 stored designs in plain IndexedDB, so anyone with access to the browser profile could read them.

## Options considered

1. **Supabase-only accounts, plain IndexedDB.** Real server auth, but nothing works without a configured project, and data at rest stays readable.
2. **Pluggable identity provider (local or Supabase) + envelope-encrypted workspace.** Works without a backend; designs are unreadable at rest without the password.
3. **Client-side "accounts" with no cryptography (profiles).** Simple, but not secure in any meaningful sense.

## Decision

Option 2.

- **Identity providers** sit behind one port (`IdentityProvider`). Without Supabase config, accounts are device-local: a salted PBKDF2-SHA256 verifier (600k iterations, OWASP guidance; Argon2id isn't in Web Crypto), a constant-time compare, a decoy derivation for unknown emails, and identical errors for "no account" and "wrong password". With Supabase config, Supabase Auth verifies credentials server-side (ADR 0002/0006 still apply).
- **Throttling:** 5 free attempts per email, then 30 s doubling to 15 min (client-side UX; Supabase adds server-side limits).
- **Envelope encryption:** each account has a random AES-256-GCM data key, stored only wrapped by a key derived from the password (separate salt). Unwrapping yields a non-extractable `CryptoKey`. Every document and asset record, including names and dates, is sealed with a fresh IV. Records that fail to decrypt or validate are skipped and counted, never crash the app.
- **Sessions:** the non-extractable key and session live in IndexedDB until they expire (12 h, or 30 days with "keep me signed in"); sign-out deletes them, and an open tab signs out on expiry.
- **Sandbox:** in-memory stores; nothing is persisted, and the UI says so everywhere.
- **Sync:** a `SyncEngine` behind a `CloudTransport` port, with latest-version-only queueing, exponential backoff, offline detection and a status store. v2 ships a **simulated** transport (latency and a 5% failure rate). The v1 Supabase tables, RLS and share links (ADR 0008) are untouched and unused by v2.

## Consequences

- Designs are protected at rest against anyone without the password. They are **not** protected from script running in the page while unlocked (XSS), so the CSP and the raw-HTML lint ban stay critical.
- **Forgetting the password means losing the workspace.** There is no recovery key yet, and a Supabase password reset would also need the data key re-wrapped. Password reset therefore needs a design (recovery key, or re-wrap on reset) before it ships.
- Device-local accounts don't roam between devices. Real sync means implementing `CloudTransport` against Supabase, with ciphertext-only rows (the server never sees plaintext) and conflict handling like v1's.
- Local accounts separate people sharing one browser; they're not a substitute for server-side auth when data leaves the device.
