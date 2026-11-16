import { describe, expect, it } from "vitest";
import { createAccessControl } from "../access";
import { hasPermission } from "./has-permission";

describe("admin hasPermission multiple roles permission union", () => {
	const ac = createAccessControl({
		user: ["create", "list", "set-role", "ban", "delete"],
		post: ["create", "read", "update", "delete"],
	});

	const roles = {
		userManager: ac.newRole({
			user: ["create", "list"],
		}),
		postModerator: ac.newRole({
			post: ["read", "delete"],
		}),
	};

	it("returns true when permissions are satisfied across multiple roles", () => {
		const result = hasPermission({
			role: "userManager, postModerator",
			permissions: {
				user: ["list"],
				post: ["delete"],
			},
			options: {
				roles,
			},
		});
		expect(result).toBe(true);
	});

	it("returns false when requested permissions exceed what assigned roles grant", () => {
		const result = hasPermission({
			role: "userManager, postModerator",
			permissions: {
				user: ["delete"],
			},
			options: {
				roles,
			},
		});
		expect(result).toBe(false);
	});

	it("returns true when userId matches adminUserIds", () => {
		const result = hasPermission({
			userId: "admin-1",
			permissions: {
				user: ["delete"],
			},
			options: {
				adminUserIds: ["admin-1"],
			},
		});
		expect(result).toBe(true);
	});
});
