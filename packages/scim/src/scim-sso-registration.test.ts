import { DatabaseSync } from "node:sqlite";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import { sso } from "@better-auth/sso";
import type { BetterAuthOptions, DBAdapter } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { getHttpTestInstance } from "better-auth/test";
import { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { scim } from ".";

const SHARED_PROVIDER_ID = "shared-enterprise";
const TEST_CERT = `MIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiUMA0Gcm9markup
temporary cert for testing`;

function getCookieHeader(response: Response): string {
	return response.headers
		.getSetCookie()
		.map((value) => value.split(";", 1)[0])
		.join("; ");
}

async function getProvisioningCounts(
	db: Awaited<ReturnType<typeof getHttpTestInstance>>["db"],
) {
	const [
		connections,
		tombstones,
		subjects,
		users,
		groups,
		memberships,
		grants,
	] = await Promise.all([
		db.count({ model: "scimConnectionBinding", where: [] }),
		db.count({ model: "scimIdentityTombstone", where: [] }),
		db.count({ model: "scimSubject", where: [] }),
		db.count({ model: "scimUser", where: [] }),
		db.count({ model: "scimGroup", where: [] }),
		db.count({ model: "scimGroupMember", where: [] }),
		db.count({ model: "scimProjectionGrant", where: [] }),
	]);
	return {
		connections,
		tombstones,
		subjects,
		users,
		groups,
		memberships,
		grants,
	};
}

describe("SCIM and SSO registration coexistence", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/pull/10224
	 * @see https://github.com/better-auth/better-auth/pull/10390
	 */
	it("registers an SSO provider whose providerId equals a SCIM connection ID", async ({
		onTestFinished,
	}) => {
		const sqlite = new DatabaseSync(":memory:");
		const database = new Kysely({
			dialect: new NodeSqliteDialect({ database: sqlite }),
		});
		const queriedModels: string[] = [];
		const createAdapter = kyselyAdapter(database, {
			type: "sqlite",
			transaction: true,
		});
		const instrumentedDatabase = (options: BetterAuthOptions): DBAdapter => {
			const adapter = createAdapter(options);
			const findOne: DBAdapter["findOne"] = async (input) => {
				queriedModels.push(input.model);
				if (input.model === "scimProvider") {
					throw new Error("Unexpected query of removed scimProvider model");
				}
				return adapter.findOne(input);
			};
			return { ...adapter, findOne };
		};
		const plugins = [
			scim({
				connections: [
					{
						id: SHARED_PROVIDER_ID,
						credentials: [
							{
								type: "bearer",
								id: "shared-scim-credential",
								token: "shared-scim-token",
							},
						],
					},
				],
			}),
			sso(),
		];
		await (
			await getMigrations({
				database: {
					db: database,
					type: "sqlite",
					transaction: true,
				},
				emailAndPassword: { enabled: true },
				plugins,
			})
		).runMigrations();
		const instance = await getHttpTestInstance(
			{
				database: instrumentedDatabase,
				emailAndPassword: { enabled: true },
				plugins,
			},
			{ disableTestUser: true, testWith: "sqlite" },
		);
		onTestFinished(async () => {
			await instance.server.close();
			await database.destroy();
		});
		const tableNames = sqlite
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
			.all()
			.map((row) => String(row.name));
		expect(
			tableNames.map((name) => name.replaceAll("_", "").toLowerCase()),
		).not.toContain("scimprovider");

		const signUp = await fetch(`${instance.baseURL}/api/auth/sign-up/email`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: instance.baseURL,
			},
			body: JSON.stringify({
				email: "sso-admin@example.com",
				password: "password123",
				name: "SSO Admin",
			}),
		});
		expect(signUp.status).toBe(200);
		const cookie = getCookieHeader(signUp);
		expect(cookie).not.toBe("");

		const before = {
			ssoProviders: await instance.db.count({
				model: "ssoProvider",
				where: [],
			}),
			accounts: await instance.db.findMany<{
				id: string;
				providerId: string;
				userId: string;
			}>({ model: "account", where: [] }),
			provisioning: await getProvisioningCounts(instance.db),
		};

		const response = await fetch(`${instance.baseURL}/api/auth/sso/register`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				cookie,
				origin: instance.baseURL,
			},
			body: JSON.stringify({
				providerId: SHARED_PROVIDER_ID,
				issuer: "https://idp.example.com",
				domain: "example.com",
				samlConfig: {
					entryPoint: "https://idp.example.com/sso",
					cert: TEST_CERT,
					callbackUrl: `${instance.baseURL}/api/auth/sso/callback`,
					audience: "better-auth-slice-c",
					wantAssertionsSigned: true,
					idpMetadata: { entityID: "https://idp.example.com" },
					spMetadata: {},
				},
			}),
		});
		const responseText = await response.text();
		const body = responseText
			? (JSON.parse(responseText) as Record<string, unknown>)
			: {};

		expect(response.status).toBe(200);
		expect(queriedModels).not.toContain("scimProvider");
		expect(body).toMatchObject({ providerId: SHARED_PROVIDER_ID });
		const ssoProviders = await instance.db.findMany<{
			id: string;
			providerId: string;
			userId: string;
		}>({ model: "ssoProvider", where: [] });
		expect(before.ssoProviders).toBe(0);
		expect(ssoProviders).toEqual([
			expect.objectContaining({ providerId: SHARED_PROVIDER_ID }),
		]);
		expect(await instance.db.findMany({ model: "account", where: [] })).toEqual(
			before.accounts,
		);
		expect(
			before.accounts.some(
				({ providerId }) => providerId === SHARED_PROVIDER_ID,
			),
		).toBe(false);
		expect(before.provisioning).toEqual({
			connections: 0,
			tombstones: 0,
			subjects: 0,
			users: 0,
			groups: 0,
			memberships: 0,
			grants: 0,
		});
		expect(await getProvisioningCounts(instance.db)).toEqual(
			before.provisioning,
		);
	});
});
