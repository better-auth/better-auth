import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";

const BASE_URL = "http://localhost:3000";
const SCIM_USERS_URL = `${BASE_URL}/api/auth/scim/v2/Users`;
const SCIM_GROUPS_URL = `${BASE_URL}/api/auth/scim/v2/Groups`;

function listResourceIds(body: unknown): string[] {
	if (
		typeof body !== "object" ||
		body === null ||
		!("Resources" in body) ||
		!Array.isArray(body.Resources)
	) {
		return [];
	}
	return body.Resources.flatMap((resource) =>
		typeof resource === "object" &&
		resource !== null &&
		"id" in resource &&
		typeof resource.id === "string"
			? [resource.id]
			: [],
	);
}

async function createFilterFixture() {
	const data = {
		user: [] as User[],
		session: [] as { id: string }[],
		verification: [] as { id: string }[],
		account: [] as { id: string }[],
		scimConnectionBinding: [] as { id: string }[],
		scimIdentityTombstone: [] as { id: string }[],
		scimSubject: [] as { id: string; userId: string }[],
		scimUser: [] as { id: string }[],
		scimGroup: [] as { id: string }[],
		scimGroupMember: [] as { id: string }[],
		scimProjectionGrant: [] as { id: string }[],
	};
	const auth = betterAuth({
		baseURL: BASE_URL,
		database: memoryAdapter(data),
		plugins: [
			scim({
				connections: [
					{
						id: "workforce",
						credentials: [
							{
								type: "bearer",
								id: "test-scim-token",
								token: "test-scim-token",
							},
						],
					},
					{
						id: "partner-workforce",
						credentials: [
							{
								type: "bearer",
								id: "partner-scim-token",
								token: "partner-scim-token",
							},
						],
					},
				],
			}),
		],
	});
	const headers = { authorization: "Bearer test-scim-token" };
	const partnerHeaders = { authorization: "Bearer partner-scim-token" };
	const ada = await auth.api.createSCIMUser({
		body: {
			schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
			userName: "ada.login@example.com",
			externalId: "entra-ada",
			emails: [
				{
					value: "ada.home@example.com",
					type: "home",
					primary: true,
				},
				{ value: "ada.work@example.com", type: "other" },
				{ value: "ada.alias@example.com", type: "work" },
			],
		},
		headers,
	});
	const grace = await auth.api.createSCIMUser({
		body: {
			schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
			userName: "grace.login@example.com",
			externalId: "entra-grace",
			emails: [
				{
					value: "grace.work@example.com",
					type: "work",
					primary: true,
				},
			],
		},
		headers,
	});
	const platformGroup = await auth.api.createSCIMGroup({
		body: {
			schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
			displayName: "MyPlatform BA SCIM - Admins",
		},
		headers,
	});
	const partnerPlatformGroup = await auth.api.createSCIMGroup({
		body: {
			schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
			displayName: "MyPlatform BA SCIM - Admins",
		},
		headers: partnerHeaders,
	});
	const quotedGroupName = 'Research and Development - "Admins"';
	const quotedGroup = await auth.api.createSCIMGroup({
		body: {
			schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
			externalId: "research-and-development-admins",
			displayName: quotedGroupName,
		},
		headers,
	});

	return {
		ada,
		auth,
		grace,
		partnerHeaders,
		partnerPlatformGroup,
		platformGroup,
		quotedGroup,
		quotedGroupName,
		async listUsers(
			filter: string,
			token: "partner-scim-token" | "test-scim-token" = "test-scim-token",
			pagination?: { count?: string; startIndex?: string },
		) {
			const url = new URL(SCIM_USERS_URL);
			url.searchParams.set("filter", filter);
			if (pagination?.startIndex) {
				url.searchParams.set("startIndex", pagination.startIndex);
			}
			if (pagination?.count) {
				url.searchParams.set("count", pagination.count);
			}
			const response = await auth.handler(
				new Request(url, {
					headers: {
						accept: "application/scim+json",
						authorization: `Bearer ${token}`,
					},
				}),
			);
			const body: unknown = await response.json();
			return { status: response.status, body };
		},
		async listGroups(
			filter: string,
			token: "partner-scim-token" | "test-scim-token" = "test-scim-token",
		) {
			const url = new URL(SCIM_GROUPS_URL);
			url.searchParams.set("filter", filter);
			const response = await auth.handler(
				new Request(url, {
					headers: {
						accept: "application/scim+json",
						authorization: `Bearer ${token}`,
					},
				}),
			);
			const body: unknown = await response.json();
			return { status: response.status, body };
		},
	};
}

