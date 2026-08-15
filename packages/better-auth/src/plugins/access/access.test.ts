import { describe, expect, expectTypeOf, it } from "vitest";
import { createAccessControl } from "./access";

describe("access", () => {
	const statements = {
		project: ["create", "update", "delete", "delete-many"],
		ui: ["view", "edit", "comment", "hide"],
	} as const;
	const ac = createAccessControl(statements);

	const role1 = ac.newRole({
		project: ["create", "update", "delete"],
		ui: ["view", "edit", "comment"],
	});

	it("should allow passing defined statements directly into newRole", () => {
		const role2 = ac.newRole(statements);
		const response = role2.authorize({
			project: ["create"],
		});
		expect(response.success).toBe(true);
	});

	it("should preserve exact role statement types", () => {
		const role2 = ac.newRole({
			project: ["create", "update"],
			ui: ["view"],
		});

		expectTypeOf(role2.statements.project).toEqualTypeOf<
			readonly ["create", "update"]
		>();
		expectTypeOf(role2.statements.ui).toEqualTypeOf<readonly ["view"]>();

		const failedResponse = role2.authorize({
			project: ["delete-many"],
		});
		expect(failedResponse.success).toBe(false);
	});

	it("should reject invalid role statements at type level", () => {
		// @ts-expect-error - "publish" is not part of the project statement.
		ac.newRole({ project: ["publish"] });
		// @ts-expect-error - "billing" is not a configured resource.
		ac.newRole({ billing: ["read"] });

		expect(true).toBe(true);
	});

	it("should accept dynamic role records", () => {
		const dynamicStatements: Record<string, string[]> = {
			project: ["create"],
			ui: ["view"],
		};

		const dynamicRole = ac.newRole(dynamicStatements);
		const response = dynamicRole.authorize({
			project: ["create"],
		});
		expect(response.success).toBe(true);
	});

	it("should validate permissions", async () => {
		const response = role1.authorize({
			project: ["create"],
		});
		expect(response.success).toBe(true);

		const failedResponse = role1.authorize({
			project: ["delete-many"],
		});
		expect(failedResponse.success).toBe(false);
	});

	it("should validate multiple resource permissions", async () => {
		const response = role1.authorize({
			project: ["create"],
			ui: ["view"],
		});
		expect(response.success).toBe(true);

		const failedResponse = role1.authorize({
			project: ["delete-many"],
			ui: ["view"],
		});
		expect(failedResponse.success).toBe(false);
	});

	it("should validate multiple resource multiple permissions", async () => {
		const response = role1.authorize({
			project: ["create", "delete"],
			ui: ["view", "edit"],
		});
		expect(response.success).toBe(true);
		const failedResponse = role1.authorize({
			project: ["create", "delete-many"],
			ui: ["view", "edit"],
		});
		expect(failedResponse.success).toBe(false);
	});

	it("should validate using or connector", () => {
		const response = role1.authorize(
			{
				project: ["create", "delete-many"],
				ui: ["view", "edit"],
			},
			"OR",
		);
		expect(response.success).toBe(true);
	});

	it("should validate using or connector for a specific resource", () => {
		const response = role1.authorize({
			project: {
				connector: "OR",
				actions: ["create", "delete-many"],
			},
			ui: ["view", "edit"],
		});
		expect(response.success).toBe(true);

		const failedResponse = role1.authorize({
			project: {
				connector: "OR",
				actions: ["create", "delete-many"],
			},
			ui: ["view", "edit", "hide"],
		});
		expect(failedResponse.success).toBe(false);
	});

	it("should fail when a resource is requested with an empty action list (array form)", () => {
		const responseAnd = role1.authorize({ project: [] });
		expect(responseAnd.success).toBe(false);

		const responseOr = role1.authorize({ project: [] }, "OR");
		expect(responseOr.success).toBe(false);
	});

	it("should fail when a resource is requested with an empty action list (object form)", () => {
		const responseAnd = role1.authorize({
			project: { actions: [], connector: "AND" },
		});
		expect(responseAnd.success).toBe(false);

		const responseOr = role1.authorize({
			project: { actions: [], connector: "OR" },
		});
		expect(responseOr.success).toBe(false);
	});

	it("should fail when every requested resource is empty under OR across multiple resources", () => {
		const response = role1.authorize({ project: [], ui: [] }, "OR");
		expect(response.success).toBe(false);
	});

	const looseStatements: Record<string, readonly string[]> = {
		project: ["create", "update", "delete"],
	};
	const looseAc = createAccessControl(looseStatements);
	const looseRole = looseAc.newRole(looseStatements);

	it("should continue evaluating remaining resources under OR when an earlier resource is unknown to the role", () => {
		const response = looseRole.authorize(
			{ audit: ["read"], project: ["create"] },
			"OR",
		);
		expect(response.success).toBe(true);
	});

	it("should still fail under OR when no resource matches, including unknown ones", () => {
		const response = looseRole.authorize(
			{ audit: ["read"], project: ["delete-many"] },
			"OR",
		);
		expect(response.success).toBe(false);
	});

	it("should fail under AND when a resource is unknown to the role", () => {
		const response = looseRole.authorize({
			audit: ["read"],
			project: ["create"],
		});
		expect(response.success).toBe(false);
		if (!response.success) {
			expect(response.error).toContain("audit");
		}
	});

	it("should preserve unauthorized error formats for unknown and denied resources", () => {
		const unknownResource = looseRole.authorize({
			audit: ["read"],
		});
		const deniedAction = looseRole.authorize({
			project: ["delete-many"],
		});

		expect(unknownResource).toEqual({
			success: false,
			error: "You are not allowed to access resource: audit",
		});
		expect(deniedAction).toEqual({
			success: false,
			error: 'unauthorized to access resource "project"',
		});
	});

	it("should preserve AND behavior for unknown action connectors", () => {
		const response = role1.authorize({
			project: { actions: ["create", "delete-many"], connector: "XOR" },
		} as never);

		expect(response.success).toBe(false);
	});

	it("should return an unauthorized response for non-string action values", () => {
		const response = role1.authorize({
			project: ["create", 1],
		} as never);

		expect(response).toEqual({
			success: false,
			error: 'unauthorized to access resource "project"',
		});
	});
});
