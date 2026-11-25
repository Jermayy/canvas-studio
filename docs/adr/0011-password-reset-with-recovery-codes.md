# 0011 · Password reset with recovery codes

- **Status:** Accepted
- **Date:** 2026-11-20
- **Relates to:** ADR 0010 (supersedes its "forgetting the password means losing the workspace" consequence)

## Context

Workspaces are encrypted with a per-account data key that only the password unlocks (ADR 0010). A conventional reset ("we'll email you a link, choose a new password") would set a new password but leave the data key wrapped by the old one, so every design would be lost. Device-local accounts also have no email channel at all.

## Options considered

1. **Server-held key escrow.** The server keeps a copy of the data key and returns it after an email reset. Easy for users, but the server (or anyone who compromises it) can read every design, and device-local accounts have no server.
2. **Recovery code (second wrap of the same key).** At sign-up the user gets a high-entropy code; the data key is also wrapped by a key derived from it. A reset proves the code, unwraps the key and re-wraps it with the new password.
3. **Reset without recovery: start an empty workspace.** Simple, but silently destroys user work.

## Decision

Option 2.

- **Code:** 20 Crockford base32 symbols (100 bits), shown as `XXXX-XXXX-XXXX-XXXX-XXXX`. Input ignores case, spaces and dashes, and maps O/I/L to 0/1. It's shown once, after sign-up (or at the next sign-in for older accounts), in a dialog that can't be dismissed until the user confirms they've saved it. Users can copy it or download it as text.
- **Key derivation:** PBKDF2-SHA256 with its own salt (same iteration count as passwords), wrapping the data key with AES-GCM. A wrong code fails the GCM tag.
- **Device-local reset (`/reset-password`):** email + recovery code + new password. The same "Email or recovery code is incorrect" error covers an unknown email, a wrong code and a missing code. Attempts are throttled per email (5 free, then 30 s doubling).
- **Supabase reset:** Supabase emails a link back to `/reset-password?code=…` (PKCE, so it must be opened in the same browser). The page exchanges the code, then asks for the recovery code and a new password. The recovery code is verified first; the server password changes (`beforeCommit`) only once the data key is known to unlock, and the re-wrapped key is stored only after that succeeds.
- **Signed in:** "Password & recovery" changes the password (proven with the provider, then re-wrapped) and can issue a new code. Issuing one replaces the wrap, so the old code stops working.
- **Session:** a successful reset signs the user in.

## Consequences

- A forgotten password no longer loses work, as long as the user kept the code. Losing both still means the encrypted workspace can't be recovered, by design, and the UI says so.
- Anyone holding the recovery code can reset the password on that device. It's a credential, which is why the UI asks users to keep it in a password manager.
- In local mode, account existence on this device can be probed by timing, since lookup happens before key derivation. That's acceptable because device access already exposes the account list in IndexedDB.
- The Supabase path is unit-tested with a fake client but hasn't been exercised against a real project; smoke-test it in staging before relying on it.
