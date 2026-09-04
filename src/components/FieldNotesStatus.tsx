import { fieldNotesPublicationUrl } from "@/lib/site";

export function FieldNotesStatus() {
  const isPublished = fieldNotesPublicationUrl !== null;
  return (
    <div className="field-notes-card section-stack">
      <p className="eyebrow">Slow Feed / {isPublished ? "Field notes" : "In preparation"}</p>
      <h3>{isPublished ? "Notes from the practice." : "The first field note is being written."}</h3>
      <p>What the agents saw. What I approved or rejected. Where they were wrong. And whether a real human connection followed.</p>
      <a className="action action--primary" href={fieldNotesPublicationUrl ?? "https://agentsforintroverts.substack.com/"}>
        {isPublished ? "Read the field notes ↗" : "Follow on Substack ↗"}
      </a>
      <p className="label">Subscriptions are handled on Substack.</p>
    </div>
  );
}
