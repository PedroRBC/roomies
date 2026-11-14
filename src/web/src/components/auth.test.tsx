import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Auth } from "./auth";

const user = { id: "me", name: "Alex", email: "alex@example.com" };
vi.mock("@/lib/api", () => ({ api: vi.fn(async () => ({ user })) }));
afterEach(cleanup);
it("shows password sign-in immediately and lets users reveal the password", async () => {
  render(<Auth onLogin={vi.fn()} />);
  const actor = userEvent.setup();
  expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  await actor.click(screen.getByRole("button", { name: "Show password" }));
  expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
  expect(screen.queryByText(/AuthKit|Better Auth|Forgot password/)).not.toBeInTheDocument();
});
it("registers and disables the form while submitting", async () => {
  const onLogin = vi.fn(), actor = userEvent.setup();
  render(<Auth onLogin={onLogin} />);
  await actor.click(screen.getByRole("button", { name: "Create an account" }));
  await actor.type(screen.getByLabelText("Your name"), "Alex");
  await actor.type(screen.getByLabelText("Email"), "alex@example.com");
  await actor.type(screen.getByLabelText("Password"), "password123");
  await actor.click(screen.getByRole("button", { name: "Create account" }));
  expect(onLogin).toHaveBeenCalledWith(user);
});
