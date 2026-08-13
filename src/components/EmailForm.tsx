"use client";

import { useState } from "react";

export function EmailForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!email.trim()) {
      setErrorMessage("Email is required");
      setStatus("error");
      return;
    }

    if (!validateEmail(email)) {
      setErrorMessage("Please enter a valid email");
      setStatus("error");
      return;
    }

    // TODO: Integrate with email service (Resend/Supabase)
    setStatus("success");
    setEmail("");
  };

  if (status === "success") {
    return (
      <div className="flex items-center gap-3 border-b border-leaf py-3">
        <svg
          className="h-4 w-4 shrink-0 text-leaf"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
        <p className="font-serif text-sm text-ink-muted">
          Check your inbox for the playbook.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-4 border-b border-rule pb-3">
      <div className="flex-1">
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
          className={`w-full bg-transparent font-serif text-ink placeholder:text-ink-faint focus:outline-none ${
            status === "error" ? "text-red-700" : ""
          }`}
          aria-invalid={status === "error"}
          aria-describedby={status === "error" ? "email-error" : undefined}
        />
        {status === "error" && (
          <p id="email-error" className="mt-1 font-mono text-xs text-red-700">
            {errorMessage}
          </p>
        )}
      </div>
      <button
        type="submit"
        className="font-mono text-sm text-leaf transition-colors hover:text-leaf-light whitespace-nowrap"
      >
        Send it →
      </button>
    </form>
  );
}
