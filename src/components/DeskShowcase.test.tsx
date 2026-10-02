import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DeskShowcase } from "./DeskShowcase";

describe("DeskShowcase", () => {
  it("names the app and what happens there", () => {
    render(<DeskShowcase />);
    expect(screen.getByRole("heading", { level: 2, name: "Where the loop lives." })).toBeInTheDocument();
    for (const step of ["Loose pages", "Pieces", "Your mark"]) {
      expect(screen.getByRole("heading", { level: 3, name: step })).toBeInTheDocument();
    }
  });

  it("describes both screenshots for someone who cannot see them", () => {
    render(<DeskShowcase />);
    expect(screen.getByAltText(/Quiet Desk showing loose pages and pieces/i)).toBeInTheDocument();
    expect(screen.getByAltText(/LinkedIn draft.*fold/i)).toBeInTheDocument();
  });

  it("makes the person's mark the reason it still sounds like them", () => {
    render(<DeskShowcase />);
    const mark = screen.getByRole("heading", { level: 3, name: "Your mark" }).closest("li")!;
    expect(mark).toHaveTextContent(/still sounds like you/i);
    expect(screen.getByText(/a thought can stay private/i)).toBeInTheDocument();
  });

  it("is honest that it is a local prototype that never posts for you", () => {
    render(<DeskShowcase />);
    expect(screen.getByText(/local prototype/i)).toBeInTheDocument();
    expect(screen.getByText(/never posts for you/i)).toBeInTheDocument();
  });
});
