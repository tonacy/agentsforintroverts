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

  if (status === "success") {
    return (
      <div
        className={`flex items-center gap-3 rounded-lg border border-teal-600/30 bg-teal-950/20 px-6 py-4 ${
          variant === "cta" ? "max-w-md mx-auto" : ""
        }`}
      >
        <svg
          className="h-5 w-5 shrink-0 text-teal-500"
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
        <p className="text-stone-200">
          Check your inbox for <span className="font-medium text-white">The Quiet Operator&apos;s Agent Stack</span>
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex flex-col gap-3 sm:flex-row sm:gap-2 ${
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
          className={`w-full rounded-lg border bg-stone-900/50 px-4 py-3 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-colors ${
            status === "error"
              ? "border-red-500/50"
              : "border-stone-700/50 hover:border-stone-600"
          }`}
          aria-invalid={status === "error"}
          aria-describedby={status === "error" ? `error-${variant}` : undefined}
        />
        {status === "error" && (
          <p id={`error-${variant}`} className="mt-2 text-sm text-red-400">
            {errorMessage}
          </p>
        )}
      </div>
      <button
        type="submit"
        className="rounded-lg bg-teal-600 px-6 py-3 font-medium text-white transition-all hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:ring-offset-2 focus:ring-offset-stone-900 active:scale-[0.98]"
      >
        Get the free playbook
      </button>
    </form>
  );
}
