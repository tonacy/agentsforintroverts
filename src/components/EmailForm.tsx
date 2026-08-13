"use client";

import { useState } from "react";

interface EmailFormProps {
  variant?: "hero" | "cta";
}

export function EmailForm({ variant = "hero" }: EmailFormProps) {
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

    // TODO: Integrate with Resend/Supabase for actual email capture
    // For now, simulate a successful submission
    // Example integration:
    // const response = await fetch('/api/subscribe', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ email }),
    // });
    // if (!response.ok) throw new Error('Failed to subscribe');

    setStatus("success");
    setEmail("");
  };

  const isDark = variant === "cta";

  if (status === "success") {
    return (
      <div
        className={`flex items-center gap-3 border-l-2 px-5 py-4 ${
          isDark
            ? "border-camel bg-navy/50 max-w-md mx-auto"
            : "border-rust bg-rust-soft max-w-md"
        }`}
      >
        <svg
          className={`h-5 w-5 shrink-0 ${isDark ? "text-camel" : "text-rust"}`}
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
        <p className={isDark ? "text-paper/80" : "text-ink-muted"}>
          Check your inbox for{" "}
          <span className={`font-medium ${isDark ? "text-paper" : "text-ink"}`}>
            The Quiet Operator&apos;s Agent Stack
          </span>
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex flex-col gap-3 sm:flex-row sm:gap-0 ${
        variant === "cta" ? "max-w-md mx-auto" : ""
      }`}
    >
      <div className="flex-1">
        <label htmlFor={`email-${variant}`} className="sr-only">
          Email address
        </label>
        <input
          type="email"
          id={`email-${variant}`}
          name="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") setStatus("idle");
          }}
          placeholder="you@example.com"
          className={`w-full border px-4 py-3 transition-colors sm:border-r-0 rounded-sm sm:rounded-r-none ${
            isDark
              ? `bg-navy border-paper/20 text-paper placeholder:text-paper/40 focus:outline-none focus:ring-2 focus:ring-camel/50 ${
                  status === "error" ? "border-red-400" : "hover:border-paper/30"
                }`
              : `bg-white border-rule-strong text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brass/30 ${
                  status === "error"
                    ? "border-red-500"
                    : "hover:border-ink-faint"
                }`
          }`}
          aria-invalid={status === "error"}
          aria-describedby={status === "error" ? `error-${variant}` : undefined}
        />
        {status === "error" && (
          <p
            id={`error-${variant}`}
            className={`mt-2 text-sm ${isDark ? "text-red-300" : "text-red-600"}`}
          >
            {errorMessage}
          </p>
        )}
      </div>
      <button
        type="submit"
        className={`px-6 py-3 font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-[0.98] rounded-sm sm:rounded-l-none ${
          isDark
            ? "bg-camel text-navy-deep hover:bg-camel-muted focus:ring-camel focus:ring-offset-navy-deep"
            : "bg-navy text-paper hover:bg-navy-deep focus:ring-brass focus:ring-offset-paper"
        }`}
      >
        Get the free playbook
      </button>
    </form>
  );
}
