import Link from "next/link";
import { fieldNotesPublicationUrl } from "@/lib/site";

export function FieldNotesStatus() {
  const isPublished = fieldNotesPublicationUrl !== null;

  return (
    <div className="email-form-frame flex items-center justify-between gap-4 border-b border-rule">
      <p className="font-serif text-sm text-ink-muted">
        {isPublished
          ? "Slow Feed is now publishing."
          : "The first field note is being written."}
      </p>
      <Link
        href={fieldNotesPublicationUrl ?? "/manifesto/"}
        className="playbook-submit inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap font-mono text-sm text-leaf"
      >
        {isPublished ? "Read the field notes →" : "Read the manifesto →"}
      </Link>
    </div>
  );
}
