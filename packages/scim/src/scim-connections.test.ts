import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";

type SCIMUserRow = {
	id: string;
	connectionId: string;
	userId: string;
	orderKey: string;
	userName: string;
	externalId?: string;
	active: boolean;
};

function withoutNativeTransactions(
	adapterFactory: ReturnType<typeof memoryAdapter>,
): ReturnType<typeof memoryAdapter> {
	return (options) => {
		const adapter = adapterFactory(options);
		if (!adapter.options) throw new Error("Expected adapter options");
		return {
			...adapter,
			options: {
				...adapter.options,
				adapterConfig: {
					...adapter.options.adapterConfig,
					transaction: false,
				},
			},
		};
	};
}

describe("SCIM connection provisioning", () => {
	it("rejects ambiguous connection identifiers and bearer credentials", () => {
		expect(() =>
			scim({
				connections: [
					{
						id: " workforce ",
						credentials: [{ type: "bearer", token: "valid-token" }],
					},
				],
			}),
		).toThrow("SCIM connection ids must be trimmed");
		expect(() =>
			scim({
				connections: [
					{
						id: "workforce",
						credentials: [{ type: "bearer", token: "invalid token" }],
					},
				],
			}),
		).toThrow("SCIM bearer tokens cannot be empty or contain whitespace");
	});

	it("provisions a connection-owned SCIM resource without an organization or account", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimConnection: [] as { id: string }[],
			scimCredential: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroupMember: [] as { id: string }[],
			scimProjectionGrant: [] as { id: string }[],
		};
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
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
		const authorization = { authorization: "Bearer test-scim-token" };

		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ada@example.com",
				name: { formatted: "Ada Lovelace" },
			},
			headers: authorization,
		});
		const retrieved = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers: authorization,
		});
		const scimUser = data.scimUser.find((row) => row.id === created.id);

		expect(retrieved).toMatchObject({
			id: created.id,
			userName: "ada@example.com",
		});
		expect(scimUser).toMatchObject({
			id: created.id,
			connectionId: "workforce",
			userId: expect.any(String),
		});
		expect(created.id).not.toBe(scimUser?.userId);
		expect(data.account).toHaveLength(0);
	});

	it("deactivates a SCIM User without deleting the global Better Auth User", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimConnection: [] as { id: string }[],
			scimCredential: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroupMember: [] as { id: string }[],
			scimProjectionGrant: [] as { id: string }[],
		};
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
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
		const authorization = { authorization: "Bearer test-scim-token" };
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "grace@example.com",
			},
			headers: authorization,
		});

		await auth.api.patchSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [{ op: "replace", path: "active", value: false }],
			},
			headers: authorization,
		});

		const retrieved = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers: authorization,
		});
		const scimUser = data.scimUser.find((row) => row.id === created.id);

		expect(retrieved.active).toBe(false);
		expect(scimUser?.active).toBe(false);
		expect(data.user.some((user) => user.id === scimUser?.userId)).toBe(true);
	});

	it("lists only SCIM Users owned by the authenticated connection", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimConnection: [] as { id: string }[],
			scimCredential: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimProjectionGrant: [] as { id: string }[],
		};
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(data),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce-a",
							credentials: [{ type: "bearer", token: "connection-a-token" }],
						},
						{
							id: "workforce-b",
							credentials: [{ type: "bearer", token: "connection-b-token" }],
						},
					],
				}),
			],
		});
		const connectionAHeaders = {
			authorization: "Bearer connection-a-token",
		};
		const connectionBHeaders = {
			authorization: "Bearer connection-b-token",
		};

		const connectionAUser = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ada@connection-a.test",
			},
			headers: connectionAHeaders,
		});
		const connectionBUser = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "grace@connection-b.test",
			},
			headers: connectionBHeaders,
		});

		const listed = await auth.api.listSCIMUsers({
			headers: connectionAHeaders,
		});

		expect(listed.totalResults).toBe(1);
		expect(listed.Resources).toEqual([
			expect.objectContaining({ id: connectionAUser.id }),
		]);
		expect(listed.Resources).not.toContainEqual(
			expect.objectContaining({ id: connectionBUser.id }),
		);
	});

	it("replaces a SCIM User while preserving its connection-owned identity", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimConnection: [] as { id: string }[],
			scimCredential: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimProjectionGrant: [] as { id: string }[],
		};
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
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
		const authorization = { authorization: "Bearer test-scim-token" };
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ada@example.com",
				name: { formatted: "Ada Lovelace" },
				externalId: "directory-user-1",
			},
			headers: authorization,
		});
		const originalLink = data.scimUser.find((row) => row.id === created.id);
		if (!originalLink) throw new Error("Expected a SCIM User link");

		const replaced = await auth.api.replaceSCIMUser({
			params: { userId: created.id },
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "augusta@example.com",
				name: { formatted: "Augusta Ada King" },
				externalId: "directory-user-2",
				active: false,
			},
			headers: authorization,
		});
		const retrieved = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers: authorization,
		});
		const updatedLink = data.scimUser.find((row) => row.id === created.id);

		expect(replaced.id).toBe(created.id);
		expect(retrieved).toMatchObject({
			id: created.id,
			userName: "augusta@example.com",
			name: { formatted: "Augusta Ada King" },
			externalId: "directory-user-2",
			active: false,
			emails: [{ primary: true, value: "augusta@example.com" }],
		});
		expect(updatedLink).toMatchObject({
			id: created.id,
			connectionId: "workforce",
			userId: originalLink.userId,
			userName: "augusta@example.com",
			externalId: "directory-user-2",
			active: false,
		});
		expect(data.account).toHaveLength(0);
	});

	it("deletes only the SCIM User link and preserves the Better Auth User", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimConnection: [] as { id: string }[],
			scimCredential: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroupMember: [] as { id: string }[],
			scimProjectionGrant: [] as { id: string }[],
		};
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
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
		const authorization = { authorization: "Bearer test-scim-token" };
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "katherine@example.com",
			},
			headers: authorization,
		});
		const link = data.scimUser.find((row) => row.id === created.id);
		if (!link) throw new Error("Expected a SCIM User link");

		await auth.api.deleteSCIMUser({
			params: { userId: created.id },
			headers: authorization,
		});

		expect(data.scimUser).not.toContainEqual(
			expect.objectContaining({ id: created.id }),
		);
		await expect(
			auth.api.getSCIMUser({
				params: { userId: created.id },
				headers: authorization,
			}),
		).rejects.toThrowError(
			expect.objectContaining({
				message: "SCIM User not found",
				body: {
					detail: "SCIM User not found",
					schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
					status: "404",
				},
			}),
		);
		expect(data.user.some((user) => user.id === link.userId)).toBe(true);
		expect(data.account).toHaveLength(0);
	});

	it("filters and paginates the connection-owned User collection", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimConnection: [] as { id: string }[],
			scimCredential: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimProjectionGrant: [] as { id: string }[],
		};
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
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
		const authorization = { authorization: "Bearer test-scim-token" };
		await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ada@example.com",
			},
			headers: authorization,
		});
		const second = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "grace@example.com",
			},
			headers: authorization,
		});
		await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "katherine@example.com",
			},
			headers: authorization,
		});

		const existingMatch = await auth.api.listSCIMUsers({
			query: { filter: 'userName eq "grace@example.com"' },
			headers: authorization,
		});
		const nonexistentMatch = await auth.api.listSCIMUsers({
			query: { filter: 'userName eq "missing@example.com"' },
			headers: authorization,
		});
		const secondPage = await auth.api.listSCIMUsers({
			query: { startIndex: 2, count: 1 },
			headers: authorization,
		});
		const expectedSecondPageId = [...data.scimUser].sort((left, right) =>
			left.orderKey.localeCompare(right.orderKey),
		)[1]?.id;

		expect(existingMatch).toMatchObject({
			totalResults: 1,
			startIndex: 1,
			itemsPerPage: 1,
		});
		expect(existingMatch.Resources.map((user) => user.id)).toEqual([second.id]);
		expect(nonexistentMatch).toEqual({
			schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
			totalResults: 0,
			startIndex: 1,
			itemsPerPage: 0,
			Resources: [],
		});
		expect(secondPage).toMatchObject({
			totalResults: 3,
			startIndex: 2,
			itemsPerPage: 1,
		});
		expect(secondPage.Resources.map((user) => user.id)).toEqual([
			expectedSecondPageId,
		]);
		expect(new Set(data.scimUser.map((user) => user.orderKey)).size).toBe(3);
	});

	it("accepts overlapping bearer credentials and rejects an expired credential", async () => {
		const createData = () => ({
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimConnection: [] as { id: string }[],
			scimCredential: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimProjectionGrant: [] as { id: string }[],
		});
		const data = createData();
		const futureDate = new Date(Date.now() + 60 * 60 * 1000);
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(data),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce",
							credentials: [
								{ type: "bearer", token: "rotating-token-a" },
								{
									type: "bearer",
									token: "rotating-token-b",
									expiresAt: futureDate,
								},
							],
						},
					],
				}),
			],
		});
		const created = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ada@example.com",
			},
			headers: { authorization: "Bearer rotating-token-a" },
		});
		const retrieved = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers: { authorization: "Bearer rotating-token-b" },
		});
		const retrievedResponse = await auth.handler(
			new Request(
				`http://localhost:3000/api/auth/scim/v2/Users/${created.id}`,
				{
					headers: { authorization: "Bearer rotating-token-b" },
				},
			),
		);

		expect(retrieved.id).toBe(created.id);
		expect(retrievedResponse.headers.get("content-type")).toBe(
			"application/scim+json",
		);
		expect(data.scimUser).toContainEqual(
			expect.objectContaining({
				id: created.id,
				connectionId: "workforce",
			}),
		);

		const expiredAuth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(createData()),
			plugins: [
				scim({
					connections: [
						{
							id: "expired-workforce",
							credentials: [
								{
									type: "bearer",
									token: "expired-token",
									expiresAt: new Date(Date.now() - 60 * 1000),
								},
							],
						},
					],
				}),
			],
		});
		const expiredResponse = await expiredAuth.handler(
			new Request("http://localhost:3000/api/auth/scim/v2/Users", {
				headers: { authorization: "Bearer expired-token" },
			}),
		);

		expect(expiredResponse.status).toBe(401);
		expect(expiredResponse.headers.get("www-authenticate")).toBe(
			'Bearer realm="SCIM"',
		);
	});

	it("rejects provisioning before any write when the adapter lacks native transactions", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroupMember: [] as { id: string }[],
			scimProjectionGrant: [] as { id: string }[],
		};
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: withoutNativeTransactions(memoryAdapter(data)),
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

		await expect(
			auth.api.createSCIMUser({
				body: {
					schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
					userName: "no-transaction@example.com",
				},
				headers: { authorization: "Bearer test-scim-token" },
			}),
		).rejects.toThrow("native transaction support");
		expect(data.scimConnectionBinding).toEqual([]);
		expect(data.user).toEqual([]);
		expect(data.scimSubject).toEqual([]);
		expect(data.scimUser).toEqual([]);
	});
});
