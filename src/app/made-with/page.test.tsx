import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MadeWithPage from "./page";

describe("Made with", () => {
  it("keeps the example day's full record, with its sources, as part of how authorship works", () => {
    render(<MadeWithPage />);
    expect(screen.getByText(/see the full example day/i)).toBeInTheDocument();
    expect(screen.getByText(/sources, context, and suggested next steps/i)).toBeInTheDocument();
  });
});
