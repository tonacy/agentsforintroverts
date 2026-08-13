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
      <div className="flex items-center gap-3 border-l-2 border-leaf bg-[rgba(15,74,56,0.05)] px-4 py-3">
        <svg
          className="h-5 w-5 shrink-0 text-leaf"
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
        <p className="text-sm text-ink-muted">
          Check your inbox for{" "}
          <span className="text-ink">The Quiet Operator&apos;s Agent Stack</span>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:gap-0">
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
          placeholder="you@example.com"
          className={`w-full border px-4 py-3 text-ink placeholder:text-ink-faint bg-white transition-colors focus:outline-none focus:ring-1 focus:ring-leaf sm:border-r-0 ${
            status === "error"
              ? "border-terra"
              : "border-rule hover:border-ink-faint"
          }`}
          aria-invalid={status === "error"}
          aria-describedby={status === "error" ? "email-error" : undefined}
        />
        {status === "error" && (
          <p id="email-error" className="mt-2 text-sm text-terra">
            {errorMessage}
          </p>
        )}
      </div>
      <button
        type="submit"
        className="border border-leaf bg-leaf px-6 py-3 font-medium text-paper transition-colors hover:bg-leaf-light focus:outline-none focus:ring-1 focus:ring-leaf focus:ring-offset-2 focus:ring-offset-paper"
      >
        Get the playbook
      </button>
    </form>
  );
}
