/** What the feed is made of: where each notice came from, and what it is. */

export const FRAGMENT_POOL = [
  "email · a reply",
  "calendar · an ask",
  "X · a mention",
  "email · a follow-up",
  "LinkedIn · an intro",
  "newsletter · a request",
  "X · a thread",
  "email · an invite",
  "calendar · a conflict",
  "LinkedIn · a message",
  "email · a nudge",
  "X · a quote",
  "group chat · a decision",
  "newsletter · a digest",
  "email · a cc",
  "X · a reply to a reply",
  "calendar · a hold",
  "LinkedIn · a congratulation",
  "email · a thread you were added to",
  "X · a take",
] as const;
