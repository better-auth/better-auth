import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
	SCIMCanonicalManager,
	SCIMCanonicalUser,
	SCIMEnterpriseUser,
} from ".";
import { scim } from ".";

const BASE_URL = "http://localhost:3000";
const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_ENTERPRISE_USER_SCHEMA =
	"urn:ietf:params:scim:schemas:extension:enterprise:2.0:User";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_MICROSOFT_GRAPH_USER_SCHEMA =
	"urn:ietf:params:scim:schemas:extension:Microsoft:Entra:2.0:User";
const SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA =
	"http://schemas.microsoft.com/2006/11/ResourceManagement/ADSCIM/2.0/Group";
const SCIM_MEDIA_TYPE = "application/scim+json";

interface PersistedSCIMUser {
	id: string;
	connectionId: string;
	userId: string;
	externalId?: string;
	formattedName: string;
	givenName?: string | null;
	familyName?: string | null;
	serializedEmails: string;
	serializedAttributes: string;
}

interface SCIMUserResponse {
	schemas: string[];
	id: string;
	externalId?: string;
	userName: string;
	displayName: string;
	name: {
		formatted: string;
		givenName?: string;
		familyName?: string;
		middleName?: string;
		honorificPrefix?: string;
		honorificSuffix?: string;
	};
	title?: string;
	userType?: string;
	preferredLanguage?: string;
	locale?: string;
	timezone?: string;
	phoneNumbers?: Array<{
		value: string;
		type?: string;
		primary?: boolean;
	}>;
	addresses?: Array<{
		formatted?: string;
		streetAddress?: string;
		locality?: string;
		region?: string;
		postalCode?: string;
		country?: string;
		type?: string;
		primary?: boolean;
	}>;
	roles?: Array<{
		value: string;
		display?: string;
		type?: string;
		primary?: boolean;
	}>;
	entitlements?: Array<{
		value: string;
		display?: string;
		type?: string;
		primary?: boolean;
	}>;
	[SCIM_ENTERPRISE_USER_SCHEMA]?: SCIMEnterpriseUser;
}

function createEnterpriseFixture() {
	const data = {
		user: [] as User[],
		session: [] as { id: string }[],
		verification: [] as { id: string }[],
		account: [] as { id: string }[],
		scimConnectionBinding: [] as { id: string }[],
		scimIdentityTombstone: [] as { id: string }[],
		scimSubject: [] as { id: string; userId: string }[],
		scimUser: [] as PersistedSCIMUser[],
		scimGroup: [] as { id: string }[],
		scimGroupMember: [] as { id: string }[],
		scimProjectionGrant: [] as { id: string }[],
	};
	const resolvedUsers: SCIMCanonicalUser[] = [];
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
								id: "workforce-token",
								token: "workforce-token",
							},
						],
					},
					{
						id: "partners",
						credentials: [
							{
								type: "bearer",
								id: "partners-token",
								token: "partners-token",
							},
						],
					},
				],
				identity: {
					resolveUser({ resource }) {
						resolvedUsers.push(resource);
						return { action: "create" };
					},
				},
			}),
		],
	});
	return { auth, data, resolvedUsers };
}

function createSCIMRequest(
	path: string,
	options: {
		method?: "GET" | "PATCH" | "POST" | "PUT";
		token?: "partners-token" | "workforce-token";
		body?: unknown;
	} = {},
): Request {
	const headers = new Headers({ accept: SCIM_MEDIA_TYPE });
	if (options.token) {
		headers.set("authorization", `Bearer ${options.token}`);
	}
	if (options.body !== undefined) {
		headers.set("content-type", SCIM_MEDIA_TYPE);
	}
	return new Request(`${BASE_URL}/api/auth${path}`, {
		method: options.method ?? "GET",
		headers,
		...(options.body === undefined
			? {}
			: { body: JSON.stringify(options.body) }),
	});
}

async function readJSON<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

