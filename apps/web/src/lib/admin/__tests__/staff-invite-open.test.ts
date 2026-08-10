import { describe, expect, it } from "vitest";
import { isOpenStaffInvite } from "@/lib/admin/staff-invite";

describe("isOpenStaffInvite", () => {
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);

  it("keeps only pending invites that have not expired", () => {
    expect(isOpenStaffInvite("pending", future)).toBe(true);
  });

  it("excludes accepted / revoked / expired statuses from Offene Einladungen", () => {
    expect(isOpenStaffInvite("accepted", future)).toBe(false);
    expect(isOpenStaffInvite("revoked", future)).toBe(false);
    expect(isOpenStaffInvite("expired", future)).toBe(false);
  });

  it("excludes pending invites past expiry", () => {
    expect(isOpenStaffInvite("pending", past)).toBe(false);
  });
});
