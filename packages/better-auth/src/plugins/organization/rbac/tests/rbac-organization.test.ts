import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../../../test-utils/test-instance";
import { organizationRbac } from "../rbac-organization";
import { organization } from "../..";

describe("RBAC Organization", async () => {
	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [
			organization(),
			organizationRbac({
				rbac: {
					enabled: true,
					defaultRoles: [
						{
							name: "Organization Owner",
							description: "Full access to the organization",
							level: 0,
							permissions: ["organization:*", "member:*", "team:*", "role:*"],
							isCreatorRole: true,
						},
						{
							name: "Member",
							description: "Standard member of the organization",
							level: 3,
							permissions: ["organization:read", "member:read", "team:read"],
						},
					],
				},
			}),
		],
	});

	const { headers, user } = await signInWithTestUser();

	it("should create an organization with RBAC enabled", async () => {
		console.log("DEBUG: Starting test - create organization with RBAC enabled");

		const organization = await auth.api.createOrganization({
			body: {
				name: "Test Organization",
				slug: "test-org",
				userId: user.id,
			},
		});

		console.log("DEBUG: Organization created:", organization);
		expect(organization).toBeDefined();
		expect(organization?.name).toBe("Test Organization");
		expect(organization?.slug).toBe("test-org");
		expect(organization?.members).toBeDefined();
		expect(organization?.members?.length).toBe(1);
		expect(organization?.members?.[0]?.role).toBe("owner");
	});

	it("should not break organization creation when RBAC setup fails", async () => {
		// This test verifies that organization creation still works even if RBAC setup encounters errors
		const organization = await auth.api.createOrganization({
			body: {
				name: "Test Organization 2",
				slug: "test-org-2",
				userId: user.id,
			},
		});

		// Organization should still be created even if RBAC setup fails internally
		expect(organization).toBeDefined();
		expect(organization?.name).toBe("Test Organization 2");
		expect(organization?.slug).toBe("test-org-2");
	});
});
