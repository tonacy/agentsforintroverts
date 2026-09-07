import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Ledger } from "./Ledger";
import { exampleDay, type Day } from "@/lib/day";

function day(overrides: Partial<Day> = {}): Day {
  return { ...structuredClone(exampleDay), ...overrides };
}

describe("Ledger", () => {
  it("names the day and marks an example as an example", () => {
    render(<Ledger day={day({ example: true })} />);
    expect(screen.getByText(exampleDay.weekday)).toBeInTheDocument();
    expect(screen.getByText(/example day/i)).toBeInTheDocument();
  });

  it("does not call a real day an example", () => {
    render(<Ledger day={day({ example: false })} />);
    expect(screen.queryByText(/example day/i)).not.toBeInTheDocument();
  });

  it("renders every outside development with a source door", () => {
    render(<Ledger day={day()} />);
    for (const item of exampleDay.outside) {
      expect(screen.getByText(item.distillation)).toBeInTheDocument();
    }
    const doors = screen.getAllByRole("link", { name: /^source:/i });
    const totalSources = exampleDay.outside.reduce((n, o) => n + o.sources.length, 0);
    expect(doors.length).toBe(totalSources);
    for (const door of doors) {
      expect(door).toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
      expect(door).toHaveAttribute("rel", expect.stringContaining("noopener"));
    }
  });

  it("keeps disagreement visible when the sources disagree", () => {
    render(<Ledger day={day()} />);
    const withDisagreement = exampleDay.outside.filter((o) => o.disagreement);
    expect(withDisagreement.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/disagreement kept/i)).toHaveLength(withDisagreement.length);
  });

  it("shows the inside account in the person's voice, labelled as theirs", () => {
    render(<Ledger day={day()} />);
    expect(screen.getByText(exampleDay.inside!.text)).toBeInTheDocument();
    expect(screen.getByText(/written by tony/i)).toBeInTheDocument();
  });

  it("counts places against the ceiling of three and shows the empty slot", () => {
    render(<Ledger day={day()} />);
    expect(screen.getByText(/2 of at most 3/i)).toBeInTheDocument();
    expect(screen.getByText(exampleDay.held_note as string)).toBeInTheDocument();
  });

  it("says zero is a result when there are no places", () => {
    render(<Ledger day={day({ places: [], held_note: null })} />);
    expect(screen.getByText(/0 of at most 3/i)).toBeInTheDocument();
    expect(screen.getByText(/zero is a useful result/i)).toBeInTheDocument();
  });

  it("states that nothing was sent", () => {
    render(<Ledger day={day()} />);
    expect(screen.getByText(/nothing on this page was sent/i)).toBeInTheDocument();
  });

  it("labels context by its basis", () => {
    render(<Ledger day={day()} />);
    expect(screen.getAllByText(/^explicit/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^inferred/i).length).toBeGreaterThan(0);
  });
});
