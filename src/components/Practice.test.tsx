import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Practice } from "./Practice";

describe("Practice", () => {
  it("offers the publication signup without needing a configured Hub", () => {
    // A detached container checks our markup without fetching Substack in unit tests.
    const screen = render(<Practice />, { container: document.createElement("div") });
    expect(screen.getByTitle("Subscribe to Agents for Introverts updates"))
      .toHaveAttribute("src", "https://agentsforintroverts.substack.com/embed");
    expect(screen.getByRole("link", { name: /open signup on substack/i }))
      .toHaveAttribute("href", "https://agentsforintroverts.substack.com/subscribe");
  });

  it("links directly to Tony's publishing channels", () => {
    // A detached container checks our markup without fetching Substack in unit tests.
    const screen = render(<Practice />, { container: document.createElement("div") });
    expect(screen.getByRole("link", { name: "X" })).toHaveAttribute("href", "https://x.com/tonylongname");
    expect(screen.getByRole("link", { name: "Substack" })).toHaveAttribute("href", "https://agentsforintroverts.substack.com");
    expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveAttribute("href", "https://www.linkedin.com/in/tonyll/");
  });
});