describe("SCIM provider filter interoperability", () => {
	it("evaluates every equality expression in a logical and filter", async () => {
		const { ada, listUsers } = await createFilterFixture();
		const matching = await listUsers(
			'userName eq "ada.login@example.com" and externalId eq "entra-ada"',
		);
		const mismatching = await listUsers(
			'userName eq "ada.login@example.com" and externalId eq "entra-grace"',
		);

		expect(matching).toMatchObject({
			status: 200,
			body: {
				totalResults: 1,
				Resources: [{ id: ada.id }],
			},
		});
		expect(mismatching).toMatchObject({
			status: 200,
			body: {
				totalResults: 0,
				Resources: [],
			},
		});
	});

	it("accepts a core-schema-qualified User attribute", async () => {
		const { grace, listUsers } = await createFilterFixture();
		const result = await listUsers(
			'urn:ietf:params:scim:schemas:core:2.0:User:userName eq "grace.login@example.com"',
		);

		expect(result).toMatchObject({
			status: 200,
			body: {
				totalResults: 1,
				Resources: [{ id: grace.id }],
			},
		});
	});

	it('accepts Entra emails[type eq "work"].value equality', async () => {
		const { ada, listUsers } = await createFilterFixture();
		const result = await listUsers(
			'emails[type eq "work"].value eq "ada.alias@example.com"',
		);

		expect(result).toMatchObject({
			status: 200,
			body: {
				totalResults: 1,
				Resources: [{ id: ada.id }],
			},
		});
	});

	it("filters quoted Group display names through the bearer-authenticated HTTP endpoint", async () => {
		const {
			listGroups,
			partnerPlatformGroup,
			platformGroup,
			quotedGroup,
			quotedGroupName,
		} = await createFilterFixture();
		const filter = 'displayName eq "MyPlatform BA SCIM - Admins"';
		const [workforce, partner, quoted, unsupported, invalid] =
			await Promise.all([
				listGroups(filter),
				listGroups(filter, "partner-scim-token"),
				listGroups(
					`displayName eq ${JSON.stringify(quotedGroupName)} and externalId eq "research-and-development-admins"`,
				),
				listGroups('displayName ne "MyPlatform BA SCIM - Admins"'),
				listGroups("displayName eq MyPlatform"),
			]);

		expect(workforce).toMatchObject({
			status: 200,
			body: {
				totalResults: 1,
				Resources: [{ id: platformGroup.id }],
			},
		});
		expect(partner).toMatchObject({
			status: 200,
			body: {
				totalResults: 1,
				Resources: [{ id: partnerPlatformGroup.id }],
			},
		});
		expect(workforce.body).not.toMatchObject({
			Resources: expect.arrayContaining([{ id: partnerPlatformGroup.id }]),
		});
		expect(partner.body).not.toMatchObject({
			Resources: expect.arrayContaining([{ id: platformGroup.id }]),
		});
		expect(quoted).toMatchObject({
			status: 200,
			body: {
				totalResults: 1,
				Resources: [
					{
						id: quotedGroup.id,
						displayName: quotedGroupName,
					},
				],
			},
		});
		expect(unsupported).toMatchObject({
			status: 400,
			body: { scimType: "invalidFilter" },
		});
		expect(invalid).toMatchObject({
			status: 400,
			body: { scimType: "invalidFilter" },
		});
	});

	it("evaluates a logical or of equality expressions without leaving the connection", async () => {
		const {
			ada,
			auth,
			grace,
			listGroups,
			listUsers,
			partnerHeaders,
			partnerPlatformGroup,
			platformGroup,
			quotedGroup,
		} = await createFilterFixture();
		const partnerAda = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ada.login@example.com",
				emails: [
					{
						value: "ada.alias@example.com",
						type: "work",
						primary: true,
					},
				],
			},
			headers: partnerHeaders,
		});
		const matching = await listUsers(
			'userName eq "ada.login@example.com" or emails.value eq "grace.work@example.com"',
		);
		const firstPage = await listUsers(
			'userName eq "ada.login@example.com" or emails.value eq "grace.work@example.com"',
			"test-scim-token",
			{ count: "1", startIndex: "1" },
		);
		const secondPage = await listUsers(
			'userName eq "ada.login@example.com" or emails.value eq "grace.work@example.com"',
			"test-scim-token",
			{ count: "1", startIndex: "2" },
		);
		const mismatching = await listUsers(
			'userName eq "missing@example.com" or emails.value eq "missing.alias@example.com"',
		);
		const partner = await listUsers(
			'userName eq "ada.login@example.com" or emails.value eq "ada.alias@example.com"',
			"partner-scim-token",
		);
		const groups = await listGroups(
			'displayName eq "MyPlatform BA SCIM - Admins" or displayName eq "Research and Development - \\"Admins\\""',
		);
		const mixed = await listUsers(
			'userName eq "ada.login@example.com" and externalId eq "entra-ada" or emails.value eq "grace.work@example.com"',
		);

		const matchingIds = listResourceIds(matching.body);
		const partnerIds = listResourceIds(partner.body);
		const groupIds = listResourceIds(groups.body);

		expect(matching).toMatchObject({
			status: 200,
			body: {
				totalResults: 2,
			},
		});
		expect(matchingIds).toEqual(expect.arrayContaining([ada.id, grace.id]));
		expect(matchingIds).toHaveLength(2);
		expect(matchingIds).not.toContain(partnerAda.id);
		expect(firstPage).toMatchObject({
			status: 200,
			body: {
				totalResults: 2,
				startIndex: 1,
				itemsPerPage: 1,
			},
		});
		expect(listResourceIds(firstPage.body)).toEqual(matchingIds.slice(0, 1));
		expect(secondPage).toMatchObject({
			status: 200,
			body: {
				totalResults: 2,
				startIndex: 2,
				itemsPerPage: 1,
			},
		});
		expect(listResourceIds(secondPage.body)).toEqual(matchingIds.slice(1, 2));
		expect(mismatching).toMatchObject({
			status: 200,
			body: {
				totalResults: 0,
				Resources: [],
			},
		});
		expect(partner).toMatchObject({
			status: 200,
			body: {
				totalResults: 1,
				Resources: [{ id: partnerAda.id }],
			},
		});
		expect(partnerIds).toEqual([partnerAda.id]);
		expect(partnerIds).not.toContain(ada.id);
		expect(groups).toMatchObject({
			status: 200,
			body: {
				totalResults: 2,
			},
		});
		expect(groupIds).toEqual(
			expect.arrayContaining([platformGroup.id, quotedGroup.id]),
		);
		expect(groupIds).toHaveLength(2);
		expect(groupIds).not.toContain(partnerPlatformGroup.id);
		expect(mixed).toMatchObject({
			status: 400,
			body: { scimType: "invalidFilter" },
		});
	});
});
