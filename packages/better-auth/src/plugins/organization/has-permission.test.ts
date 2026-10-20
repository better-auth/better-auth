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

	it("handles resource names that collide with Object.prototype", () => {
		const weirdAc = createAccessControl({
			constructor: ["use-it"],
			a: ["use-a"],
		} as const);
		const weirdRoles = {
			weird: weirdAc.newRole({ constructor: ["use-it"] }),
		};
		// exact grant still works through the per-role path
		expect(
			hasPermissionFn(
				{
					role: "weird",
					permissions: { constructor: ["use-it"] },
					options,
				},
				weirdRoles,
			),
		).toBe(true);
		// requesting an ungranted ordinary resource forces the null-prototype
		// accumulator to process the `constructor` key — with a plain `{}`
		// this throws instead of denying
		expect(
			hasPermissionFn(
				{
					role: "weird",
					permissions: { constructor: ["use-it"], a: ["use-a"] },
					options,
				},
				weirdRoles,
			),
		).toBe(false);
	});

	it("denies prototype-colliding resource names a role does not define", () => {
		// `constructor` is not an own key of aUser's statements: this must
		// deny, not throw on the inherited Object.prototype member
		const result = hasPermissionFn(
			{
				role: "aUser",
				permissions: { constructor: ["use-it"] },
				options,
			},
			acRoles,
		);
		expect(result).toBe(false);
	});
});
