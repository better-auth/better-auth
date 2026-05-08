import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { setCookieToHeader } from "better-auth/cookies";
import { bearer, organization } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import { scimClient } from "./client";
import type { SCIMOptions } from "./types";

const createTestInstance = (scimOptions?: SCIMOptions) => {
	const testUser = {
		email: "test@email.com",
		password: "password",
		name: "Test User",
	};

	const data = {
		user: [],
		session: [],
		verification: [],
		account: [],
		ssoProvider: [],
		scimProvider: [],
		organization: [],
		member: [],
	};
	const memory = memoryAdapter(data);

	const auth = betterAuth({
		database: memory,
		baseURL: "http://localhost:3000",
		emailAndPassword: {
			enabled: true,
		},
		plugins: [sso(), scim(scimOptions), organization()],
	});

	const authClient = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [bearer(), scimClient()],
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	async function getAuthCookieHeaders(
		user: { email: string; password: string; name: string } = testUser,
	) {
		const headers = new Headers();

		await authClient.signUp.email({
			email: user.email,
			password: user.password,
			name: user.name,
		});

		await authClient.signIn.email(user, {
			throw: true,
			onSuccess: setCookieToHeader(headers),
		});

		return headers;
	}

	async function getSCIMToken(
		providerId: string = "the-saml-provider-1",
		organizationId?: string,
	) {
		const headers = await getAuthCookieHeaders();
		const { scimToken } = await auth.api.generateSCIMToken({
			body: {
				providerId,
				organizationId,
			},
			headers,
		});

		return scimToken;
	}

	async function registerOrganization(org: string) {
		const headers = await getAuthCookieHeaders();

		return await auth.api.createOrganization({
			body: {
				slug: `the-${org}`,
				name: `the organization ${org}`,
			},
			headers,
		});
	}

	return {
		auth,
		authClient,
		registerOrganization,
		getSCIMToken,
		getAuthCookieHeaders,
	};
};

const _createSqlTestInstance = async (
	testWith: "sqlite" | "postgres",
	scimOptions?: SCIMOptions,
) => {
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			plugins: [scim(scimOptions), organization()],
		},
		{
			testWith,
		},
	);

	async function getSCIMToken(
		providerId: string = "the-saml-provider-1",
		organizationId?: string,
	) {
		const { headers } = await signInWithTestUser();
		const { scimToken } = await auth.api.generateSCIMToken({
			body: {
				providerId,
				organizationId,
			},
			headers,
		});

		return scimToken;
	}

	async function registerOrganization(org: string) {
		const { headers } = await signInWithTestUser();

		return await auth.api.createOrganization({
			body: {
				slug: `the-${org}`,
				name: `the organization ${org}`,
			},
			headers,
		});
	}

	return {
		auth,
		client,
		registerOrganization,
		getSCIMToken,
		signInWithTestUser,
	};
};

