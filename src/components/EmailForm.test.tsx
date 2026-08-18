import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmailForm } from "./EmailForm";

/**
 * This form is the hero's only interactive element and its single conversion
 * point, so its behaviour and its accessibility are both pinned here.
 */
describe("EmailForm behaviour", () => {
  it("labels the field for screen readers", () => {
    render(<EmailForm />);
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
  });

  it("refuses an empty submit and says why", async () => {
    const user = userEvent.setup();
    render(<EmailForm />);

    await user.click(screen.getByRole("button", { name: /send it/i }));

    expect(screen.getByText("Email is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-invalid", "true");
  });

  it("refuses a malformed address", async () => {
    const user = userEvent.setup();
    render(<EmailForm />);

    await user.type(screen.getByLabelText("Email address"), "not-an-email");
    await user.click(screen.getByRole("button", { name: /send it/i }));

    expect(screen.getByText("Please enter a valid email")).toBeInTheDocument();
  });

  it("points the field at its error message", async () => {
    const user = userEvent.setup();
    render(<EmailForm />);

    await user.click(screen.getByRole("button", { name: /send it/i }));

    const field = screen.getByLabelText("Email address");
    const describedBy = field.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent("Email is required");
  });

  it("clears the error as soon as the visitor starts fixing it", async () => {
    const user = userEvent.setup();
    render(<EmailForm />);

    await user.click(screen.getByRole("button", { name: /send it/i }));
    expect(screen.getByText("Email is required")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Email address"), "t");
    expect(screen.queryByText("Email is required")).not.toBeInTheDocument();
  });

  it("confirms receipt on a valid address", async () => {
    const user = userEvent.setup();
    render(<EmailForm />);

    await user.type(screen.getByLabelText("Email address"), "tony@quiet.dev");
    await user.click(screen.getByRole("button", { name: /send it/i }));

    expect(screen.getByText("Check your inbox for the playbook.")).toBeInTheDocument();
  });
});

describe("EmailForm accessibility contract", () => {
  it("does not suppress the field's focus ring", () => {
    render(<EmailForm />);
    // `focus:outline-none` out-specifies the app's global :focus-visible rule,
    // which would leave keyboard users with no visible focus indicator at all.
    expect(screen.getByLabelText("Email address").className).not.toMatch(/outline-none/);
  });

  it("gives the submit control a 44px minimum tap target", () => {
    render(<EmailForm />);
    expect(screen.getByRole("button", { name: /send it/i }).className).toMatch(/min-h-\[44px\]/);
  });
});
