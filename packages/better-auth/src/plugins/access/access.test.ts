import { describe, expect, it } from "vitest";
import { createAccessControl } from "./access";

describe("access", () => {
	const ac = createAccessControl({
		project: ["create", "update", "delete", "delete-many"],
		ui: ["view", "edit", "comment", "hide"],
	});

	const role1 = ac.newRole({
		project: ["create", "update", "delete"],
		ui: ["view", "edit", "comment"],
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
