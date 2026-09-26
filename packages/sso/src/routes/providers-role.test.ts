import { describe, expect, it } from "vitest";
import { hasOrgAdminRole } from "./providers";

describe("hasOrgAdminRole", () => {
	it("returns true for owner/admin comma-separated role strings", () => {
		expect(hasOrgAdminRole({ role: "admin" })).toBe(true);
		expect(hasOrgAdminRole({ role: "owner" })).toBe(true);
		expect(hasOrgAdminRole({ role: "admin,member" })).toBe(true);
		expect(hasOrgAdminRole({ role: "member" })).toBe(false);
	});

	/**
	 * When the organization plugin maps `member.role` to a Postgres `text[]`
	 * column (via schema field mapping), adapters such as Prisma return
	 * `member.role` as `string[]` instead of a comma-separated string.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/10425
	 */
	it("accepts role stored as an array (e.g. Postgres text[] via Prisma)", () => {
		expect(hasOrgAdminRole({ role: ["admin"] })).toBe(true);
		expect(hasOrgAdminRole({ role: ["owner", "member"] })).toBe(true);
		expect(hasOrgAdminRole({ role: ["member"] })).toBe(false);
	});
});
