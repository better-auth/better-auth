import { describe, expect } from "vitest";
import { getOrgTestInstance as getInstance } from "../../test-utils";
import { ORGANIZATION_ERROR_CODES } from "../../error-codes";
const testInvitations = [
	{
		email: "test2@test.com",
		role: "member",
		status: "pending",
		expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
		inviterId: "inviter-id",
		id: "invitation-id",
	},
	{
		email: "test3@test.com",
		role: "member",
		status: "pending",
		expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
		inviterId: "inviter-id",
		id: "invitation-id",
	},
	{
		email: "test4@test.com",
		role: "member",
		status: "pending",
		expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
		inviterId: "inviter-id",
		id: "invitation-id",
	},
	{
		email: "test5@test.com",
		role: "member",
		status: "pending",
		expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
		inviterId: "inviter-id",
		id: "invitation-id",
	},
] as const;

async function createInvitations(
	client: {
		organization: {
			inviteMember: (data: {
				organizationId: string;
				email: string;
				role: "member" | "owner" | "admin";
				fetchOptions: {
					headers: Headers;
				};
			}) => Promise<any>;
		};
	},
	organization: { id: string },
	headers: Headers,
) {
	for (const invitation of testInvitations) {
		await client.organization.inviteMember({
			organizationId: organization?.id,
			email: invitation.email,
			role: invitation.role,
			fetchOptions: {
				headers,
			},
		});
	}
}

