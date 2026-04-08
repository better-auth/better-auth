import { describe, expect, it } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { organizationClient } from "./client";
import { organization } from "./organization";

describe("organization sso isolation", async () => {
	const { auth, signInWithTestUser, db } = await getTestInstance({
		plugins: [
			organization({
				teams: {
					enabled: true,
				},
			}),
		],
		session: {
			additionalFields: {
				ssoOrganizationId: {
					type: "string",
					required: false,
				},
				ssoProviderId: {
					type: "string",
					required: false,
				},
			},
		},
	});

	const { headers, user } = await signInWithTestUser();

	const client = createAuthClient({
		plugins: [organizationClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	it("should prevent switching to a different organization if session is SSO-scoped", async () => {
		// 1. Create Org A
		const orgA = await client.organization.create({
			name: "Org A",
			slug: "org-a",
			fetchOptions: { headers },
		});
		if (orgA.error) {
			console.error("Org A Creation Error:", orgA.error);
		}
		expect(orgA.data?.id).toBeDefined();
		const orgAId = orgA.data!.id;

		// 2. Create Org B
		const orgB = await client.organization.create({
			name: "Org B",
			slug: "org-b",
			fetchOptions: { headers },
		});
		if (orgB.error) {
			console.error("Org B Creation Error:", orgB.error);
		}
		expect(orgB.data?.id).toBeDefined();
		const orgBId = orgB.data!.id;

		// 3. Create a new session for the user that is scoped to Org A
		const ssoSessionToken = "sso-token-unique-" + Date.now();
		const _ssoSession = await db.create({
			model: "session",
			data: {
				userId: user.id,
				token: ssoSessionToken,
				expiresAt: new Date(Date.now() + 1000 * 60 * 60),
				ssoOrganizationId: orgAId,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		const ssoHeaders = new Headers();
		ssoHeaders.set("Authorization", `Bearer ${ssoSessionToken}`);

		// 4. Try to set Org A as active (should succeed)
		const setOrgA = await client.organization.setActive({
			organizationId: orgAId,
			fetchOptions: { headers: ssoHeaders },
		});
		expect(setOrgA.data?.id).toBe(orgAId);

		// 5. Try to set Org B as active (should fail with 403 Forbidden)
		const setOrgB = await client.organization.setActive({
			organizationId: orgBId,
			fetchOptions: { headers: ssoHeaders },
		});

		expect(setOrgB.error?.status).toBe(403);
		expect(setOrgB.error?.message).toContain(
			"Session is restricted to a different organization via SSO",
		);

		// 6. Try to get Org B details directly (should fail with 403 Forbidden)
		const getOrgB = await client.organization.getFullOrganization({
			query: {
				organizationId: orgBId,
			},
			fetchOptions: { headers: ssoHeaders },
		});

		expect(getOrgB.error?.status).toBe(403);
		expect(getOrgB.error?.message).toContain(
			"Session is restricted to a different organization via SSO",
		);

		// 7. Verify a normal (non-SSO) session can still access both
		const setOrgBNormal = await client.organization.setActive({
			organizationId: orgBId,
			fetchOptions: { headers },
		});
		expect(setOrgBNormal.data?.id).toBe(orgBId);
	});

	it("should filter organization list if session is SSO-scoped", async () => {
		const { headers, user } = await signInWithTestUser();

		const orgA = (
			await client.organization.create({
				name: "Filter Org A",
				slug: "filter-org-a",
				fetchOptions: { headers },
			})
		).data!;
		const _orgB = (
			await client.organization.create({
				name: "Filter Org B",
				slug: "filter-org-b",
				fetchOptions: { headers },
			})
		).data!;

		const ssoSessionToken = "filter-test-" + Date.now();
		await db.create({
			model: "session",
			data: {
				userId: user.id,
				token: ssoSessionToken,
				expiresAt: new Date(Date.now() + 1000 * 60 * 60),
				ssoOrganizationId: orgA.id,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		const ssoHeaders = new Headers();
		ssoHeaders.set("Authorization", `Bearer ${ssoSessionToken}`);

		const listRes = await client.organization.list({
			fetchOptions: { headers: ssoHeaders },
		});

		expect(listRes.data?.length).toBe(1);
		expect(listRes.data?.[0].id).toBe(orgA.id);
	});

	it("should prevent managing teams of a different organization if session is SSO-scoped", async () => {
		const { headers, user } = await signInWithTestUser();

		const orgA = (
			await client.organization.create({
				name: "Team Org A",
				slug: "team-org-a",
				fetchOptions: { headers },
			})
		).data!;
		const orgB = (
			await client.organization.create({
				name: "Team Org B",
				slug: "team-org-b",
				fetchOptions: { headers },
			})
		).data!;

		const teamInOrgB = (
			await client.organization.createTeam({
				name: "Team in B",
				organizationId: orgB.id,
				fetchOptions: { headers },
			})
		).data!;

		const ssoSessionToken = "team-test-" + Date.now();
		await db.create({
			model: "session",
			data: {
				userId: user.id,
				token: ssoSessionToken,
				expiresAt: new Date(Date.now() + 1000 * 60 * 60),
				ssoOrganizationId: orgA.id,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		const ssoHeaders = new Headers();
		ssoHeaders.set("Authorization", `Bearer ${ssoSessionToken}`);

		// Try to update team in Org B
		const _updateRes = await client.organization.updateTeam({
			teamId: teamInOrgB.id,
			data: { name: "Hacked Team" },
			fetchOptions: {
				headers: ssoHeaders,
				// Better auth usually uses the active organization from session if not provided,
				// but here we are explicitly checking the isolation.
				// We need to pass the organizationId of Org B to trigger the check against session.ssoOrganizationId
			},
		});

		// Wait, if organizationId is not passed in the body, it uses session.activeOrganizationId.
		// If the session is SSO-restricted to Org A, activeOrganizationId will be Org A (after setActive).
		// If they try to update a team that belongs to Org B but they claim it's in Org A (via implied activeOrg),
		// the `adapter.findTeamById` will fail or return mismatch.

		// Let's test explicit organizationId mismatch.
		const updateResExplicit = await client.organization.updateTeam({
			teamId: teamInOrgB.id,
			data: {
				name: "Hacked Team",
				// @ts-expect-error
				organizationId: orgB.id,
			},
			fetchOptions: { headers: ssoHeaders },
		});

		expect(updateResExplicit.error?.status).toBe(403);
		expect(updateResExplicit.error?.message).toContain(
			"Session is restricted to a different organization via SSO",
		);
	});
});
