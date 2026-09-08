import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Practice", () => {
  it("offers the email capture only when a hub origin is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_HUB_ORIGIN", "https://hub.example.com");
    const { Practice } = await import("./Practice");
    render(<Practice />);
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
  });

  it("falls back to the manifesto when no hub is configured, instead of a form that cannot work", async () => {
    vi.stubEnv("NEXT_PUBLIC_HUB_ORIGIN", "");
    const { Practice } = await import("./Practice");
    render(<Practice />);
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /read the manifesto/i }).length).toBeGreaterThanOrEqual(2);
  });
});