describe("list invitations", async (it) => {
	it("should list invitations", async () => {
		const { client, headers, organization } = await getInstance();
		await createInvitations(client, organization!, headers);
		const invitations = await client.organization.listInvitations({
			query: {
				organizationId: organization?.id,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(invitations.data).toHaveLength(testInvitations.length);
		expect(
			invitations.data?.every(
				(invitation) => invitation.organizationId === organization?.id,
			),
		).toBe(true);
	});

	it("should list invitations from the active organization if organization id is not provided", async () => {
		const { client, headers, organization } = await getInstance();
		await createInvitations(client, organization!, headers);
		const invitations = await client.organization.listInvitations({
			fetchOptions: {
				headers,
			},
		});
		expect(invitations.data).toHaveLength(testInvitations.length);
		expect(
			invitations.data?.every(
				(invitation) => invitation.organizationId === organization?.id,
			),
		).toBe(true);
	});

	it("should prioritize organization id over active organization", async () => {
		const { client, headers, organization } = await getInstance();
		const newOrganization = await client.organization.create({
			name: "new organization",
			slug: "new-organization",
		});
		await createInvitations(client, newOrganization.data!, headers);
		const invitations = await client.organization.listInvitations({
			query: {
				organizationId: organization?.id,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(invitations.data).toHaveLength(testInvitations.length);
		expect(
			invitations.data?.every(
				(invitation) => invitation.organizationId === organization?.id,
			),
		).toBe(true);
	});

	it("should allow passing limit and offset", async () => {
		const { client, headers, organization } = await getInstance();
		await createInvitations(client, organization!, headers);
		const invitations = await client.organization.listInvitations({
			query: {
				organizationId: organization?.id,
				limit: 2,
				offset: 1,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(invitations.data).toHaveLength(2);
		expect(invitations.data?.[0].email).toBe("test3@test.com");
		expect(invitations.data?.[1].email).toBe("test4@test.com");
	});

	it("should allow sorting", async () => {
		const { client, headers, organization } = await getInstance();
		await createInvitations(client, organization!, headers);
		const invitations = await client.organization.listInvitations({
			query: {
				organizationId: organization?.id,
				sortBy: "email",
				sortDirection: "desc",
			},
			fetchOptions: {
				headers,
			},
		});
		expect(invitations.data?.[0].email).toBe("test5@test.com");
		expect(invitations.data?.[1].email).toBe("test4@test.com");
		expect(invitations.data?.[2].email).toBe("test3@test.com");
		expect(invitations.data?.[3].email).toBe("test2@test.com");
	});

	it("should list invitations with filter", async () => {
		const { client, headers, organization } = await getInstance();
		await createInvitations(client, organization!, headers);
		const invitations = await client.organization.listInvitations({
			query: {
				filterField: "email",
				filterValue: "test2@test.com",
				filterOperator: "eq",
			},
			fetchOptions: {
				headers,
			},
		});
		expect(invitations.data).toHaveLength(1);
		expect(invitations.data?.[0].email).toBe("test2@test.com");
	});

	it("should not allow listing if organization id is not provided", async () => {
		const { client, headers } = await getInstance();
		const invitations = await client.organization.listInvitations({
			query: {
				organizationId: "non-existent-organization-id",
			},
			fetchOptions: {
				headers,
			},
		});
		expect(invitations.error?.status).toBe(403);
		expect(invitations.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
		);
	});

	it("should not allow listing if a user is not a member of the organization", async () => {
		const { client, headers, organization } = await getInstance();
		await createInvitations(client, organization!, headers);
		const newUser = await client.signUp.email({
			email: "new-user@test.com",
			password: "password",
			name: "new user",
		});
		const invitations = await client.organization.listInvitations({
			query: {
				organizationId: organization?.id,
			},
			fetchOptions: {
				headers: new Headers({
					authorization: `Bearer ${newUser.data?.token}`,
				}),
			},
		});
		expect(invitations.error?.status).toBe(403);
		expect(invitations.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
		);
	});

	it("should prevent passing sensitive filter values", async () => {
		const { client, headers, organization } = await getInstance();
		await createInvitations(client, organization!, headers);
		const newUser = await client.signUp.email({
			email: testInvitations[0].email,
			password: "password",
			name: "new user",
		});
		const newOrganization = await client.organization.create({
			name: "new organization",
			slug: "new-organization",
			fetchOptions: {
				headers: {
					authorization: `Bearer ${newUser.data?.token}`,
				},
			},
		});
		const invitations = await client.organization.listInvitations({
			query: {
				filterField: "organizationId",
				filterValue: newOrganization.data?.id,
				filterOperator: "eq",
			},
			fetchOptions: {
				headers,
			},
		});
		expect(invitations.error?.status).toBe(403);
		expect(invitations.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
		);
	});
});

describe("list user invitations", async (it) => {
	it("should list user invitations", async () => {
		const { client, headers, organization } = await getInstance();
		await createInvitations(client, organization!, headers);
		const newUser = await client.signUp.email({
			email: testInvitations[0].email,
			password: "password",
			name: "new user",
		});
		const invitations = await client.organization.listUserInvitations({
			fetchOptions: {
				headers: new Headers({
					authorization: `Bearer ${newUser.data?.token}`,
				}),
			},
		});
		expect(invitations.data).toHaveLength(1);
		expect(invitations.data?.[0].email).toBe(testInvitations[0].email);
		expect(invitations.data?.[0].organizationId).toBe(organization?.id);
	});

	it("should allow listing user invitations with email from the server", async () => {
		const { auth, headers, client, organization } = await getInstance();
		await createInvitations(client, organization!, headers);
		const invitations = await auth.api.listUserInvitations({
			query: {
				email: testInvitations[0].email,
			},
		});
		expect(invitations).toHaveLength(1);
		expect(invitations?.[0].email).toBe(testInvitations[0].email);
		expect(invitations?.[0].organizationId).toBe(organization?.id);
	});

	it("should not allow listing user invitations with email from the client", async () => {
		const { client, headers, organization } = await getInstance();
		await createInvitations(client, organization!, headers);
		const invitations = await client.organization.listUserInvitations({
			query: {
				email: testInvitations[0].email,
			},
		});
		expect(invitations.error?.status).toBe(400);
		expect(invitations.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.USER_EMAIL_CANNOT_BE_PASSED_FOR_CLIENT_SIDE_API_CALLS,
		);
	});

	it("should not use `email` if headers is provided form server side", async () => {
		const { auth, headers, client, organization } = await getInstance();
		await createInvitations(client, organization!, headers);
		const invitations = await auth.api.listUserInvitations({
			query: {
				email: testInvitations[0].email,
			},
			headers,
		});
		expect(invitations).toHaveLength(0);
		const newUser = await client.signUp.email({
			email: testInvitations[0].email,
			password: "password",
			name: "new user",
		});
		const invitations2 = await auth.api.listUserInvitations({
			query: {
				email: testInvitations[1].email, //this is effectively ignored
			},
			headers: new Headers({
				authorization: `Bearer ${newUser.data?.token}`,
			}),
		});
		expect(invitations2).toHaveLength(1);
		expect(invitations2?.[0].email).toBe(testInvitations[0].email);
		expect(invitations2?.[0].organizationId).toBe(organization?.id);
	});

	it("should allow listing user invitations with filter", async () => {
		const { client, headers, organization } = await getInstance();
		await createInvitations(client, organization!, headers);
		const newOrganization = await client.organization.create({
			name: "new organization",
			slug: "new-organization",
			fetchOptions: {
				headers,
			},
		});
		await createInvitations(client, newOrganization.data!, headers);
		const newUser = await client.signUp.email({
			email: testInvitations[0].email,
			password: "password",
			name: "new user",
		});
		const invitations = await client.organization.listUserInvitations({
			query: {
				filterField: "organizationId",
				filterValue: newOrganization.data?.id,
				filterOperator: "eq",
			},
			fetchOptions: {
				headers: {
					authorization: `Bearer ${newUser.data?.token}`,
				},
			},
		});
		expect(invitations.data).toHaveLength(1);
		expect(invitations.data?.[0].email).toBe(testInvitations[0].email);
		expect(invitations.data?.[0].organizationId).toBe(newOrganization.data?.id);
	});

	it("should not allow listing user invitations with filter if  email is provided", async () => {
		const { client, headers, organization } = await getInstance();
		await createInvitations(client, organization!, headers);
		const invitations = await client.organization.listUserInvitations({
			query: {
				filterField: "email",
				filterValue: testInvitations[0].email,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(invitations.error?.status).toBe(403);
	});
});