describe("SCIM", () => {
	describe("GET /scim/v2/ServiceProviderConfig", () => {
		it("should fetch the service provider config", async () => {
			const { auth } = createTestInstance();
			const serviceProviderInfo = await auth.api.getSCIMServiceProviderConfig();

			expect(serviceProviderInfo).toMatchInlineSnapshot(`
				{
				  "authenticationSchemes": [
				    {
				      "description": "Authentication scheme using the Authorization header with a bearer token tied to an organization.",
				      "name": "OAuth Bearer Token",
				      "primary": true,
				      "specUri": "http://www.rfc-editor.org/info/rfc6750",
				      "type": "oauthbearertoken",
				    },
				  ],
				  "bulk": {
				    "supported": false,
				  },
				  "changePassword": {
				    "supported": false,
				  },
				  "etag": {
				    "supported": false,
				  },
				  "filter": {
				    "supported": true,
				  },
				  "meta": {
				    "resourceType": "ServiceProviderConfig",
				  },
				  "patch": {
				    "supported": true,
				  },
				  "schemas": [
				    "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig",
				  ],
				  "sort": {
				    "supported": false,
				  },
				}
			`);
		});
	});

	describe("GET /scim/v2/Schemas", () => {
		it("should fetch the list of supported schemas", async () => {
			const { auth } = createTestInstance();
			const schemas = await auth.api.getSCIMSchemas();

			expect(schemas).toMatchInlineSnapshot(`
				{
				  "Resources": [
				    {
				      "attributes": [
				        {
				          "caseExact": true,
				          "description": "Unique opaque identifier for the User",
				          "multiValued": false,
				          "mutability": "readOnly",
				          "name": "id",
				          "required": false,
				          "returned": "default",
				          "type": "string",
				          "uniqueness": "server",
				        },
				        {
				          "caseExact": false,
				          "description": "Unique identifier for the User, typically used by the user to directly authenticate to the service provider",
				          "multiValued": false,
				          "mutability": "readWrite",
				          "name": "userName",
				          "required": true,
				          "returned": "default",
				          "type": "string",
				          "uniqueness": "server",
				        },
				        {
				          "caseExact": true,
				          "description": "The name of the User, suitable for display to end-users.  The name SHOULD be the full name of the User being described, if known.",
				          "multiValued": false,
				          "mutability": "readOnly",
				          "name": "displayName",
				          "required": false,
				          "returned": "default",
				          "type": "string",
				          "uniqueness": "none",
				        },
				        {
				          "description": "A Boolean value indicating the User's administrative status.",
				          "multiValued": false,
				          "mutability": "readOnly",
				          "name": "active",
				          "required": false,
				          "returned": "default",
				          "type": "boolean",
				        },
				        {
				          "description": "The components of the user's real name.",
				          "multiValued": false,
				          "name": "name",
				          "required": false,
				          "subAttributes": [
				            {
				              "caseExact": false,
				              "description": "The full name, including all middlenames, titles, and suffixes as appropriate, formatted for display(e.g., 'Ms. Barbara J Jensen, III').",
				              "multiValued": false,
				              "mutability": "readWrite",
				              "name": "formatted",
				              "required": false,
				              "returned": "default",
				              "type": "string",
				              "uniqueness": "none",
				            },
				            {
				              "caseExact": false,
				              "description": "The family name of the User, or last name in most Western languages (e.g., 'Jensen' given the fullname 'Ms. Barbara J Jensen, III').",
				              "multiValued": false,
				              "mutability": "readWrite",
				              "name": "familyName",
				              "required": false,
				              "returned": "default",
				              "type": "string",
				              "uniqueness": "none",
				            },
				            {
				              "caseExact": false,
				              "description": "The given name of the User, or first name in most Western languages (e.g., 'Barbara' given the full name 'Ms. Barbara J Jensen, III').",
				              "multiValued": false,
				              "mutability": "readWrite",
				              "name": "givenName",
				              "required": false,
				              "returned": "default",
				              "type": "string",
				              "uniqueness": "none",
				            },
				          ],
				          "type": "complex",
				        },
				        {
				          "description": "Email addresses for the user.  The value SHOULD be canonicalized by the service provider, e.g., 'bjensen@example.com' instead of 'bjensen@EXAMPLE.COM'. Canonical type values of 'work', 'home', and 'other'.",
				          "multiValued": true,
				          "mutability": "readWrite",
				          "name": "emails",
				          "required": false,
				          "returned": "default",
				          "subAttributes": [
				            {
				              "caseExact": false,
				              "description": "Email addresses for the user.  The value SHOULD be canonicalized by the service provider, e.g., 'bjensen@example.com' instead of 'bjensen@EXAMPLE.COM'. Canonical type values of 'work', 'home', and 'other'.",
				              "multiValued": false,
				              "mutability": "readWrite",
				              "name": "value",
				              "required": false,
				              "returned": "default",
				              "type": "string",
				              "uniqueness": "server",
				            },
				            {
				              "description": "A Boolean value indicating the 'primary' or preferred attribute value for this attribute, e.g., the preferred mailing address or primary email address.  The primary attribute value 'true' MUST appear no more than once.",
				              "multiValued": false,
				              "mutability": "readWrite",
				              "name": "primary",
				              "required": false,
				              "returned": "default",
				              "type": "boolean",
				            },
				          ],
				          "type": "complex",
				          "uniqueness": "none",
				        },
				      ],
				      "description": "User Account",
				      "id": "urn:ietf:params:scim:schemas:core:2.0:User",
				      "meta": {
				        "location": "http://localhost:3000/api/auth/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:User",
				        "resourceType": "Schema",
				      },
				      "name": "User",
				      "schemas": [
				        "urn:ietf:params:scim:schemas:core:2.0:Schema",
				      ],
				    },
				  ],
				  "itemsPerPage": 1,
				  "schemas": [
				    "urn:ietf:params:scim:api:messages:2.0:ListResponse",
				  ],
				  "startIndex": 1,
				  "totalResults": 1,
				}
			`);
		});

		it("should fetch a single resource schema", async () => {
			const { auth } = createTestInstance();
			const schemas = await auth.api.getSCIMSchema({
				params: {
					schemaId: "urn:ietf:params:scim:schemas:core:2.0:User",
				},
			});

			expect(schemas).toMatchInlineSnapshot(`
				{
				  "attributes": [
				    {
				      "caseExact": true,
				      "description": "Unique opaque identifier for the User",
				      "multiValued": false,
				      "mutability": "readOnly",
				      "name": "id",
				      "required": false,
				      "returned": "default",
				      "type": "string",
				      "uniqueness": "server",
				    },
				    {
				      "caseExact": false,
				      "description": "Unique identifier for the User, typically used by the user to directly authenticate to the service provider",
				      "multiValued": false,
				      "mutability": "readWrite",
				      "name": "userName",
				      "required": true,
				      "returned": "default",
				      "type": "string",
				      "uniqueness": "server",
				    },
				    {
				      "caseExact": true,
				      "description": "The name of the User, suitable for display to end-users.  The name SHOULD be the full name of the User being described, if known.",
				      "multiValued": false,
				      "mutability": "readOnly",
				      "name": "displayName",
				      "required": false,
				      "returned": "default",
				      "type": "string",
				      "uniqueness": "none",
				    },
				    {
				      "description": "A Boolean value indicating the User's administrative status.",
				      "multiValued": false,
				      "mutability": "readOnly",
				      "name": "active",
				      "required": false,
				      "returned": "default",
				      "type": "boolean",
				    },
				    {
				      "description": "The components of the user's real name.",
				      "multiValued": false,
				      "name": "name",
				      "required": false,
				      "subAttributes": [
				        {
				          "caseExact": false,
				          "description": "The full name, including all middlenames, titles, and suffixes as appropriate, formatted for display(e.g., 'Ms. Barbara J Jensen, III').",
				          "multiValued": false,
				          "mutability": "readWrite",
				          "name": "formatted",
				          "required": false,
				          "returned": "default",
				          "type": "string",
				          "uniqueness": "none",
				        },
				        {
				          "caseExact": false,
				          "description": "The family name of the User, or last name in most Western languages (e.g., 'Jensen' given the fullname 'Ms. Barbara J Jensen, III').",
				          "multiValued": false,
				          "mutability": "readWrite",
				          "name": "familyName",
				          "required": false,
				          "returned": "default",
				          "type": "string",
				          "uniqueness": "none",
				        },
				        {
				          "caseExact": false,
				          "description": "The given name of the User, or first name in most Western languages (e.g., 'Barbara' given the full name 'Ms. Barbara J Jensen, III').",
				          "multiValued": false,
				          "mutability": "readWrite",
				          "name": "givenName",
				          "required": false,
				          "returned": "default",
				          "type": "string",
				          "uniqueness": "none",
				        },
				      ],
				      "type": "complex",
				    },
				    {
				      "description": "Email addresses for the user.  The value SHOULD be canonicalized by the service provider, e.g., 'bjensen@example.com' instead of 'bjensen@EXAMPLE.COM'. Canonical type values of 'work', 'home', and 'other'.",
				      "multiValued": true,
				      "mutability": "readWrite",
				      "name": "emails",
				      "required": false,
				      "returned": "default",
				      "subAttributes": [
				        {
				          "caseExact": false,
				          "description": "Email addresses for the user.  The value SHOULD be canonicalized by the service provider, e.g., 'bjensen@example.com' instead of 'bjensen@EXAMPLE.COM'. Canonical type values of 'work', 'home', and 'other'.",
				          "multiValued": false,
				          "mutability": "readWrite",
				          "name": "value",
				          "required": false,
				          "returned": "default",
				          "type": "string",
				          "uniqueness": "server",
				        },
				        {
				          "description": "A Boolean value indicating the 'primary' or preferred attribute value for this attribute, e.g., the preferred mailing address or primary email address.  The primary attribute value 'true' MUST appear no more than once.",
				          "multiValued": false,
				          "mutability": "readWrite",
				          "name": "primary",
				          "required": false,
				          "returned": "default",
				          "type": "boolean",
				        },
				      ],
				      "type": "complex",
				      "uniqueness": "none",
				    },
				  ],
				  "description": "User Account",
				  "id": "urn:ietf:params:scim:schemas:core:2.0:User",
				  "meta": {
				    "location": "http://localhost:3000/api/auth/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:User",
				    "resourceType": "Schema",
				  },
				  "name": "User",
				  "schemas": [
				    "urn:ietf:params:scim:schemas:core:2.0:Schema",
				  ],
				}
			`);
		});

		it("should return not found for unsupported schemas", async () => {
			const { auth } = createTestInstance();

			const getSchema = () =>
				auth.api.getSCIMSchema({
					params: {
						schemaId: "unknown",
					},
				});

			await expect(getSchema()).rejects.toThrowError(
				expect.objectContaining({
					message: "Schema not found",
					body: {
						detail: "Schema not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "404",
					},
				}),
			);
		});
	});

	describe("GET /scim/v2/ResourceTypes", () => {
		it("should fetch the list of supported resource types", async () => {
			const { auth } = createTestInstance();
			const resourceTypes = await auth.api.getSCIMResourceTypes();

			expect(resourceTypes).toMatchInlineSnapshot(`
				{
				  "Resources": [
				    {
				      "description": "User Account",
				      "endpoint": "/Users",
				      "id": "User",
				      "meta": {
				        "location": "http://localhost:3000/api/auth/scim/v2/ResourceTypes/User",
				        "resourceType": "ResourceType",
				      },
				      "name": "User",
				      "schema": "urn:ietf:params:scim:schemas:core:2.0:User",
				      "schemas": [
				        "urn:ietf:params:scim:schemas:core:2.0:ResourceType",
				      ],
				    },
				  ],
				  "itemsPerPage": 1,
				  "schemas": [
				    "urn:ietf:params:scim:api:messages:2.0:ListResponse",
				  ],
				  "startIndex": 1,
				  "totalResults": 1,
				}
			`);
		});

		it("should fetch a single resource type", async () => {
			const { auth } = createTestInstance();
			const resourceType = await auth.api.getSCIMResourceType({
				params: {
					resourceTypeId: "User",
				},
			});

			expect(resourceType).toMatchInlineSnapshot(`
				{
				  "description": "User Account",
				  "endpoint": "/Users",
				  "id": "User",
				  "meta": {
				    "location": "http://localhost:3000/api/auth/scim/v2/ResourceTypes/User",
				    "resourceType": "ResourceType",
				  },
				  "name": "User",
				  "schema": "urn:ietf:params:scim:schemas:core:2.0:User",
				  "schemas": [
				    "urn:ietf:params:scim:schemas:core:2.0:ResourceType",
				  ],
				}
			`);
		});

		it("should return not found for unsupported resource types", async () => {
			const { auth } = createTestInstance();
			const getResourceType = () =>
				auth.api.getSCIMResourceType({
					params: {
						resourceTypeId: "unknown",
					},
				});

			await expect(getResourceType()).rejects.toThrowError(
				expect.objectContaining({
					message: "Resource type not found",
					body: {
						detail: "Resource type not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "404",
					},
				}),
			);
		});
	});

	describe("POST /scim/v2/Users", () => {
		it("should create a new user", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const response = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
				asResponse: true,
			});

			expect(response.status).toBe(201);
			expect(response.headers.get("location")).toStrictEqual(
				expect.stringContaining("/api/auth/scim/v2/Users/"),
			);

			const user = await response.json();
			expect(user).toMatchObject({
				active: true,
				displayName: "the-username",
				emails: [
					{
						primary: true,
						value: "the-username",
					},
				],
				externalId: "the-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(String),
					lastModified: expect.any(String),
					location: expect.stringContaining("/api/auth/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "the-username",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "the-username",
			});
		});

		it("should create a new account linked to an existing user", async () => {
			const { auth, authClient, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			await authClient.signUp.email({
				email: "existing@email.com",
				password: "the password",
				name: "existing user",
			});

			const response = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
					emails: [{ value: "existing@email.com" }],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
				asResponse: true,
			});

			expect(response.status).toBe(201);
			expect(response.headers.get("location")).toStrictEqual(
				expect.stringContaining("/api/auth/scim/v2/Users/"),
			);

			const user = await response.json();
			expect(user).toMatchObject({
				active: true,
				displayName: "existing user",
				emails: [
					{
						primary: true,
						value: "existing@email.com",
					},
				],
				externalId: "the-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(String),
					lastModified: expect.any(String),
					location: expect.stringContaining("/api/auth/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "existing user",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "existing@email.com",
			});
		});

		it("should create a new user with external id", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const user = await auth.api.createSCIMUser({
				body: {
					externalId: "external-username",
					userName: "the-username",
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(user).toMatchObject({
				active: true,
				displayName: "the-username",
				emails: [
					{
						primary: true,
						value: "the-username",
					},
				],
				externalId: "external-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(Date),
					lastModified: expect.any(Date),
					location: expect.stringContaining("/api/auth/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "the-username",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "the-username",
			});
		});

		it("should create a new user with name parts", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
					name: {
						givenName: "Juan",
						familyName: "Perez",
					},
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(user).toMatchObject({
				active: true,
				displayName: "Juan Perez",
				emails: [
					{
						primary: true,
						value: "the-username",
					},
				],
				externalId: "the-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(Date),
					lastModified: expect.any(Date),
					location: expect.stringContaining("/api/auth/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "Juan Perez",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "the-username",
			});
		});

		it("should create a new user with formatted name", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
					name: {
						formatted: "Juan Perez",
					},
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(user).toMatchObject({
				active: true,
				displayName: "Juan Perez",
				emails: [
					{
						primary: true,
						value: "the-username",
					},
				],
				externalId: "the-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(Date),
					lastModified: expect.any(Date),
					location: expect.stringContaining("/api/auth/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "Juan Perez",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "the-username",
			});
		});

		it("should create a new user with a primary email", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
					name: {
						formatted: "Juan Perez",
					},
					emails: [
						{ value: "secondary-email@test.com" },
						{ value: "primary-email@test.com", primary: true },
					],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(user).toMatchObject({
				active: true,
				displayName: "Juan Perez",
				emails: [
					{
						primary: true,
						value: "primary-email@test.com",
					},
				],
				externalId: "the-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(Date),
					lastModified: expect.any(Date),
					location: expect.stringContaining("/api/auth/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "Juan Perez",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "primary-email@test.com",
			});
		});

		it("should create a new user with the first non-primary email", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
					name: {
						formatted: "Juan Perez",
					},
					emails: [
						{ value: "secondary-email@test.com" },
						{ value: "primary-email@test.com" },
					],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(user).toMatchObject({
				active: true,
				displayName: "Juan Perez",
				emails: [
					{
						primary: true,
						value: "secondary-email@test.com",
					},
				],
				externalId: "the-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(Date),
					lastModified: expect.any(Date),
					location: expect.stringContaining("/api/auth/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "Juan Perez",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "secondary-email@test.com",
			});
		});

		it("should not allow users with the same computed username", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const createUser = async () => {
				await auth.api.createSCIMUser({
					body: {
						userName: "the-username",
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			await createUser();
			await expect(createUser()).rejects.toThrow(/User already exists/);
		});

		it("should not allow anonymous access", async () => {
			const { auth } = createTestInstance();

			const createUser = async () => {
				await auth.api.createSCIMUser({
					body: {
						userName: "the-username",
					},
				});
			};

			await expect(createUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "SCIM token is required",
					body: {
						detail: "SCIM token is required",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "401",
					},
				}),
			);
		});
	});

	describe("PUT /scim/v2/Users", () => {
		it("should update an existing resource", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
					name: {
						formatted: "Juan Perez",
					},
					emails: [{ value: "primary-email@test.com", primary: true }],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(user).toBeTruthy();
			expect(user.externalId).toBe("the-username");
			expect(user.userName).toBe("primary-email@test.com");
			expect(user.name.formatted).toBe("Juan Perez");
			expect(user.emails[0]?.value).toBe("primary-email@test.com");

			const updatedUser = await auth.api.updateSCIMUser({
				params: {
					userId: user.id,
				},
				body: {
					userName: "other-username",
					externalId: "external-username",
					name: {
						formatted: "Daniel Lopez",
					},
					emails: [{ value: "other-email@test.com" }],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(updatedUser).toMatchObject({
				active: true,
				displayName: "Daniel Lopez",
				emails: [
					{
						primary: true,
						value: "other-email@test.com",
					},
				],
				externalId: "external-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(Date),
					lastModified: expect.any(Date),
					location: expect.stringContaining("/api/auth/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "Daniel Lopez",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "other-email@test.com",
			});
		});

		it("should not allow anonymous access", async () => {
			const { auth } = createTestInstance();

			const updateUser = async () => {
				await auth.api.updateSCIMUser({
					params: {
						userId: "whatever",
					},
					body: {
						userName: "the-username",
					},
				});
			};

			await expect(updateUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "SCIM token is required",
					body: {
						detail: "SCIM token is required",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "401",
					},
				}),
			);
		});

		it("should return not found for missing resources", async () => {
			const { auth, getSCIMToken } = createTestInstance();
			const scimToken = await getSCIMToken();

			const updateUser = () =>
				auth.api.updateSCIMUser({
					params: {
						userId: "missing",
					},
					body: {
						userName: "other-username",
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});

			await expect(updateUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "User not found",
					body: {
						detail: "User not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: "404",
					},
				}),
			);
		});
	});
});
