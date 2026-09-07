/**
 * The capture form's network contract in one place: where Quiet Hub is, what
 * gets sent, and what a visitor is told when it does not work.
 *
 * `POST /v1/subscribe` answers `202 {"subscribed": true}` for a new address and
 * for a repeat one alike (`services/hub/src/app.ts`), so a duplicate signup is
 * indistinguishable from a first one here as well as on the wire. Nothing in
 * this module may leak whether an address was already stored.
 */

/** The `source` label the hub records against a signup from this site. */
const SUBSCRIBE_SOURCE = "site";

/**
 * Where the hub lives, resolved at build time. `next build` inlines
 * `NEXT_PUBLIC_*`, so the origin is chosen per deployment instead of being
 * compiled in. Left unset, the request stays same-origin, which is right when
 * the hub is proxied under the site's own domain. When the hub is on another
 * origin, this site's origin must appear in the hub's
 * `SUBSCRIBE_ALLOWED_ORIGINS` allowlist, or the browser's request is refused.
 */
export const hubOrigin = (process.env.NEXT_PUBLIC_HUB_ORIGIN ?? "").trim().replace(/\/+$/, "");

export const subscribeEndpoint = `${hubOrigin}/v1/subscribe`;

/**
 * Every string the form can say. Each names what happened and then what to do
 * next, in that order; none of them apologises or claims something was sent.
 */
export const subscribeMessages = {
  success: "On the list. Nothing is sent yet. The first field note goes out once, when it is written.",
  empty: "An address is needed.",
  invalid: "That address does not look right.",
  unreachable: "That did not reach the server. Try again in a moment.",
  server: "Something failed on my end. Try again in a moment.",
  rateLimited: "That is a few too many tries. Give it a minute.",
} as const;

/**
 * A deliberately loose client-side shape check. The hub owns real validation
 * (`services/hub/src/subscribe.ts`); this only spares the visitor a round trip
 * on an obvious typo, and must never reject an address the hub would accept.
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export type SubscribeResult = { ok: true } | { ok: false; message: string };

async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } };
    const code = body?.error?.code;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
}

/**
 * Submits one address and reports what actually happened. A rejected `fetch`
 * and a failing response are different outcomes with different messages, and
 * neither is swallowed: success is returned only for a 2xx.
 */
export async function submitSubscription(
  email: string,
  init?: { signal?: AbortSignal },
): Promise<SubscribeResult> {
  let response: Response;
  try {
    response = await fetch(subscribeEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, source: SUBSCRIBE_SOURCE }),
      signal: init?.signal,
    });
  } catch {
    return { ok: false, message: subscribeMessages.unreachable };
  }

  if (response.ok) return { ok: true };

  if (response.status === 429) {
    return { ok: false, message: subscribeMessages.rateLimited };
  }

  if (response.status === 422 && (await readErrorCode(response)) === "invalid_email") {
    return { ok: false, message: subscribeMessages.invalid };
  }

  return { ok: false, message: subscribeMessages.server };
}
