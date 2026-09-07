"use client";

import { useRef, useState } from "react";

import { looksLikeEmail, submitSubscription, subscribeMessages } from "@/lib/subscribe";

type Status = "idle" | "submitting" | "success" | "error";

export function EmailForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // `status` cannot guard against a double submit on its own: two submit events
  // in the same task both read the pre-render value. This latch is set
  // synchronously, so only the first one gets through.
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
      <div className="email-form email-form--done" role="status" aria-live="polite">
        <svg className="email-form__check" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <p className="email-form__done">{subscribeMessages.success}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="email-form">
      <div className="email-form__row">
        <div className="email-form__field">
          <label htmlFor="email" className="sr-only">
            Email address
          </label>
          <input
            type="email"
            id="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status === "error") setStatus("idle");
            }}
            placeholder="you@quiet.dev"
            className={`email-form__input min-h-[44px]${status === "error" ? " email-form__input--error" : ""}`}
            aria-invalid={status === "error"}
            aria-describedby={status === "error" ? "email-error" : undefined}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="email-form__submit min-h-[44px]"
        >
          {pending ? "Adding…" : "Add me →"}
        </button>
      </div>
      <p
        id="email-error"
        className={`email-form__status${status === "error" ? " email-form__status--visible" : ""}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {status === "error" ? errorMessage : null}
      </p>
    </form>
  );
}
