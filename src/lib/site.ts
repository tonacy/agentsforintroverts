function readOptionalHttpsUrl(name: string): string | null {
  const value = process.env[name]?.trim();

  if (!value) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL.`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${name} must be an absolute HTTPS URL.`);
  }

  if (url.username || url.password) {
    throw new Error(`${name} must not include embedded credentials.`);
  }

  return url.toString();
}

export const fieldNotesPublicationUrl = readOptionalHttpsUrl("FIELD_NOTES_URL");
export const fieldNotesNavigationHref =
  fieldNotesPublicationUrl ?? "/#field-notes";

// The publication handles subscriptions and delivery; these are Tony's channels.
export const updatesPublicationUrl = "https://agentsforintroverts.substack.com";
export const publishingChannels = [
  { label: "X", href: "https://x.com/tonylongname" },
  { label: "Substack", href: updatesPublicationUrl },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/tonyll/" },
] as const;
