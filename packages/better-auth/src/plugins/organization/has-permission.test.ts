import { describe, expect, it } from "vitest";
import { createAccessControl } from "../access";
import { hasPermissionFn } from "./permission";
import type { OrganizationOptions } from "./types";

/**
 * @see https://github.com/better-auth/better-auth/issues/3011
 *
 * Permissions held across multiple roles must be evaluated as a union.
 * Previously each role was checked independently against the full requested
 * permission set, so a user holding role A (`a:use-a`) and role B (`b:use-b`)
 * was denied a check for both permissions together, even though the union of
 * their roles grants everything requested.
 */
describe("hasPermissionFn aggregates permissions across roles", () => {
	const ac = createAccessControl({
		a: ["use-a"],
		b: ["use-b"],
	} as const);
	const acRoles = {
		aUser: ac.newRole({ a: ["use-a"] }),
		bUser: ac.newRole({ b: ["use-b"] }),
	};
	const options = {} as OrganizationOptions;

	it("grants permissions split across multiple roles", () => {
		const result = hasPermissionFn(
			{
				role: "aUser,bUser",
				permissions: { a: ["use-a"], b: ["use-b"] },
				options,
			},
			acRoles,
		);
		expect(result).toBe(true);
	});

	it("still grants a single permission held by one role", () => {
		const result = hasPermissionFn(
			{
				role: "aUser,bUser",
				permissions: { a: ["use-a"] },
				options,
			},
			acRoles,
		);
		expect(result).toBe(true);
	});

	it("denies a permission granted by none of the roles", () => {
		const result = hasPermissionFn(
			{
				role: "aUser",
				permissions: { b: ["use-b"] },
				options,
			},
			acRoles,
		);
		expect(result).toBe(false);
	});

	it("denies when none of the roles exist", () => {
		const result = hasPermissionFn(
			{
				role: "ghost",
				permissions: { a: ["use-a"] },
				options,
			},
			acRoles,
		);
		expect(result).toBe(false);
	});
});
