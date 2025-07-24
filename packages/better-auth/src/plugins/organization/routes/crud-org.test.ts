import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../../test-utils/test-instance";
import { organization } from "../organization";
import { createAuthClient } from "../../../client";
import { organizationClient } from "../client";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";

describe("get-full-organization", async () => {
	const { auth, signInWithTestUser, cookieSetter } = await getTestInstance({
		user: {
			modelName: "users",
		},
		plugins: [
			organization({
				membershipLimit: 6,
				async sendInvitationEmail(data, request) {},
				schema: {
					organization: {
						modelName: "team",
					},
					member: {
						modelName: "teamMembers",
						fields: {
							userId: "user_id",
						},
					},
				},
				invitationLimit: 3,
			}),
		],
		logger: {
			level: "error",
		},
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
	const org = await client.organization.create({
		name: "test",
		slug: "test",
		metadata: {
			test: "test",
		},
		fetchOptions: {
			headers,
		},
	});
	const secondOrg = await client.organization.create({
		name: "test-second",
		slug: "test-second",
		metadata: {
			test: "second-org",
		},
		fetchOptions: {
			headers,
		},
	});

	it("should get organization by organizationId", async () => {
		const { headers } = await signInWithTestUser();

		//set the second org as active
		await client.organization.setActive({
			organizationId: secondOrg.data?.id as string,
			fetchOptions: {
				headers,
			},
		});
		const orgById = await client.organization.getFullOrganization({
			query: {
				// get the first org
				organizationId: org.data?.id as string,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(orgById.data?.name).toBe("test");
	});

	it("should get organization by organizationSlug", async () => {
		const { headers } = await signInWithTestUser();
		const orgBySlug = await client.organization.getFullOrganization({
			query: {
				organizationSlug: "test",
			},
			fetchOptions: {
				headers,
			},
		});
		expect(orgBySlug.data?.name).toBe("test");
	});

	it("should return null when no active organization and no query params", async () => {
		await client.organization.setActive({
			organizationId: null,
			fetchOptions: {
				headers,
			},
		});
		const result = await client.organization.getFullOrganization({
			fetchOptions: {
				headers: headers,
			},
		});
		expect(result.data).toBeNull();
		expect(result.error).toBeNull();
	});

	it("should throw FORBIDDEN when user is not a member of the organization", async () => {
		const newHeaders = new Headers();
		await client.signUp.email(
			{
				email: "test3@test.com",
				password: "password",
				name: "test3",
			},
			{
				onSuccess: cookieSetter(newHeaders),
			},
		);
		const result = await client.organization.getFullOrganization({
			query: {
				organizationId: org.data?.id as string,
			},
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(result.error?.status).toBe(403);
		expect(result.error?.message).toContain(
			ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
		);
	});

	it("should throw BAD_REQUEST when organization doesn't exist", async () => {
		const result = await client.organization.getFullOrganization({
			query: {
				organizationId: "non-existent-org-id",
			},
			fetchOptions: {
				headers,
			},
		});
		expect(result.error?.status).toBe(400);
		expect(result.error?.message).toContain(
			ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
		);
	});

	it("should include invitations in the response", async () => {
		await client.organization.setActive({
			organizationId: org.data?.id as string,
			fetchOptions: {
				headers,
			},
		});

		// Create an invitation
		await client.organization.inviteMember({
			email: "invited@test.com",
			role: "member",
			fetchOptions: {
				headers,
			},
		});

		const fullOrg = await client.organization.getFullOrganization({
			fetchOptions: {
				headers,
			},
		});

		expect(fullOrg.data?.invitations).toBeDefined();
		expect(Array.isArray(fullOrg.data?.invitations)).toBe(true);
		const invitation = fullOrg.data?.invitations.find(
			(inv: any) => inv.email === "invited@test.com",
		);
		expect(invitation).toBeDefined();
		expect(invitation?.role).toBe("member");
	});

	it("should prioritize organizationSlug over organizationId when both are provided", async () => {
		const result = await client.organization.getFullOrganization({
			query: {
				organizationId: org.data?.id as string,
				organizationSlug: secondOrg.data?.slug as string,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(result.data).toBeTruthy();
		expect(result.data?.name).toBe(secondOrg.data?.name);
	});

	it("should allow listing members with membersLimit", async () => {
		const { headers } = await signInWithTestUser();
		await client.organization.setActive({
			organizationId: org.data?.id as string,
			fetchOptions: {
				headers,
			},
		});
		const newUser = await auth.api.signUpEmail({
			body: {
				email: "test2@test.com",
				password: "password",
				name: "test2",
			},
		});
		await auth.api.addMember({
			body: {
				userId: newUser.user.id,
				role: "member",
				organizationId: org.data?.id as string,
			},
		});
		const FullOrganization = await client.organization.getFullOrganization({
			fetchOptions: {
				headers,
			},
		});
		expect(FullOrganization.data?.members.length).toBe(2);

		const limitedMembers = await client.organization.getFullOrganization({
			query: {
				membersLimit: 1,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(limitedMembers.data?.members.length).toBe(1);
	});

	it("should use default membershipLimit when no membersLimit is specified", async () => {
		await client.organization.setActive({
			organizationId: org.data?.id as string,
			fetchOptions: {
				headers,
			},
		});
		for (let i = 3; i <= 5; i++) {
			const newUser = await auth.api.signUpEmail({
				body: {
					email: `test-${i}@test.com`,
					password: "password",
					name: `test${i}`,
				},
			});
			await auth.api.addMember({
				body: {
					userId: newUser.user.id,
					role: "member",
					organizationId: org.data?.id as string,
				},
			});
		}

		const fullOrg = await client.organization.getFullOrganization({
			fetchOptions: {
				headers,
			},
		});

		expect(fullOrg.data?.members.length).toBeGreaterThan(3);
		expect(fullOrg.data?.members.length).toBeLessThanOrEqual(6);
	});
});
