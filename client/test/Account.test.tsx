import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Account as AccountData } from "../src/api/types";

const accountMock = vi.fn();
const plansMock = vi.fn().mockResolvedValue({ plans: [] });
const notifMock = vi.fn().mockResolvedValue({ notificationPrefs: {} });
const redeemMock = vi.fn().mockResolvedValue({ betaAccess: true });

vi.mock("../src/api/client", () => ({
  api: {
    account: () => accountMock(),
    billingPlans: () => plansMock(),
    updateProfile: vi.fn(),
    updateNotifications: (p: unknown) => notifMock(p),
    redeemBeta: (c: string) => redeemMock(c),
    checkout: vi.fn(),
    checkoutComplete: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

import { Account } from "../src/routes/Account";

const baseAccount: AccountData = {
  user: { id: "u1", email: "dana@example.com", betaAccess: true },
  profile: {
    displayName: "Dana",
    examDate: "2026-07-28T00:00:00.000Z",
    weeklyTimeBudgetMinutes: "1200",
    notificationPrefs: { dailyReminder: true },
  },
  subscription: {
    status: "active",
    plan: "standard",
    entitlements: ["ube-2026"],
    currentPeriodEnd: "2026-07-14T00:00:00.000Z",
  },
  enrollments: [{ id: "c1", title: "Uniform Bar Exam — 2026" }],
};

afterEach(() => vi.clearAllMocks());

function renderAccount() {
  return render(
    <MemoryRouter>
      <Account />
    </MemoryRouter>,
  );
}

describe("Account page", () => {
  it("shows profile, subscription, enrollment, and notification prefs", async () => {
    accountMock.mockResolvedValue(baseAccount);
    renderAccount();

    await waitFor(() =>
      expect(screen.getByText("dana@example.com")).toBeInTheDocument(),
    );
    expect(screen.getByText(/standard/i)).toBeInTheDocument();
    expect(screen.getByText(/Uniform Bar Exam/)).toBeInTheDocument();
    expect(screen.getByText(/Daily study reminder/i)).toBeInTheDocument();

    // Toggling + saving notification prefs calls the API.
    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));
    await waitFor(() => expect(notifMock).toHaveBeenCalled());
  });

  it("shows a beta-redeem card when the user lacks beta access", async () => {
    accountMock.mockResolvedValue({
      ...baseAccount,
      user: { ...baseAccount.user, betaAccess: false },
    });
    renderAccount();
    await waitFor(() =>
      expect(screen.getByText(/Beta access required/i)).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText(/invite code/i), {
      target: { value: "BETA-ABCD1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^redeem$/i }));
    await waitFor(() =>
      expect(redeemMock).toHaveBeenCalledWith("BETA-ABCD1234"),
    );
  });
});