describe("SCIM classic Enterprise User provisioning", () => {
	it("discovers, persists, replaces, and tenant-scopes a Microsoft-style User through HTTP", async () => {
		const { auth, data, resolvedUsers } = createEnterpriseFixture();
		const [schemasResponse, enterpriseSchemaResponse, resourceTypeResponse] =
			await Promise.all([
				auth.handler(createSCIMRequest("/scim/v2/Schemas")),
				auth.handler(
					createSCIMRequest(
						`/scim/v2/Schemas/${encodeURIComponent(SCIM_ENTERPRISE_USER_SCHEMA)}`,
					),
				),
				auth.handler(createSCIMRequest("/scim/v2/ResourceTypes/User")),
			]);
		expect(schemasResponse.status).toBe(200);
		expect(enterpriseSchemaResponse.status).toBe(200);
		expect(resourceTypeResponse.status).toBe(200);
		const schemas = await readJSON<{
			totalResults: number;
			Resources: Array<{ id: string }>;
		}>(schemasResponse);
		expect(schemas).toMatchObject({ totalResults: 3 });
		expect(schemas.Resources.map((schema) => schema.id)).toContain(
			SCIM_ENTERPRISE_USER_SCHEMA,
		);
		expect(await readJSON(enterpriseSchemaResponse)).toMatchObject({
			id: SCIM_ENTERPRISE_USER_SCHEMA,
			attributes: expect.arrayContaining([
				expect.objectContaining({ name: "employeeNumber" }),
				expect.objectContaining({ name: "manager" }),
			]),
		});
		expect(await readJSON(resourceTypeResponse)).toMatchObject({
			id: "User",
			schema: SCIM_USER_SCHEMA,
			schemaExtensions: [
				{ schema: SCIM_ENTERPRISE_USER_SCHEMA, required: false },
			],
		});

		const enterpriseBody = {
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
			userName: "bjensen@example.com",
			externalId: "701984",
			name: {
				formatted: "Ms. Barbara Jane Jensen III",
				familyName: "Jensen",
				givenName: "Barbara",
				middleName: "Jane",
				honorificPrefix: "Ms.",
				honorificSuffix: "III",
			},
			displayName: "Babs Jensen",
			title: "Tour Guide",
			userType: "Employee",
			preferredLanguage: "en-US",
			locale: "en-US",
			timezone: "America/Los_Angeles",
			active: true,
			emails: [{ value: "bjensen@example.com", type: "work", primary: true }],
			phoneNumbers: [{ value: "+1-555-555-8377", type: "work", primary: true }],
			addresses: [
				{
					formatted: "100 Universal City Plaza\nHollywood, CA 91608 USA",
					streetAddress: "100 Universal City Plaza",
					locality: "Hollywood",
					region: "CA",
					postalCode: "91608",
					country: "USA",
					type: "work",
					primary: true,
				},
			],
			roles: [{ value: "Tour Guide", primary: true }],
			entitlements: [{ value: "Universal Studios", primary: true }],
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				employeeNumber: "701984",
				costCenter: "4130",
				organization: "Universal Studios",
				division: "Theme Park",
				department: "Tour Operations",
				manager: [
					{
						value: "26118915",
						$ref: `${BASE_URL}/api/auth/scim/v2/Users/26118915`,
						displayName: "John Smith",
					},
				],
			},
		};
		const createResponse = await auth.handler(
			createSCIMRequest("/scim/v2/Users", {
				method: "POST",
				token: "workforce-token",
				body: enterpriseBody,
			}),
		);
		expect(createResponse.status).toBe(201);
		const created = await readJSON<SCIMUserResponse>(createResponse);
		expect(created).toMatchObject({
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
			externalId: "701984",
			userName: "bjensen@example.com",
			name: enterpriseBody.name,
			title: "Tour Guide",
			userType: "Employee",
			preferredLanguage: "en-US",
			locale: "en-US",
			timezone: "America/Los_Angeles",
			phoneNumbers: enterpriseBody.phoneNumbers,
			addresses: enterpriseBody.addresses,
			roles: enterpriseBody.roles,
			entitlements: enterpriseBody.entitlements,
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				employeeNumber: "701984",
				costCenter: "4130",
				organization: "Universal Studios",
				division: "Theme Park",
				department: "Tour Operations",
				manager: {
					value: "26118915",
					$ref: `${BASE_URL}/api/auth/scim/v2/Users/26118915`,
				},
			},
		});
		expect(created[SCIM_ENTERPRISE_USER_SCHEMA]?.manager).not.toHaveProperty(
			"displayName",
		);
		expect(resolvedUsers).toHaveLength(1);
		expect(resolvedUsers[0]).toMatchObject({
			title: "Tour Guide",
			phoneNumbers: enterpriseBody.phoneNumbers,
			enterprise: {
				employeeNumber: "701984",
				manager: { value: "26118915" },
			},
		});

		const getResponse = await auth.handler(
			createSCIMRequest(`/scim/v2/Users/${encodeURIComponent(created.id)}`, {
				token: "workforce-token",
			}),
		);
		expect(getResponse.status).toBe(200);
		expect(await readJSON(getResponse)).toMatchObject(created);

		const entireExtensionResponse = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users/${encodeURIComponent(created.id)}?attributes=${encodeURIComponent(
					SCIM_ENTERPRISE_USER_SCHEMA,
				)}`,
				{ token: "workforce-token" },
			),
		);
		expect(entireExtensionResponse.status).toBe(200);
		const entireExtension = await readJSON<Record<string, unknown>>(
			entireExtensionResponse,
		);
		expect(Object.keys(entireExtension).sort()).toEqual(
			[SCIM_ENTERPRISE_USER_SCHEMA, "id", "schemas"].sort(),
		);
		expect(entireExtension[SCIM_ENTERPRISE_USER_SCHEMA]).toMatchObject({
			department: "Tour Operations",
			manager: {
				value: "26118915",
				$ref: `${BASE_URL}/api/auth/scim/v2/Users/26118915`,
			},
		});

		const departmentResponse = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users/${encodeURIComponent(created.id)}?attributes=${encodeURIComponent(
					`${SCIM_ENTERPRISE_USER_SCHEMA.toUpperCase()}:department`,
				)}`,
				{ token: "workforce-token" },
			),
		);
		expect(departmentResponse.status).toBe(200);
		expect(await readJSON(departmentResponse)).toEqual({
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
			id: created.id,
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				department: "Tour Operations",
			},
		});

		const managerListResponse = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users?attributes=${encodeURIComponent(
					`${SCIM_ENTERPRISE_USER_SCHEMA}:manager.value`,
				)}`,
				{ token: "workforce-token" },
			),
		);
		expect(managerListResponse.status).toBe(200);
		expect(await readJSON(managerListResponse)).toMatchObject({
			totalResults: 1,
			Resources: [
				{
					schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
					id: created.id,
					[SCIM_ENTERPRISE_USER_SCHEMA]: {
						manager: { value: "26118915" },
					},
				},
			],
		});

		const excludedManagerValueResponse = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users/${encodeURIComponent(
					created.id,
				)}?excludedAttributes=${encodeURIComponent(
					`${SCIM_ENTERPRISE_USER_SCHEMA}:manager.value`,
				)}`,
				{ token: "workforce-token" },
			),
		);
		expect(excludedManagerValueResponse.status).toBe(200);
		const excludedManagerValue = await readJSON<SCIMUserResponse>(
			excludedManagerValueResponse,
		);
		expect(excludedManagerValue[SCIM_ENTERPRISE_USER_SCHEMA]?.manager).toEqual({
			$ref: `${BASE_URL}/api/auth/scim/v2/Users/26118915`,
		});

		const workforceRow = data.scimUser.find(
			(user) => user.connectionId === "workforce",
		);
		if (!workforceRow) throw new Error("Expected workforce SCIM User");
		expect(JSON.parse(workforceRow.serializedAttributes)).toMatchObject({
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
			name: enterpriseBody.name,
			phoneNumbers: enterpriseBody.phoneNumbers,
			enterprise: {
				employeeNumber: "701984",
				manager: { value: "26118915" },
			},
		});
		expect(workforceRow).toMatchObject({
			formattedName: "Ms. Barbara Jane Jensen III",
			givenName: "Barbara",
			familyName: "Jensen",
		});
		expect(JSON.parse(workforceRow.serializedEmails)).toEqual(
			enterpriseBody.emails,
		);
		expect(data.account).toEqual([]);
		expect(data.user).toHaveLength(1);
		expect(data.user[0]).toMatchObject({
			id: workforceRow.userId,
			email: "bjensen@example.com",
			name: "Babs Jensen",
		});
		expect(JSON.stringify(data.user)).not.toContain("employeeNumber");
		expect(JSON.stringify(data.account)).not.toContain("employeeNumber");

		workforceRow.formattedName = "corrupt mirror";
		workforceRow.givenName = "corrupt mirror";
		workforceRow.familyName = null;
		workforceRow.serializedEmails = "[]";
		const canonicalAfterMirrorCorruption = await auth.handler(
			createSCIMRequest(`/scim/v2/Users/${encodeURIComponent(created.id)}`, {
				token: "workforce-token",
			}),
		);
		expect(canonicalAfterMirrorCorruption.status).toBe(200);
		expect(await readJSON(canonicalAfterMirrorCorruption)).toMatchObject({
			name: enterpriseBody.name,
			emails: enterpriseBody.emails,
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				department: "Tour Operations",
			},
		});

		const patchResponse = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users/${encodeURIComponent(
					created.id,
				)}?attributes=${encodeURIComponent(
					`${SCIM_ENTERPRISE_USER_SCHEMA}:department`,
				)}`,
				{
					method: "PATCH",
					token: "workforce-token",
					body: {
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [
							{
								op: "replace",
								path: "displayName",
								value: "Barbara J. Jensen",
							},
						],
					},
				},
			),
		);
		const patchBody = await readJSON(patchResponse);
		expect(patchResponse.status, JSON.stringify(patchBody)).toBe(200);
		expect(patchBody).toEqual({
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
			id: created.id,
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				department: "Tour Operations",
			},
		});
		const patchedWorkforceRow = data.scimUser.find(
			(user) => user.id === workforceRow.id,
		);
		if (!patchedWorkforceRow) {
			throw new Error("Expected patched workforce SCIM User");
		}
		expect(patchedWorkforceRow).toMatchObject({
			formattedName: "Ms. Barbara Jane Jensen III",
			givenName: "Barbara",
			familyName: "Jensen",
		});
		expect(JSON.parse(patchedWorkforceRow.serializedEmails)).toEqual(
			enterpriseBody.emails,
		);
		expect(JSON.parse(patchedWorkforceRow.serializedAttributes)).toMatchObject({
			enterprise: {
				department: "Tour Operations",
				manager: {
					value: "26118915",
					$ref: `${BASE_URL}/api/auth/scim/v2/Users/26118915`,
				},
			},
		});

		const wrongTenantResponse = await auth.handler(
			createSCIMRequest(`/scim/v2/Users/${encodeURIComponent(created.id)}`, {
				token: "partners-token",
			}),
		);
		expect(wrongTenantResponse.status).toBe(404);

		const partnerResponse = await auth.handler(
			createSCIMRequest("/scim/v2/Users", {
				method: "POST",
				token: "partners-token",
				body: {
					schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
					userName: "partner-bjensen@example.com",
					externalId: "701984",
				},
			}),
		);
		expect(partnerResponse.status).toBe(201);
		const partner = await readJSON<SCIMUserResponse>(partnerResponse);
		expect(partner).toMatchObject({
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
			externalId: "701984",
		});
		expect(partner).not.toHaveProperty(SCIM_ENTERPRISE_USER_SCHEMA);
		const partnerGetResponse = await auth.handler(
			createSCIMRequest(`/scim/v2/Users/${encodeURIComponent(partner.id)}`, {
				token: "partners-token",
			}),
		);
		expect(partnerGetResponse.status).toBe(200);
		const declaredOnlyPartner =
			await readJSON<SCIMUserResponse>(partnerGetResponse);
		expect(declaredOnlyPartner.schemas).toEqual([
			SCIM_USER_SCHEMA,
			SCIM_ENTERPRISE_USER_SCHEMA,
		]);
		expect(declaredOnlyPartner).not.toHaveProperty(SCIM_ENTERPRISE_USER_SCHEMA);
		expect(data.scimUser).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					connectionId: "workforce",
					externalId: "701984",
				}),
				expect.objectContaining({
					connectionId: "partners",
					externalId: "701984",
				}),
			]),
		);

		const replaceResponse = await auth.handler(
			createSCIMRequest(`/scim/v2/Users/${encodeURIComponent(created.id)}`, {
				method: "PUT",
				token: "workforce-token",
				body: {
					schemas: [SCIM_USER_SCHEMA],
					userName: "bjensen@example.com",
					externalId: "701984",
					displayName: "Barbara Jensen",
					name: {
						formatted: "Barbara Jensen",
						givenName: "Barbara",
						familyName: "Jensen",
					},
					emails: [
						{
							value: "bjensen@example.com",
							type: "work",
							primary: true,
						},
					],
					active: true,
				},
			}),
		);
		expect(replaceResponse.status).toBe(200);
		const replaced = await readJSON<SCIMUserResponse>(replaceResponse);
		expect(replaced).toMatchObject({
			schemas: [SCIM_USER_SCHEMA],
			displayName: "Barbara Jensen",
			name: {
				formatted: "Barbara Jensen",
				givenName: "Barbara",
				familyName: "Jensen",
			},
		});
		expect(replaced).not.toHaveProperty(SCIM_ENTERPRISE_USER_SCHEMA);
		expect(replaced).not.toHaveProperty("title");
		expect(replaced).not.toHaveProperty("phoneNumbers");
		const replacedRow = data.scimUser.find(
			(user) => user.id === workforceRow.id,
		);
		if (!replacedRow) throw new Error("Expected replaced workforce SCIM User");
		expect(JSON.parse(replacedRow.serializedAttributes)).toEqual({
			schemas: [SCIM_USER_SCHEMA],
			name: {
				formatted: "Barbara Jensen",
				givenName: "Barbara",
				familyName: "Jensen",
			},
			emails: [
				{
					value: "bjensen@example.com",
					type: "work",
					primary: true,
				},
			],
		});
	});

	it("accepts an RFC manager reference while discarding client readOnly displayName data", async () => {
		const { auth, data, resolvedUsers } = createEnterpriseFixture();
		const response = await auth.handler(
			createSCIMRequest("/scim/v2/Users", {
				method: "POST",
				token: "workforce-token",
				body: {
					schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
					userName: "reference-only-manager@example.com",
					[SCIM_ENTERPRISE_USER_SCHEMA]: {
						manager: {
							$ref: `${BASE_URL}/api/auth/scim/v2/Users/manager`,
							displayName: "Client supplied display value",
						},
					},
				},
			}),
		);

		expect(response.status).toBe(201);
		const created = await readJSON<SCIMUserResponse>(response);
		expect(created[SCIM_ENTERPRISE_USER_SCHEMA]?.manager).toEqual({
			$ref: `${BASE_URL}/api/auth/scim/v2/Users/manager`,
		});
		expect(resolvedUsers[0]?.enterprise?.manager).toEqual({
			$ref: `${BASE_URL}/api/auth/scim/v2/Users/manager`,
		});
		expect(
			JSON.parse(data.scimUser[0]?.serializedAttributes ?? "{}"),
		).toMatchObject({
			enterprise: {
				manager: {
					$ref: `${BASE_URL}/api/auth/scim/v2/Users/manager`,
				},
			},
		});
		expect(data.scimUser[0]?.serializedAttributes).not.toContain("displayName");
	});

	it("patches core and Enterprise User attributes through Entra and RFC path shapes", async () => {
		const { auth, data } = createEnterpriseFixture();
		const managerResponse = await auth.handler(
			createSCIMRequest("/scim/v2/Users", {
				method: "POST",
				token: "workforce-token",
				body: {
					schemas: [SCIM_USER_SCHEMA],
					userName: "manager@example.com",
					displayName: "Priya Shah",
				},
			}),
		);
		expect(managerResponse.status).toBe(201);
		const manager = await readJSON<SCIMUserResponse>(managerResponse);

		const reportResponse = await auth.handler(
			createSCIMRequest("/scim/v2/Users", {
				method: "POST",
				token: "workforce-token",
				body: {
					schemas: [SCIM_USER_SCHEMA],
					userName: "report@example.com",
					displayName: "Jordan Lee",
					name: {
						formatted: "Jordan Quinn Lee",
						givenName: "Jordan",
						middleName: "Quinn",
						familyName: "Lee",
					},
					title: "Analyst",
					phoneNumbers: [{ value: "+1-555-0100", type: "work", primary: true }],
				},
			}),
		);
		expect(reportResponse.status).toBe(201);
		const report = await readJSON<SCIMUserResponse>(reportResponse);

		const patchResponse = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users/${encodeURIComponent(
					report.id,
				)}?attributes=${encodeURIComponent(
					[
						"title",
						"name",
						"phoneNumbers",
						"addresses",
						`${SCIM_ENTERPRISE_USER_SCHEMA}:department`,
						`${SCIM_ENTERPRISE_USER_SCHEMA}:costCenter`,
						`${SCIM_ENTERPRISE_USER_SCHEMA}:division`,
						`${SCIM_ENTERPRISE_USER_SCHEMA}:manager`,
					].join(","),
				)}`,
				{
					method: "PATCH",
					token: "workforce-token",
					body: {
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [
							{
								op: "Replace",
								path: `${SCIM_ENTERPRISE_USER_SCHEMA}:manager`,
								value: manager.id,
							},
							{
								op: "Replace",
								value: {
									title: "Senior Analyst",
									[`${SCIM_ENTERPRISE_USER_SCHEMA}:department`]: "Finance",
								},
							},
							{
								op: "Add",
								path: "addresses",
								value: [
									{
										streetAddress: "1 Finance Way",
										locality: "Seattle",
										region: "WA",
										postalCode: "98101",
										country: "US",
										type: "work",
										primary: true,
									},
								],
							},
							{
								op: "Replace",
								path: 'phoneNumbers[type eq "work"].value',
								value: "+1-555-0199",
							},
							{
								op: "Add",
								path: "phoneNumbers",
								value: [
									{
										value: "+1-555-0177",
										type: "mobile",
										primary: true,
									},
								],
							},
							{
								op: "Replace",
								path: "name",
								value: {
									givenName: "Jordana",
								},
							},
							{
								op: "Replace",
								path: `${SCIM_ENTERPRISE_USER_SCHEMA}:costCenter`,
								value: "CC-204",
							},
							{
								op: "Replace",
								path: SCIM_ENTERPRISE_USER_SCHEMA,
								value: {
									division: "Financial Planning",
								},
							},
							{
								op: "Add",
								path: "manager",
								value: [
									{
										value: manager.id,
										$ref: `${BASE_URL}/api/auth/scim/v2/Users/${manager.id}`,
										displayName: "Client supplied manager name",
									},
								],
							},
						],
					},
				},
			),
		);

		const patchedReport = await readJSON(patchResponse);
		expect(patchResponse.status, JSON.stringify(patchedReport)).toBe(200);
		expect(patchedReport).toEqual({
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
			id: report.id,
			title: "Senior Analyst",
			name: {
				formatted: "Jordan Quinn Lee",
				givenName: "Jordana",
				middleName: "Quinn",
				familyName: "Lee",
			},
			phoneNumbers: [
				{ value: "+1-555-0199", type: "work", primary: false },
				{ value: "+1-555-0177", type: "mobile", primary: true },
			],
			addresses: [
				{
					streetAddress: "1 Finance Way",
					locality: "Seattle",
					region: "WA",
					postalCode: "98101",
					country: "US",
					type: "work",
					primary: true,
				},
			],
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				department: "Finance",
				costCenter: "CC-204",
				division: "Financial Planning",
				manager: {
					value: manager.id,
					$ref: `${BASE_URL}/api/auth/scim/v2/Users/${manager.id}`,
				},
			},
		});

		const persisted = data.scimUser.find((user) => user.id === report.id);
		if (!persisted) throw new Error("Expected patched report");
		expect(JSON.parse(persisted.serializedAttributes)).toMatchObject({
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
			title: "Senior Analyst",
			phoneNumbers: [
				{ value: "+1-555-0199", type: "work", primary: false },
				{ value: "+1-555-0177", type: "mobile", primary: true },
			],
			addresses: [
				{
					streetAddress: "1 Finance Way",
					locality: "Seattle",
					type: "work",
				},
			],
			enterprise: {
				department: "Finance",
				costCenter: "CC-204",
				division: "Financial Planning",
				manager: {
					value: manager.id,
					$ref: `${BASE_URL}/api/auth/scim/v2/Users/${manager.id}`,
				},
			},
			name: {
				formatted: "Jordan Quinn Lee",
				givenName: "Jordana",
				middleName: "Quinn",
				familyName: "Lee",
			},
		});
		expect(persisted.serializedAttributes).not.toContain("displayName");

		const managerValueResponse = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users/${encodeURIComponent(
					report.id,
				)}?attributes=${encodeURIComponent(
					`${SCIM_ENTERPRISE_USER_SCHEMA}:manager`,
				)}`,
				{
					method: "PATCH",
					token: "workforce-token",
					body: {
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [
							{
								op: "Replace",
								path: "manager.value",
								value: manager.id,
							},
							{
								op: "Replace",
								path: "manager.$ref",
								value: `${BASE_URL}/api/auth/scim/v2/Users/${manager.id}`,
							},
						],
					},
				},
			),
		);
		expect(managerValueResponse.status).toBe(200);
		expect(await readJSON(managerValueResponse)).toEqual({
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
			id: report.id,
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				manager: {
					value: manager.id,
					$ref: `${BASE_URL}/api/auth/scim/v2/Users/${manager.id}`,
				},
			},
		});

		const readOnlyManagerResponse = await auth.handler(
			createSCIMRequest(`/scim/v2/Users/${encodeURIComponent(report.id)}`, {
				method: "PATCH",
				token: "workforce-token",
				body: {
					schemas: [SCIM_PATCH_SCHEMA],
					Operations: [
						{
							op: "Replace",
							path: "manager.displayName",
							value: "Must not persist",
						},
					],
				},
			}),
		);
		expect(readOnlyManagerResponse.status).toBe(400);
		expect(await readJSON(readOnlyManagerResponse)).toMatchObject({
			scimType: "mutability",
		});
		expect(persisted.serializedAttributes).not.toContain("Must not persist");

		const removeResponse = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users/${encodeURIComponent(
					report.id,
				)}?attributes=${encodeURIComponent(
					[
						"title",
						"phoneNumbers",
						"addresses",
						SCIM_ENTERPRISE_USER_SCHEMA,
					].join(","),
				)}`,
				{
					method: "PATCH",
					token: "workforce-token",
					body: {
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [
							{ op: "Remove", path: "title" },
							{
								op: "Remove",
								path: 'addresses[type eq "work"]',
							},
							{
								op: "Remove",
								path: `${SCIM_ENTERPRISE_USER_SCHEMA}:department`,
							},
							{ op: "Remove", path: "manager" },
						],
					},
				},
			),
		);
		expect(removeResponse.status).toBe(200);
		expect(await readJSON(removeResponse)).toEqual({
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
			id: report.id,
			phoneNumbers: [
				{ value: "+1-555-0199", type: "work", primary: false },
				{ value: "+1-555-0177", type: "mobile", primary: true },
			],
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				costCenter: "CC-204",
				division: "Financial Planning",
			},
		});

		const missingManagerValueResponse = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users/${encodeURIComponent(
					report.id,
				)}?attributes=${encodeURIComponent(
					`${SCIM_ENTERPRISE_USER_SCHEMA}:manager`,
				)}`,
				{
					method: "PATCH",
					token: "workforce-token",
					body: {
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [
							{
								op: "Replace",
								path: "manager.value",
								value: manager.id,
							},
						],
					},
				},
			),
		);
		expect(missingManagerValueResponse.status).toBe(200);
		expect(await readJSON(missingManagerValueResponse)).toEqual({
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
			id: report.id,
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				manager: { value: manager.id },
			},
		});

		const missingUnfilteredSubattributeResponse = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users/${encodeURIComponent(
					report.id,
				)}?attributes=phoneNumbers`,
				{
					method: "PATCH",
					token: "workforce-token",
					body: {
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [
							{ op: "Remove", path: "phoneNumbers" },
							{
								op: "Replace",
								path: "phoneNumbers.value",
								value: "+1-555-0188",
							},
						],
					},
				},
			),
		);
		expect(missingUnfilteredSubattributeResponse.status).toBe(200);
		expect(await readJSON(missingUnfilteredSubattributeResponse)).toEqual({
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
			id: report.id,
			phoneNumbers: [{ value: "+1-555-0188" }],
		});

		const beforeRejectedPatch =
			data.scimUser.find((user) => user.id === report.id)
				?.serializedAttributes ?? "";
		const rejectedResponse = await auth.handler(
			createSCIMRequest(`/scim/v2/Users/${encodeURIComponent(report.id)}`, {
				method: "PATCH",
				token: "workforce-token",
				body: {
					schemas: [SCIM_PATCH_SCHEMA],
					Operations: [
						{
							op: "Replace",
							path: "title",
							value: "Must not persist",
						},
						{
							op: "Replace",
							path: "urn:ietf:params:scim:schemas:extension:Microsoft:Entra:2.0:User:department",
							value: "Unsupported",
						},
					],
				},
			}),
		);
		expect(rejectedResponse.status).toBe(400);
		expect(await readJSON(rejectedResponse)).toMatchObject({
			scimType: "invalidPath",
		});
		expect(
			data.scimUser.find((user) => user.id === report.id)?.serializedAttributes,
		).toBe(beforeRejectedPatch);
	});

	/**
	 * @see https://learn.microsoft.com/en-us/entra/identity/app-provisioning/use-scim-to-provision-users-and-groups#update-user-multi-valued-properties
	 */
	it("applies Microsoft Entra's full multi-op Replace Attributes PATCH shape", async () => {
		const { auth } = createEnterpriseFixture();
		const createResponse = await auth.handler(
			createSCIMRequest("/scim/v2/Users", {
				method: "POST",
				token: "workforce-token",
				body: {
					schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
					userName: "replace-attributes@example.com",
					displayName: "Replace Attributes",
					name: { givenName: "Replace", familyName: "Attributes" },
					emails: [
						{
							value: "replace-attributes@example.com",
							type: "work",
							primary: true,
						},
					],
					phoneNumbers: [{ value: "+1-555-0100", type: "work", primary: true }],
					addresses: [
						{
							formatted: "1 Old Way",
							streetAddress: "1 Old Way",
							locality: "Redmond",
							region: "WA",
							postalCode: "98052",
							country: "US",
							type: "work",
							primary: true,
						},
					],
					roles: [{ value: "engineer", display: "Engineer", primary: true }],
					[SCIM_ENTERPRISE_USER_SCHEMA]: { employeeNumber: "1" },
				},
			}),
		);
		expect(createResponse.status).toBe(201);
		const user = await readJSON<SCIMUserResponse>(createResponse);

		const patchResponse = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users/${encodeURIComponent(
					user.id,
				)}?attributes=${encodeURIComponent(
					[
						"displayName",
						"title",
						"userType",
						"preferredLanguage",
						"locale",
						"timezone",
						"emails",
						"phoneNumbers",
						"addresses",
						"roles",
						`${SCIM_ENTERPRISE_USER_SCHEMA}:employeeNumber`,
					].join(","),
				)}`,
				{
					method: "PATCH",
					token: "workforce-token",
					body: {
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [
							{
								op: "Replace",
								path: "emails[primary eq true].value",
								value: "replaced@example.com",
							},
							{
								op: "Replace",
								path: "phoneNumbers[primary eq true].value",
								value: "+1-555-0199",
							},
							{
								op: "Replace",
								path: "addresses[primary eq true].formatted",
								value: "2 New Way",
							},
							{
								op: "Replace",
								path: "addresses[primary eq true].streetAddress",
								value: "2 New Way",
							},
							{
								op: "Replace",
								path: "addresses[primary eq true].locality",
								value: "Bellevue",
							},
							{
								op: "Replace",
								path: "addresses[primary eq true].region",
								value: "WA",
							},
							{
								op: "Replace",
								path: "addresses[primary eq true].postalCode",
								value: "98004",
							},
							{
								op: "Replace",
								path: "addresses[primary eq true].country",
								value: "US",
							},
							{
								op: "Replace",
								path: "roles[primary eq true].value",
								value: "senior-engineer",
							},
							{
								op: "Replace",
								path: "roles[primary eq true].display",
								value: "Senior Engineer",
							},
							{
								op: "Replace",
								path: "displayName",
								value: ["Replaced Attributes"],
							},
							{ op: "Replace", path: "title", value: ["Senior Engineer"] },
							{ op: "Replace", path: "userType", value: ["Employee"] },
							{ op: "Replace", path: "preferredLanguage", value: ["en-US"] },
							{ op: "Replace", path: "locale", value: ["en-US"] },
							{
								op: "Replace",
								path: "timezone",
								value: ["America/Los_Angeles"],
							},
							{
								op: "Replace",
								path: `${SCIM_ENTERPRISE_USER_SCHEMA}:employeeNumber`,
								value: ["99999"],
							},
						],
					},
				},
			),
		);
		const patched = await readJSON<SCIMUserResponse>(patchResponse);
		expect(patchResponse.status, JSON.stringify(patched)).toBe(200);
		expect(patched).toMatchObject({
			displayName: "Replaced Attributes",
			title: "Senior Engineer",
			userType: "Employee",
			preferredLanguage: "en-US",
			locale: "en-US",
			timezone: "America/Los_Angeles",
			emails: [{ value: "replaced@example.com", primary: true }],
			phoneNumbers: [{ value: "+1-555-0199", primary: true }],
			addresses: [
				{
					formatted: "2 New Way",
					streetAddress: "2 New Way",
					locality: "Bellevue",
					region: "WA",
					postalCode: "98004",
					country: "US",
					primary: true,
				},
			],
			roles: [
				{ value: "senior-engineer", display: "Senior Engineer", primary: true },
			],
			[SCIM_ENTERPRISE_USER_SCHEMA]: { employeeNumber: "99999" },
		});
	});

	/**
	 * Mirrors the exact wire shape captured from Microsoft's SCIM Validator: a
	 * multi-op PATCH combining `[primary eq true]` filtered replaces with a
	 * single pathless replace whose value uses flat, dot- and schema-qualified
	 * keys (`"name.formatted"`, `"urn:...:User:employeeNumber"`) rather than
	 * nested objects, followed by a filtered-list fetch (not a direct GET by
	 * ID) to verify every attribute round-trips.
	 * @see https://learn.microsoft.com/en-us/entra/identity/app-provisioning/use-scim-to-provision-users-and-groups
	 */
	it("applies Entra's captured flat-key pathless replace alongside primary filters", async () => {
		const { auth } = createEnterpriseFixture();
		const createResponse = await auth.handler(
			createSCIMRequest("/scim/v2/Users", {
				method: "POST",
				token: "workforce-token",
				body: {
					schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
					userName: "flat-key-replace@example.com",
					name: { formatted: "Original" },
					emails: [{ value: "flat-key-replace@example.com", primary: true }],
					phoneNumbers: [{ value: "+1-555-0100", primary: true }],
					addresses: [{ formatted: "1 Old Way", primary: true }],
					roles: [{ value: "engineer", display: "Engineer", primary: true }],
					entitlements: [{ value: "vpn", display: "VPN", primary: true }],
					[SCIM_ENTERPRISE_USER_SCHEMA]: { manager: "manager-id" },
				},
			}),
		);
		const user = await readJSON<SCIMUserResponse>(createResponse);

		const patchResponse = await auth.handler(
			createSCIMRequest(`/scim/v2/Users/${encodeURIComponent(user.id)}`, {
				method: "PATCH",
				token: "workforce-token",
				body: {
					schemas: [SCIM_PATCH_SCHEMA],
					Operations: [
						{
							op: "replace",
							path: "emails[primary eq true].value",
							value: "flat-key-replaced@example.com",
						},
						{
							op: "replace",
							path: "phoneNumbers[primary eq true].value",
							value: "+1-555-0199",
						},
						{
							op: "replace",
							path: "roles[primary eq true].value",
							value: "senior-engineer",
						},
						{
							op: "replace",
							path: "entitlements[primary eq true].value",
							value: "vpn-admin",
						},
						{
							op: "replace",
							value: {
								displayName: "Flat Key Replace",
								"name.formatted": "Replaced",
								"name.givenName": "First",
								[`${SCIM_ENTERPRISE_USER_SCHEMA}:employeeNumber`]: "99999",
							},
						},
					],
				},
			}),
		);
		const patched = await readJSON<SCIMUserResponse>(patchResponse);
		expect(patchResponse.status, JSON.stringify(patched)).toBe(200);
		expect(patched).toMatchObject({
			displayName: "Flat Key Replace",
			name: { formatted: "Replaced", givenName: "First" },
			emails: [{ value: "flat-key-replaced@example.com", primary: true }],
			phoneNumbers: [{ value: "+1-555-0199", primary: true }],
			roles: [{ value: "senior-engineer", primary: true }],
			entitlements: [{ value: "vpn-admin", primary: true }],
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				employeeNumber: "99999",
				manager: { value: "manager-id" },
			},
		});

		const listResponse = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users?filter=${encodeURIComponent(
					`userName eq "flat-key-replace@example.com"`,
				)}`,
				{ token: "workforce-token" },
			),
		);
		const list = await readJSON<{ Resources: SCIMUserResponse[] }>(
			listResponse,
		);
		expect(list.Resources).toHaveLength(1);
		expect(list.Resources[0]).toMatchObject({
			displayName: "Flat Key Replace",
			name: { formatted: "Replaced", givenName: "First" },
			emails: [{ value: "flat-key-replaced@example.com", primary: true }],
			phoneNumbers: [{ value: "+1-555-0199", primary: true }],
			roles: [{ value: "senior-engineer", primary: true }],
			entitlements: [{ value: "vpn-admin", primary: true }],
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				employeeNumber: "99999",
				manager: { value: "manager-id" },
			},
		});
	});

	it("resolves the quoted string-literal primary filter variant", async () => {
		const { auth } = createEnterpriseFixture();
		const createResponse = await auth.handler(
			createSCIMRequest("/scim/v2/Users", {
				method: "POST",
				token: "workforce-token",
				body: {
					schemas: [SCIM_USER_SCHEMA],
					userName: "quoted-primary-filter@example.com",
					roles: [{ value: "engineer", primary: true }],
				},
			}),
		);
		const user = await readJSON<SCIMUserResponse>(createResponse);

		const patchResponse = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users/${encodeURIComponent(user.id)}?attributes=roles`,
				{
					method: "PATCH",
					token: "workforce-token",
					body: {
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [
							{
								op: "Replace",
								path: 'roles[primary eq "true"].value',
								value: "senior-engineer",
							},
						],
					},
				},
			),
		);
		const patched = await readJSON<SCIMUserResponse>(patchResponse);
		expect(patchResponse.status, JSON.stringify(patched)).toBe(200);
		expect(patched.roles).toEqual([
			{ value: "senior-engineer", primary: true },
		]);
	});

	it("creates a primary-filtered replace target when no value is currently primary", async () => {
		const { auth } = createEnterpriseFixture();
		const createResponse = await auth.handler(
			createSCIMRequest("/scim/v2/Users", {
				method: "POST",
				token: "workforce-token",
				body: {
					schemas: [SCIM_USER_SCHEMA],
					userName: "no-primary-match@example.com",
					roles: [{ value: "engineer", primary: false }],
				},
			}),
		);
		const user = await readJSON<SCIMUserResponse>(createResponse);

		const patchResponse = await auth.handler(
			createSCIMRequest(`/scim/v2/Users/${encodeURIComponent(user.id)}`, {
				method: "PATCH",
				token: "workforce-token",
				body: {
					schemas: [SCIM_PATCH_SCHEMA],
					Operations: [
						{
							op: "Replace",
							path: "roles[primary eq true].value",
							value: "senior-engineer",
						},
					],
				},
			}),
		);
		const patched = await readJSON<SCIMUserResponse>(patchResponse);
		expect(patchResponse.status, JSON.stringify(patched)).toBe(200);
		expect(patched.roles).toEqual([
			{ value: "engineer", primary: false },
			{ value: "senior-engineer", primary: true },
		]);
	});

	it("cascades an emptied manager object out of the Enterprise extension on subattribute removal", async () => {
		const { auth, data } = createEnterpriseFixture();
		const createResponse = await auth.handler(
			createSCIMRequest("/scim/v2/Users", {
				method: "POST",
				token: "workforce-token",
				body: {
					schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
					userName: "manager-value-remove@example.com",
					[SCIM_ENTERPRISE_USER_SCHEMA]: { manager: "manager-id" },
				},
			}),
		);
		const user = await readJSON<SCIMUserResponse>(createResponse);

		const patchResponse = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users/${encodeURIComponent(user.id)}?attributes=userName`,
				{
					method: "PATCH",
					token: "workforce-token",
					body: {
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [
							{
								op: "Remove",
								path: `${SCIM_ENTERPRISE_USER_SCHEMA}:manager.value`,
							},
						],
					},
				},
			),
		);
		const patched = await readJSON<SCIMUserResponse>(patchResponse);
		expect(patchResponse.status, JSON.stringify(patched)).toBe(200);
		expect(patched.schemas).toEqual([SCIM_USER_SCHEMA]);
		expect(patched).not.toHaveProperty(SCIM_ENTERPRISE_USER_SCHEMA);

		const resource = await auth.handler(
			createSCIMRequest(`/scim/v2/Users/${encodeURIComponent(user.id)}`, {
				token: "workforce-token",
			}),
		);
		expect(await readJSON(resource)).not.toHaveProperty(
			SCIM_ENTERPRISE_USER_SCHEMA,
		);
		expect(
			JSON.parse(
				data.scimUser.find((candidate) => candidate.id === user.id)
					?.serializedAttributes ?? "{}",
			),
		).not.toHaveProperty("enterprise");
	});

	/**
	 * @see https://learn.microsoft.com/en-us/entra/identity/app-provisioning/use-scim-to-provision-users-and-groups
	 */
	it("clears manager on Microsoft Entra's replace-with-empty-string PATCH", async () => {
		const { auth } = createEnterpriseFixture();
		const createResponse = await auth.handler(
			createSCIMRequest("/scim/v2/Users", {
				method: "POST",
				token: "workforce-token",
				body: {
					schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
					userName: "manager-empty-string-remove@example.com",
					[SCIM_ENTERPRISE_USER_SCHEMA]: { manager: "manager-id" },
				},
			}),
		);
		const user = await readJSON<SCIMUserResponse>(createResponse);

		const patchResponse = await auth.handler(
			createSCIMRequest(`/scim/v2/Users/${encodeURIComponent(user.id)}`, {
				method: "PATCH",
				token: "workforce-token",
				body: {
					schemas: [SCIM_PATCH_SCHEMA],
					Operations: [
						{
							op: "replace",
							path: `${SCIM_ENTERPRISE_USER_SCHEMA}:manager`,
							value: "",
						},
					],
				},
			}),
		);
		const patched = await readJSON<SCIMUserResponse>(patchResponse);
		expect(patchResponse.status, JSON.stringify(patched)).toBe(200);
		expect(patched.schemas).toEqual([SCIM_USER_SCHEMA]);
		expect(patched).not.toHaveProperty(SCIM_ENTERPRISE_USER_SCHEMA);

		const resource = await auth.handler(
			createSCIMRequest(`/scim/v2/Users/${encodeURIComponent(user.id)}`, {
				token: "workforce-token",
			}),
		);
		const fetched = await readJSON<SCIMUserResponse>(resource);
		expect(fetched.schemas).toEqual([SCIM_USER_SCHEMA]);
		expect(fetched).not.toHaveProperty(SCIM_ENTERPRISE_USER_SCHEMA);
	});

	it("resolves a bare Enterprise User sub-attribute name in the attributes projection", async () => {
		const { auth } = createEnterpriseFixture();
		const createResponse = await auth.handler(
			createSCIMRequest("/scim/v2/Users", {
				method: "POST",
				token: "workforce-token",
				body: {
					schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
					userName: "bare-attribute-projection@example.com",
					roles: [{ value: "engineer", primary: true }],
					[SCIM_ENTERPRISE_USER_SCHEMA]: { manager: "manager-id" },
				},
			}),
		);
		const user = await readJSON<SCIMUserResponse>(createResponse);

		const projected = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users/${encodeURIComponent(
					user.id,
				)}?attributes=${encodeURIComponent("userName,roles,manager")}`,
				{ token: "workforce-token" },
			),
		);
		expect(await readJSON(projected)).toEqual({
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
			id: user.id,
			userName: "bare-attribute-projection@example.com",
			roles: [{ value: "engineer", primary: true }],
			[SCIM_ENTERPRISE_USER_SCHEMA]: { manager: { value: "manager-id" } },
		});
	});

	it("applies a pathless Enterprise User root object with canonical persistence and response", async () => {
		const { auth, data } = createEnterpriseFixture();
		const managerResponse = await auth.handler(
			createSCIMRequest("/scim/v2/Users", {
				method: "POST",
				token: "workforce-token",
				body: {
					schemas: [SCIM_USER_SCHEMA],
					userName: "pathless-manager@example.com",
					displayName: "Pathless Manager",
				},
			}),
		);
		expect(managerResponse.status).toBe(201);
		const manager = await readJSON<SCIMUserResponse>(managerResponse);
		const reportResponse = await auth.handler(
			createSCIMRequest("/scim/v2/Users", {
				method: "POST",
				token: "workforce-token",
				body: {
					schemas: [SCIM_USER_SCHEMA],
					userName: "pathless-report@example.com",
					displayName: "Pathless Report",
				},
			}),
		);
		expect(reportResponse.status).toBe(201);
		const report = await readJSON<SCIMUserResponse>(reportResponse);

		const patchResponse = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users/${encodeURIComponent(
					report.id,
				)}?attributes=${encodeURIComponent(SCIM_ENTERPRISE_USER_SCHEMA)}`,
				{
					method: "PATCH",
					token: "workforce-token",
					body: {
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [
							{
								op: "Replace",
								value: {
									[SCIM_ENTERPRISE_USER_SCHEMA]: {
										employeeNumber: "E-204",
										department: "Finance",
										manager: {
											value: manager.id,
										},
									},
								},
							},
						],
					},
				},
			),
		);
		const patched = await readJSON<SCIMUserResponse>(patchResponse);

		expect(patchResponse.status, JSON.stringify(patched)).toBe(200);
		expect(patched).toMatchObject({
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
			id: report.id,
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				employeeNumber: "E-204",
				department: "Finance",
				manager: {
					value: manager.id,
				},
			},
		});
		const persisted = data.scimUser.find((user) => user.id === report.id);
		if (!persisted) throw new Error("Expected pathless-patched SCIM User");
		expect(JSON.parse(persisted.serializedAttributes)).toMatchObject({
			schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
			enterprise: {
				employeeNumber: "E-204",
				department: "Finance",
				manager: {
					value: manager.id,
				},
			},
		});
	});

	it("requires exactly the PatchOp schema on User PATCH without mutating rejected resources", async () => {
		const { auth, data } = createEnterpriseFixture();
		const createResponse = await auth.handler(
			createSCIMRequest("/scim/v2/Users", {
				method: "POST",
				token: "workforce-token",
				body: {
					schemas: [SCIM_USER_SCHEMA],
					userName: "patch-message-schema@example.com",
					title: "Original title",
				},
			}),
		);
		expect(createResponse.status).toBe(201);
		const created = await readJSON<SCIMUserResponse>(createResponse);
		const readPersistedAttributes = () => {
			const persisted = data.scimUser.find((user) => user.id === created.id);
			if (!persisted) throw new Error("Expected persisted PATCH schema User");
			return persisted.serializedAttributes;
		};
		const beforeRejectedPatches = readPersistedAttributes();

		for (const unsupportedSchema of [
			SCIM_MICROSOFT_GRAPH_USER_SCHEMA,
			SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA,
		]) {
			const response = await auth.handler(
				createSCIMRequest(`/scim/v2/Users/${encodeURIComponent(created.id)}`, {
					method: "PATCH",
					token: "workforce-token",
					body: {
						schemas: [SCIM_PATCH_SCHEMA, unsupportedSchema],
						Operations: [
							{
								op: "Replace",
								path: "title",
								value: "Must not persist",
							},
						],
					},
				}),
			);
			expect(response.status).toBe(400);
			expect(await readJSON(response)).toMatchObject({
				scimType: "invalidValue",
			});
			expect(readPersistedAttributes()).toBe(beforeRejectedPatches);
		}

		const acceptedResponse = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users/${encodeURIComponent(created.id)}?attributes=title`,
				{
					method: "PATCH",
					token: "workforce-token",
					body: {
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [
							{
								op: "Replace",
								path: "title",
								value: "Accepted title",
							},
						],
					},
				},
			),
		);
		expect(acceptedResponse.status).toBe(200);
		expect(await readJSON(acceptedResponse)).toMatchObject({
			schemas: [SCIM_USER_SCHEMA],
			id: created.id,
			title: "Accepted title",
		});
		expect(JSON.parse(readPersistedAttributes())).toMatchObject({
			title: "Accepted title",
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10411
	 */
	it("demotes existing primary values for every structured core attribute over HTTP", async () => {
		const { auth } = createEnterpriseFixture();
		const createResponse = await auth.handler(
			createSCIMRequest("/scim/v2/Users", {
				method: "POST",
				token: "workforce-token",
				body: {
					schemas: [SCIM_USER_SCHEMA],
					userName: "primary-values@example.com",
					phoneNumbers: [{ value: "+1-555-0100", type: "work", primary: true }],
					addresses: [{ locality: "Seattle", type: "work", primary: true }],
					roles: [{ value: "analyst", type: "work", primary: true }],
					entitlements: [{ value: "standard", type: "work", primary: true }],
				},
			}),
		);
		expect(createResponse.status).toBe(201);
		const created = await readJSON<SCIMUserResponse>(createResponse);

		const patchResponse = await auth.handler(
			createSCIMRequest(
				`/scim/v2/Users/${encodeURIComponent(
					created.id,
				)}?attributes=phoneNumbers,addresses,roles,entitlements`,
				{
					method: "PATCH",
					token: "workforce-token",
					body: {
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [
							{
								op: "Add",
								value: {
									phoneNumbers: [
										{
											value: "+1-555-0199",
											type: "mobile",
											primary: true,
										},
									],
									addresses: [
										{
											locality: "Vancouver",
											type: "home",
											primary: true,
										},
									],
									roles: [
										{
											value: "manager",
											type: "project",
											primary: true,
										},
									],
									entitlements: [
										{
											value: "premium",
											type: "license",
											primary: true,
										},
									],
								},
							},
						],
					},
				},
			),
		);
		expect(patchResponse.status).toBe(200);
		expect(await readJSON(patchResponse)).toMatchObject({
			phoneNumbers: [
				{ value: "+1-555-0100", type: "work", primary: false },
				{ value: "+1-555-0199", type: "mobile", primary: true },
			],
			addresses: [
				{ locality: "Seattle", type: "work", primary: false },
				{ locality: "Vancouver", type: "home", primary: true },
			],
			roles: [
				{ value: "analyst", type: "work", primary: false },
				{ value: "manager", type: "project", primary: true },
			],
			entitlements: [
				{ value: "standard", type: "work", primary: false },
				{ value: "premium", type: "license", primary: true },
			],
		});
	});

	it("exposes typed Enterprise User and manager callback data", () => {
		expectTypeOf<{ value: string }>().toMatchTypeOf<SCIMCanonicalManager>();
		expectTypeOf<{ $ref: string }>().toMatchTypeOf<SCIMCanonicalManager>();
		expectTypeOf<SCIMCanonicalManager>().not.toHaveProperty("displayName");
		expectTypeOf<SCIMEnterpriseUser>().toMatchTypeOf<{
			employeeNumber?: string;
			costCenter?: string;
			organization?: string;
			division?: string;
			department?: string;
			manager?: SCIMCanonicalManager;
		}>();
		expectTypeOf<SCIMCanonicalUser["enterprise"]>().toEqualTypeOf<
			SCIMEnterpriseUser | undefined
		>();
	});
});
