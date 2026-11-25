import { z } from 'zod';

/**
 * Email sharing without an email service (ADR 0004 still applies): the
 * app builds a `mailto:` draft in the user's own mail app. mailto can't
 * carry attachments, so the flow downloads the file first and the draft
 * reminds the user to attach it.
 */

export const MAX_RECIPIENTS = 20;
/** Long mailto URLs are truncated or rejected by some mail clients. */
export const MAX_MAILTO_LENGTH = 1900;

const email = z.email();

export type RecipientsCheck =
  { ok: true; recipients: string[] } | { ok: false; message: string };

export function parseRecipients(input: string): RecipientsCheck {
  const recipients = [
    ...new Set(
      input
        .split(/[\s,;]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (recipients.length === 0) {
    return { ok: true, recipients: [] };
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return { ok: false, message: `Add up to ${MAX_RECIPIENTS} recipients.` };
  }
  const invalid = recipients.find(
    (recipient) => !email.safeParse(recipient).success,
  );
  if (invalid) {
    return { ok: false, message: `“${invalid}” isn’t a valid email address.` };
  }
  return { ok: true, recipients };
}

export interface EmailDraft {
  recipients: readonly string[];
  subject: string;
  body: string;
  attachmentName: string;
}

export function buildMailto(draft: EmailDraft): {
  url: string;
  truncated: boolean;
} {
  const reminder = `\n\n(Attached: ${draft.attachmentName})`;
  const encode = (body: string) =>
    `mailto:${draft.recipients.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(
      draft.subject,
    )}&body=${encodeURIComponent(body)}`;
  let body = draft.body.trim() + reminder;
  let truncated = false;
  while (
    encode(body).length > MAX_MAILTO_LENGTH &&
    body.length > reminder.length
  ) {
    truncated = true;
    const keep = Math.max(0, body.length - reminder.length - 50);
    body = `${draft.body.trim().slice(0, keep)}…${reminder}`;
  }
  return { url: encode(body), truncated };
}
