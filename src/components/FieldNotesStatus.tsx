import Link from "next/link";

export function FieldNotesStatus() {
  return (
    <div
      className="email-form-frame flex items-center justify-between gap-4 border-b border-rule"
      role="status"
    >
      <p className="font-serif text-sm text-ink-muted">
        The first field note is being written.
      </p>
      <Link
        href="/manifesto/"
        className="playbook-submit inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap font-mono text-sm text-leaf"
      >
        Read the manifesto →
      </Link>
    </div>
  );
}
