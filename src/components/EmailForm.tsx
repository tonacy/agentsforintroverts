"use client";

import { useRef, useState } from "react";

import {
  looksLikeEmail,
  submitSubscription,
  subscribeMessages,
} from "@/lib/subscribe";

type Status = "idle" | "submitting" | "success" | "error";

export function EmailForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // `status` cannot guard against a double submit on its own: two submit events
  // in the same task both read the pre-render value and both fire a request.
  // This latch is set synchronously, so only the first one gets through.
  const inFlight = useRef(false);

  const pending = status === "submitting";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;

    const address = email.trim();

    if (!address) {
      setErrorMessage(subscribeMessages.empty);
      setStatus("error");
      return;
    }

    if (!looksLikeEmail(address)) {
      setErrorMessage(subscribeMessages.invalid);
      setStatus("error");
      return;
    }

    inFlight.current = true;
    setErrorMessage("");
    setStatus("submitting");

    try {
      const result = await submitSubscription(address);
      if (result.ok) {
        // Reached only on a 2xx from the hub. A duplicate address lands here
        // too, which is the point: the second signup looks exactly like the
        // first.
        setStatus("success");
        setEmail("");
        return;
      }

      setErrorMessage(result.message);
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  };

  if (status === "success") {
    return (
      <div
        className="email-form-frame email-form-success flex items-center gap-3 border-b border-leaf"
        role="status"
        aria-live="polite"
      >
        <svg
          className="h-4 w-4 shrink-0 text-leaf"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
        <p className="font-serif text-sm text-ink-muted">
          {subscribeMessages.success}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="email-form-frame email-form border-b border-rule"
    >
      <div className="email-form__controls flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="email" className="sr-only">
            Email address
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status === "error") setStatus("idle");
            }}
            placeholder="you@quiet.dev"
            className={`min-h-[44px] w-full bg-transparent font-serif text-ink placeholder:text-ink-faint ${
              status === "error" ? "text-red-700" : ""
            }`}
            aria-invalid={status === "error"}
            aria-describedby={status === "error" ? "email-error" : undefined}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="playbook-submit inline-flex min-h-[44px] items-center whitespace-nowrap font-mono text-sm text-leaf"
        >
          {/* Both labels stay in the layout so the button cannot change width
              mid-submit; the inactive one is `visibility: hidden`, which also
              keeps it out of the accessibility tree. */}
          <span className="playbook-submit__label">
            <span className={pending ? "playbook-submit__label-inactive" : undefined}>
              Add me →
            </span>
            <span className={pending ? undefined : "playbook-submit__label-inactive"}>
              Adding…
            </span>
          </span>
        </button>
      </div>

      <p
        id="email-error"
        className={`email-form__status font-mono text-xs text-red-700 ${
          status === "error" ? "email-form__status--visible" : ""
        }`}
        aria-live="polite"
        aria-atomic="true"
      >
        {status === "error" ? errorMessage : null}
      </p>
    </form>
  );
}
