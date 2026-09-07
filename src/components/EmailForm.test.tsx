import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmailForm } from "./EmailForm";
import { subscribeMessages } from "@/lib/subscribe";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EmailForm", () => {
  it("labels the field for screen readers", () => {
    render(<EmailForm />);
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
  });

  it("refuses an empty submit and says why, without touching the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmailForm />);

    await user.click(screen.getByRole("button", { name: /add me/i }));

    expect(screen.getByText(subscribeMessages.empty)).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a malformed address", async () => {
    const user = userEvent.setup();
    render(<EmailForm />);

    await user.type(screen.getByLabelText("Email address"), "not-an-email");
    await user.click(screen.getByRole("button", { name: /add me/i }));

    expect(screen.getByText(subscribeMessages.invalid)).toBeInTheDocument();
  });

  it("points the field at its error message", async () => {
    const user = userEvent.setup();
    render(<EmailForm />);

    await user.click(screen.getByRole("button", { name: /add me/i }));

    const field = screen.getByLabelText("Email address");
    const describedBy = field.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(subscribeMessages.empty);
  });

  it("clears the error as soon as the visitor starts fixing it", async () => {
    const user = userEvent.setup();
    render(<EmailForm />);

    await user.click(screen.getByRole("button", { name: /add me/i }));
    expect(screen.getByText(subscribeMessages.empty)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Email address"), "t");
    expect(screen.queryByText(subscribeMessages.empty)).not.toBeInTheDocument();
  });

  it("confirms only after the hub accepted the address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ subscribed: true }), { status: 202 })),
    );
    const user = userEvent.setup();
    render(<EmailForm />);

    await user.type(screen.getByLabelText("Email address"), "tony@quiet.dev");
    await user.click(screen.getByRole("button", { name: /add me/i }));

    expect(await screen.findByText(subscribeMessages.success)).toBeInTheDocument();
  });

  it("shows the hub's failure instead of pretending success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const user = userEvent.setup();
    render(<EmailForm />);

    await user.type(screen.getByLabelText("Email address"), "tony@quiet.dev");
    await user.click(screen.getByRole("button", { name: /add me/i }));

    expect(await screen.findByText(subscribeMessages.unreachable)).toBeInTheDocument();
    expect(screen.queryByText(subscribeMessages.success)).not.toBeInTheDocument();
  });

  it("does not suppress the field's focus ring and keeps a 44px tap target", () => {
    render(<EmailForm />);
    expect(screen.getByLabelText("Email address").className).not.toMatch(/outline-none/);
    expect(screen.getByRole("button", { name: /add me/i }).className).toMatch(/min-h-\[44px\]/);
  });
});
