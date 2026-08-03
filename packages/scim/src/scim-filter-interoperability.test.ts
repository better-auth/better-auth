import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";

const BASE_URL = "http://localhost:3000";
const SCIM_USERS_URL = `${BASE_URL}/api/auth/scim/v2/Users`;
const SCIM_GROUPS_URL = `${BASE_URL}/api/auth/scim/v2/Groups`;

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
		grace,
		partnerPlatformGroup,
		platformGroup,
		quotedGroup,
		quotedGroupName,
		async listUsers(filter: string) {
			const url = new URL(SCIM_USERS_URL);
			url.searchParams.set("filter", filter);
			const response = await auth.handler(
				new Request(url, {
					headers: {
						accept: "application/scim+json",
						authorization: "Bearer test-scim-token",
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
});
