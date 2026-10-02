import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PieceReveal } from "./PieceReveal";

describe("PieceReveal", () => {
  it("picks up from the opening: the piece the visitor just watched being made", () => {
    render(<PieceReveal />);
    expect(screen.getByRole("heading", { level: 2, name: "You just watched one come together." })).toBeInTheDocument();
  });

  it("shows the piece in each form, labelled as the opening labels them", () => {
    render(<PieceReveal />);
    for (const label of ["essay · your site", "post · LinkedIn", "card · X"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByAltText(/essay set in the house style/i)).toBeInTheDocument();
    expect(screen.getByAltText(/square card/i)).toBeInTheDocument();
  });

  it("sets the LinkedIn post in the actual words of its adaptation, cut at the feed's fold", () => {
    render(<PieceReveal />);
    expect(screen.getByText(/opens on a sea of feed fragments/)).toBeInTheDocument();
    expect(screen.getByText("…see more")).toBeInTheDocument();
  });

  it("says who did what, which is why it still sounds like the person", () => {
    const { container } = render(<PieceReveal />);
    const terms = Array.from(container.querySelectorAll("dt")).map((dt) => dt.textContent);
    expect(terms).toEqual(["You", "Your agents"]);
    expect(screen.getByText(/the choice to make rest the default/i)).toBeInTheDocument();
  });

  it("is honest that the specimen is unsigned and has gone nowhere", () => {
    render(<PieceReveal />);
    expect(screen.getByText(/specimen/i)).toBeInTheDocument();
    expect(screen.getByText(/each form waits for your mark/i)).toBeInTheDocument();
    // The site sets trailingSlash; tests render Link without that config.
    expect(screen.getByRole("link", { name: /how authorship works/i }).getAttribute("href")).toMatch(/^\/made-with\/?$/);
  });

  it("is where the opening's skip link lands", () => {
    const { container } = render(<PieceReveal />);
    expect(container.querySelector("section#the-piece")).not.toBeNull();
  });
});
