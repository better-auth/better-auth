import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";

const BASE_URL = "http://localhost:3000";
const SCIM_USERS_URL = `${BASE_URL}/api/auth/scim/v2/Users`;

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
						credentials: [{ type: "bearer", token: "test-scim-token" }],
					},
				],
			}),
		],
	});
	const headers = { authorization: "Bearer test-scim-token" };
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
				{ value: "ada.work@example.com", type: "work" },
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

	return {
		ada,
		grace,
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
});
