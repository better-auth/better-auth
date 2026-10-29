import type { BetterAuthOptions } from "@better-auth/core";
import { createTestSuite } from "@better-auth/test-utils/adapter";
import { makeSignature } from "better-auth/crypto";
import { jwt } from "better-auth/plugins/jwt";
import { expect } from "vitest";

interface OAuthResourceRecord {
	id: string;
	identifier: string;
	allowedScopes: string[] | null;
	[key: string]: unknown;
}

const ROOT = "https://api.example.com/oauth-resource-scope";

const oauthModPromise = import(
	/* @vite-ignore */ "../../../../packages/oauth-provider/src/oauth" as string
);
const resourcesModPromise = import(
	/* @vite-ignore */ "../../../../packages/oauth-provider/src/resources" as string
);
const adminModPromise = import(
	/* @vite-ignore */ "../../../../packages/oauth-provider/src/oauthResource/index" as string
);

const identifier = `${ROOT}/configured`;
const oauthOpts = {
	loginPage: "/login",
	consentPage: "/consent",
	enforcePerClientResources: false,
	resources: [{ identifier }],
};

const { oauthProvider } = await oauthModPromise;
const { resolveResourcePolicy } = await resourcesModPromise;
const { adminCreateOAuthResource, adminUpdateOAuthResource } =
	await adminModPromise;

const scopeBetterAuthOptions: BetterAuthOptions = {
	baseURL: "http://localhost:3000",
	plugins: [jwt(), oauthProvider(oauthOpts)],
};

/**
 * Acceptance test suite for issue #11725 Part 1: storable `allowedScopes` contract.
 *
 * @see https://github.com/better-auth/better-auth/issues/11725
 */
