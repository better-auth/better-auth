import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../../../test-utils/test-instance";
import { organizationRbac } from "../rbac-organization";
import { organization } from "../..";
import { createAuthClient } from "../../../../client";
import { organizationClient } from "../../client";

describe("RBAC Organization Integration", async () => {
	// Enable the RBAC plugin alongside organization plugin
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
					],
				},
			}),
		],
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [organizationClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	it("should create organization with RBAC enabled", async () => {
		const organization = await client.organization.create({
			name: "RBAC Test Organization",
			slug: "rbac-test-org",
			fetchOptions: {
				headers,
			},
		});

		// Basic organization assertions
		expect(organization.data?.name).toBe("RBAC Test Organization");
		expect(organization.data?.slug).toBe("rbac-test-org");
		expect(organization.data?.members?.length).toBe(1);
		expect(organization.data?.members?.[0]?.role).toBe("owner");
	});
});
