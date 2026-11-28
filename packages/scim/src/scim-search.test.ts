import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";

const BASE_URL = "http://localhost:3000";
const SCIM_USERS_URL = `${BASE_URL}/api/auth/scim/v2/Users`;
const SCIM_GROUPS_URL = `${BASE_URL}/api/auth/scim/v2/Groups`;
const SCIM_USER_SEARCH_URL = `${SCIM_USERS_URL}/.search`;
const SCIM_GROUP_SEARCH_URL = `${SCIM_GROUPS_URL}/.search`;
const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_SEARCH_REQUEST_SCHEMA =
	"urn:ietf:params:scim:api:messages:2.0:SearchRequest";
const SCIM_LIST_RESPONSE_SCHEMA =
	"urn:ietf:params:scim:api:messages:2.0:ListResponse";
const SCIM_MEDIA_TYPE = "application/scim+json";

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

async function createSearchFixture() {
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
							{
								type: "bearer",
								id: "read-scim-token",
								token: "read-scim-token",
								scopes: ["scim.users.read", "scim.groups.read"],
							},
							{
								type: "bearer",
								id: "write-scim-token",
								token: "write-scim-token",
								scopes: ["scim.users.write", "scim.groups.write"],
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
	const ada = await auth.api.createSCIMUser({
		body: {
			schemas: [SCIM_USER_SCHEMA],
			userName: "ada.login@example.com",
			emails: [
				{
					value: "ada.work@example.com",
					type: "work",
					primary: true,
				},
				{ value: "ada.alias@example.com", type: "home" },
			],
		},
		headers,
	});
	const grace = await auth.api.createSCIMUser({
		body: {
			schemas: [SCIM_USER_SCHEMA],
			userName: "grace.login@example.com",
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
	const engineering = await auth.api.createSCIMGroup({
		body: {
			schemas: [SCIM_GROUP_SCHEMA],
			displayName: "Engineering",
			externalId: "workforce-engineering",
		},
		headers,
	});
	const research = await auth.api.createSCIMGroup({
		body: {
			schemas: [SCIM_GROUP_SCHEMA],
			displayName: "Research",
		},
		headers,
	});
	const partnerAda = await auth.api.createSCIMUser({
		body: {
			schemas: [SCIM_USER_SCHEMA],
			userName: "ada.login@example.com",
			emails: [
				{
					value: "ada.alias@example.com",
					type: "work",
					primary: true,
				},
			],
		},
		headers: { authorization: "Bearer partner-scim-token" },
	});
	const partnerEngineering = await auth.api.createSCIMGroup({
		body: {
			schemas: [SCIM_GROUP_SCHEMA],
			displayName: "Engineering",
		},
		headers: { authorization: "Bearer partner-scim-token" },
	});

	async function requestSearch(
		url: string,
		body: unknown,
		options?: {
			query?: Record<string, string>;
			token?: string;
		},
	) {
		const requestURL = new URL(url);
		for (const [name, value] of Object.entries(options?.query ?? {})) {
			requestURL.searchParams.set(name, value);
		}
		const response = await auth.handler(
			new Request(requestURL, {
				method: "POST",
				headers: {
					accept: SCIM_MEDIA_TYPE,
					authorization: `Bearer ${options?.token ?? "test-scim-token"}`,
					"content-type": SCIM_MEDIA_TYPE,
				},
				body: JSON.stringify(body),
			}),
		);
		const responseBody: unknown = await response.json();
		return { status: response.status, body: responseBody };
	}

	return {
		ada,
		auth,
		engineering,
		grace,
		partnerAda,
		partnerEngineering,
		research,
		searchGroups(
			body: unknown,
			options?: { query?: Record<string, string>; token?: string },
		) {
			return requestSearch(SCIM_GROUP_SEARCH_URL, body, options);
		},
		searchUsers(
			body: unknown,
			options?: { query?: Record<string, string>; token?: string },
		) {
			return requestSearch(SCIM_USER_SEARCH_URL, body, options);
		},
	};
}

describe("SCIM POST /.search", () => {
	it("lists the connection with an empty SearchRequest like GET", async () => {
		const { ada, auth, grace, searchUsers } = await createSearchFixture();
		const listed = await auth.api.listSCIMUsers({
			headers: { authorization: "Bearer test-scim-token" },
		});
		const searched = await searchUsers({
			schemas: [SCIM_SEARCH_REQUEST_SCHEMA],
		});

		expect(searched).toMatchObject({
			status: 200,
			body: {
				schemas: [SCIM_LIST_RESPONSE_SCHEMA],
				totalResults: 2,
				startIndex: 1,
			},
		});
		expect(listResourceIds(searched.body)).toEqual(
			listed.Resources.map((user) => user.id),
		);
		expect(listResourceIds(searched.body)).toEqual(
			expect.arrayContaining([ada.id, grace.id]),
		);
	});

	it("matches the GET filter grammar, including or", async () => {
		const { ada, auth, grace, searchUsers } = await createSearchFixture();
		const filter =
			'userName eq "ada.login@example.com" or emails.value eq "grace.work@example.com"';
		const listed = await auth.api.listSCIMUsers({
			query: { filter },
			headers: { authorization: "Bearer test-scim-token" },
		});
		const searched = await searchUsers({
			schemas: [SCIM_SEARCH_REQUEST_SCHEMA],
			filter,
		});

		expect(searched.status).toBe(200);
		expect(listResourceIds(searched.body)).toEqual(
			listed.Resources.map((user) => user.id),
		);
		expect(listResourceIds(searched.body)).toEqual(
			expect.arrayContaining([ada.id, grace.id]),
		);
		expect(listResourceIds(searched.body)).toHaveLength(2);
	});

	it("projects attributes supplied as a JSON array in the body", async () => {
		const { ada, searchUsers } = await createSearchFixture();
		const searched = await searchUsers({
			schemas: [SCIM_SEARCH_REQUEST_SCHEMA],
			filter: 'userName eq "ada.login@example.com"',
			attributes: ["userName", "emails"],
		});

		expect(searched).toMatchObject({
			status: 200,
			body: {
				totalResults: 1,
				Resources: [
					{
						schemas: [SCIM_USER_SCHEMA],
						id: ada.id,
						userName: "ada.login@example.com",
						emails: [
							{
								value: "ada.work@example.com",
								type: "work",
								primary: true,
							},
							{ value: "ada.alias@example.com", type: "home" },
						],
					},
				],
			},
		});
		expect(
			typeof searched.body === "object" &&
				searched.body !== null &&
				"Resources" in searched.body &&
				Array.isArray(searched.body.Resources)
				? searched.body.Resources[0]
				: undefined,
		).not.toHaveProperty("displayName");
	});

	it("searches Groups with the same SearchRequest contract", async () => {
		const { engineering, research, searchGroups } = await createSearchFixture();
		const searched = await searchGroups({
			schemas: [SCIM_SEARCH_REQUEST_SCHEMA],
			filter: 'displayName eq "Engineering" or displayName eq "Research"',
		});

		expect(searched.status).toBe(200);
		expect(searched.body).toMatchObject({
			schemas: [SCIM_LIST_RESPONSE_SCHEMA],
			totalResults: 2,
		});
		expect(listResourceIds(searched.body)).toEqual(
			expect.arrayContaining([engineering.id, research.id]),
		);
		expect(listResourceIds(searched.body)).toHaveLength(2);
	});

	it("keeps SearchRequest results inside the authenticated connection", async () => {
		const {
			ada,
			engineering,
			partnerAda,
			partnerEngineering,
			searchGroups,
			searchUsers,
		} = await createSearchFixture();
		const partnerUsers = await searchUsers(
			{
				schemas: [SCIM_SEARCH_REQUEST_SCHEMA],
				filter:
					'userName eq "ada.login@example.com" or emails.value eq "ada.alias@example.com"',
			},
			{ token: "partner-scim-token" },
		);
		const partnerGroups = await searchGroups(
			{
				schemas: [SCIM_SEARCH_REQUEST_SCHEMA],
				filter: 'displayName eq "Engineering"',
			},
			{ token: "partner-scim-token" },
		);

		expect(listResourceIds(partnerUsers.body)).toEqual([partnerAda.id]);
		expect(listResourceIds(partnerUsers.body)).not.toContain(ada.id);
		expect(listResourceIds(partnerGroups.body)).toEqual([
			partnerEngineering.id,
		]);
		expect(listResourceIds(partnerGroups.body)).not.toContain(engineering.id);
	});

	it("ignores sortBy and sortOrder like GET list", async () => {
		const { ada, grace, searchUsers } = await createSearchFixture();
		const sortBy = await searchUsers({
			schemas: [SCIM_SEARCH_REQUEST_SCHEMA],
			sortBy: "userName",
		});
		const sortOrder = await searchUsers({
			schemas: [SCIM_SEARCH_REQUEST_SCHEMA],
			sortOrder: "ascending",
		});

		expect(sortBy.status).toBe(200);
		expect(sortOrder.status).toBe(200);
		expect(listResourceIds(sortBy.body)).toEqual(
			expect.arrayContaining([ada.id, grace.id]),
		);
		expect(listResourceIds(sortBy.body)).toHaveLength(2);
		expect(listResourceIds(sortOrder.body)).toEqual(
			listResourceIds(sortBy.body),
		);
	});

	it("rejects a missing or non-SearchRequest schema with invalidValue", async () => {
		const { auth, searchUsers } = await createSearchFixture();
		const missing = await searchUsers({
			filter: 'userName eq "ada.login@example.com"',
		});
		const userSchema = await searchUsers({
			schemas: [SCIM_USER_SCHEMA],
			userName: "intruder@example.com",
		});
		const listed = await auth.api.listSCIMUsers({
			headers: { authorization: "Bearer test-scim-token" },
		});

		expect(missing).toMatchObject({
			status: 400,
			body: { scimType: "invalidValue" },
		});
		expect(userSchema).toMatchObject({
			status: 400,
			body: { scimType: "invalidValue" },
		});
		expect(listed.totalResults).toBe(2);
	});

	it("treats search as a read: read-only tokens succeed and write-only tokens fail", async () => {
		const { auth, searchUsers } = await createSearchFixture();
		const readSearch = await searchUsers(
			{ schemas: [SCIM_SEARCH_REQUEST_SCHEMA] },
			{ token: "read-scim-token" },
		);
		const readCreate = await auth.handler(
			new Request(SCIM_USERS_URL, {
				method: "POST",
				headers: {
					accept: SCIM_MEDIA_TYPE,
					authorization: "Bearer read-scim-token",
					"content-type": SCIM_MEDIA_TYPE,
				},
				body: JSON.stringify({
					schemas: [SCIM_USER_SCHEMA],
					userName: "read-only@example.com",
				}),
			}),
		);
		const writeSearch = await searchUsers(
			{ schemas: [SCIM_SEARCH_REQUEST_SCHEMA] },
			{ token: "write-scim-token" },
		);

		expect(readSearch.status).toBe(200);
		expect(readCreate.status).toBe(403);
		expect(writeSearch.status).toBe(403);
	});

	it("canonicalizes SearchRequest member names on HTTP requests", async () => {
		const { ada, searchUsers } = await createSearchFixture();
		const searched = await searchUsers({
			schemas: [SCIM_SEARCH_REQUEST_SCHEMA],
			Filter: 'userName eq "ada.login@example.com"',
			StartIndex: 1,
			Count: 100,
		});

		expect(searched.status).toBe(200);
		expect(listResourceIds(searched.body)).toEqual([ada.id]);
	});

	it("rejects SearchRequest members that differ only by letter case", async () => {
		const { searchUsers } = await createSearchFixture();
		const searched = await searchUsers({
			schemas: [SCIM_SEARCH_REQUEST_SCHEMA],
			filter: 'userName eq "ada.login@example.com"',
			Filter: 'userName eq "grace.login@example.com"',
		});

		expect(searched).toMatchObject({
			status: 400,
			body: { scimType: "invalidSyntax" },
		});
	});

	it("rejects string-valued startIndex in the SearchRequest body", async () => {
		const { searchUsers } = await createSearchFixture();
		const searched = await searchUsers({
			schemas: [SCIM_SEARCH_REQUEST_SCHEMA],
			startIndex: "1",
		});

		expect(searched).toMatchObject({
			status: 400,
			body: { scimType: "invalidValue" },
		});
	});

	it("does not apply a GET filter query string when the SearchRequest has no filter", async () => {
		const { ada, grace, searchUsers } = await createSearchFixture();
		const searched = await searchUsers(
			{ schemas: [SCIM_SEARCH_REQUEST_SCHEMA] },
			{
				query: {
					filter: 'userName eq "ada.login@example.com"',
				},
			},
		);

		expect(searched.status).toBe(200);
		expect(listResourceIds(searched.body)).toEqual(
			expect.arrayContaining([ada.id, grace.id]),
		);
		expect(listResourceIds(searched.body)).toHaveLength(2);
	});
});
