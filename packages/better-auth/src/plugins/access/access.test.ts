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
});
