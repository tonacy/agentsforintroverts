import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Story } from "./Story";

describe("Story", () => {
  it("moves the story on from the opening's ending instead of repeating it", () => {
    const { container } = render(<Story />);
    expect(screen.getByRole("heading", { level: 2, name: "Their answers land on your desk." })).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/two or three/i);
    expect(container).not.toHaveTextContent(/four hundred/i);
  });

  it("closes the loop: what comes back becomes tomorrow's loose pages", () => {
    render(<Story />);
    expect(screen.getByText(/loose pages for tomorrow/i)).toBeInTheDocument();
  });

  it("ends the page's story, and points to the belief behind it", () => {
    render(<Story />);
    expect(screen.getByText("Your work keeps moving. You keep making.")).toBeInTheDocument();
    // The site sets trailingSlash; tests render Link without that config.
    expect(screen.getByRole("link", { name: /read the manifesto/i }).getAttribute("href")).toMatch(/^\/manifesto\/?$/);
  });

  it("leaves the day's full record to the authorship note", () => {
    const { container } = render(<Story />);
    expect(container).not.toHaveTextContent(/example day/i);
  });
});