export const oauthResourceScopeTestSuite = createTestSuite(
	"oauth-resource-scope",
	{},
	({ adapter, getAuth }) => ({
		"seeds a configured resource that omits allowedScopes as [] and resolves without restriction":
			{
				migrateBetterAuth: scopeBetterAuthOptions,
				async test() {
					const auth = await getAuth();
					const ctx = await auth.$context;

					const row = (await adapter.findOne<OAuthResourceRecord>({
						model: "oauthResource",
						where: [{ field: "identifier", value: identifier }],
					})) as OAuthResourceRecord | null;

					expect(row).not.toBeNull();
					expect(row?.allowedScopes).toEqual([]);

					const policy = await resolveResourcePolicy(
						{
							context: ctx,
							body: {},
						} as never,
						oauthOpts,
						{
							resource: identifier,
							clientId: "client-x",
							requestedScopes: ["read", "write"],
						},
					);
					expect(policy.effectiveScopes).toEqual(["read", "write"]);
					expect(policy.audienceClaim).toBe(identifier);
				},
			},
		"rejects allowedScopes: [] in config and admin schemas": {
			migrateBetterAuth: scopeBetterAuthOptions,
			async test() {
				const emptyIdentifier = `${ROOT}/empty`;
				expect(() =>
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						enforcePerClientResources: false,
						resources: [{ identifier: emptyIdentifier, allowedScopes: [] }],
					} as never),
				).toThrowError(/disabled: true/);

				const dummyOpts = {
					loginPage: "/login",
					consentPage: "/consent",
					enforcePerClientResources: false,
				} as never;

				const createEndpoint = adminCreateOAuthResource(dummyOpts);
				const updateEndpoint = adminUpdateOAuthResource(dummyOpts);

				const createResult = createEndpoint.options.body.safeParse({
					identifier: emptyIdentifier,
					allowedScopes: [],
				});
				expect(createResult.success).toBe(false);
				if (!createResult.success) {
					expect(createResult.error.issues[0]?.message).toMatch(
						/disabled: true/,
					);
				}

				const updateResult = updateEndpoint.options.body.safeParse({
					allowedScopes: [],
				});
				expect(updateResult.success).toBe(false);
				if (!updateResult.success) {
					expect(updateResult.error.issues[0]?.message).toMatch(
						/disabled: true/,
					);
				}
			},
		},
		"updates a resource allowedScopes to ['read'] and clears to [] round-tripping on live adapter":
			{
				migrateBetterAuth: scopeBetterAuthOptions,
				async test() {
					const auth = await getAuth();
					const ctx = await auth.$context;

					const dynamicIdentifier = `${ROOT}/dynamic-roundtrip`;
					await adapter.create({
						model: "oauthResource",
						data: {
							identifier: dynamicIdentifier,
							name: "Dynamic Resource",
							allowedScopes: [],
						},
					});

					// Update to ["read"]
					await adapter.update({
						model: "oauthResource",
						where: [{ field: "identifier", value: dynamicIdentifier }],
						update: { allowedScopes: ["read"] },
					});

					const updatedRow = (await adapter.findOne<OAuthResourceRecord>({
						model: "oauthResource",
						where: [{ field: "identifier", value: dynamicIdentifier }],
					})) as OAuthResourceRecord | null;

					expect(updatedRow).not.toBeNull();
					expect(updatedRow?.allowedScopes).toEqual(["read"]);

					const restrictedPolicy = await resolveResourcePolicy(
						{
							context: ctx,
							body: {},
						} as never,
						oauthOpts,
						{
							resource: dynamicIdentifier,
							clientId: "client-x",
							requestedScopes: ["read", "write"],
						},
					);
					expect(restrictedPolicy.effectiveScopes).toEqual(["read"]);

					// Clear back to []
					await adapter.update({
						model: "oauthResource",
						where: [{ field: "identifier", value: dynamicIdentifier }],
						update: { allowedScopes: [] },
					});

					const clearedRow = (await adapter.findOne<OAuthResourceRecord>({
						model: "oauthResource",
						where: [{ field: "identifier", value: dynamicIdentifier }],
					})) as OAuthResourceRecord | null;

					expect(clearedRow).not.toBeNull();
					expect(clearedRow?.allowedScopes).toEqual([]);

					const clearedPolicy = await resolveResourcePolicy(
						{
							context: ctx,
							body: {},
						} as never,
						oauthOpts,
						{
							resource: dynamicIdentifier,
							clientId: "client-x",
							requestedScopes: ["read", "write"],
						},
					);
					expect(clearedPolicy.effectiveScopes).toEqual(["read", "write"]);
				},
			},
		"admin create omitting allowedScopes and admin update with allowedScopes: null round-trips through live adapter":
			{
				migrateBetterAuth: scopeBetterAuthOptions,
				async test() {
					const auth = await getAuth();
					const ctx = await auth.$context;

					const user = await adapter.create({
						model: "user",
						data: {
							id: "admin-scope-user",
							email: "admin-scope@example.com",
							name: "Admin User",
							emailVerified: true,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					});
					const token = "admin-session-token-roundtrip";
					await adapter.create({
						model: "session",
						data: {
							id: "admin-session-roundtrip",
							userId: user.id,
							token,
							expiresAt: new Date(Date.now() + 60 * 60 * 1000),
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					});

					const signature = await makeSignature(token, ctx.secret);
					const cookieName = ctx.authCookies.sessionToken.name;
					const headers = new Headers({
						cookie: `${cookieName}=${token}.${signature}`,
					});

					const adminIdentifier = `${ROOT}/admin-roundtrip`;
					// 1. adminCreateOAuthResource omitting allowedScopes -> persists []
					await (auth.api as any).adminCreateOAuthResource({
						body: {
							identifier: adminIdentifier,
							name: "Admin Resource",
						},
						headers,
					});

					const rowAfterCreate = (await adapter.findOne<OAuthResourceRecord>({
						model: "oauthResource",
						where: [{ field: "identifier", value: adminIdentifier }],
					})) as OAuthResourceRecord | null;
					expect(rowAfterCreate).not.toBeNull();
					expect(rowAfterCreate?.allowedScopes).toEqual([]);

					// 2. adminUpdateOAuthResource setting allowedScopes: ["read", "write"]
					await (auth.api as any).adminUpdateOAuthResource({
						params: { identifier: adminIdentifier },
						body: { allowedScopes: ["read", "write"] },
						headers,
					});

					const rowWithScopes = (await adapter.findOne<OAuthResourceRecord>({
						model: "oauthResource",
						where: [{ field: "identifier", value: adminIdentifier }],
					})) as OAuthResourceRecord | null;
					expect(rowWithScopes?.allowedScopes).toEqual(["read", "write"]);

					// 3. adminUpdateOAuthResource with allowedScopes: null -> clears back to []
					await (auth.api as any).adminUpdateOAuthResource({
						params: { identifier: adminIdentifier },
						body: { allowedScopes: null },
						headers,
					});

					const rowAfterClear = (await adapter.findOne<OAuthResourceRecord>({
						model: "oauthResource",
						where: [{ field: "identifier", value: adminIdentifier }],
					})) as OAuthResourceRecord | null;
					expect(rowAfterClear).not.toBeNull();
					expect(rowAfterClear?.allowedScopes).toEqual([]);

					// 4. Verification that policy resolution resolves without restriction
					const policy = await resolveResourcePolicy(
						{
							context: ctx,
							body: {},
						} as never,
						oauthOpts,
						{
							resource: adminIdentifier,
							clientId: "client-x",
							requestedScopes: ["read", "write"],
						},
					);
					expect(policy.effectiveScopes).toEqual(["read", "write"]);
				},
			},
	}),
);
