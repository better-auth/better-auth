import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import { sso } from "@better-auth/sso";
import type { Account, DBTransactionAdapter } from "better-auth";
import { getHttpTestInstance } from "better-auth/test";
import { Kysely } from "kysely";
import { OAuth2Server } from "oauth2-mock-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getMigrations } from "../../better-auth/src/db/get-migration";
import { acquireActiveSCIMUserLink, scim } from ".";
import type { SCIMConnectionBinding, SCIMSubject } from "./persistence";

const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_MEDIA_TYPE = "application/scim+json";
const WORKFORCE_CONNECTION_ID = "workforce";
const WORKFORCE_TOKEN = "workforce-scim-token";
const CONTRACTOR_CONNECTION_ID = "contractors";
const CONTRACTOR_TOKEN = "contractors-scim-token";

type CookieJar = Map<string, string>;
type IncrementOneInput = Parameters<DBTransactionAdapter["incrementOne"]>[0];

interface SCIMUserResponse {
	id: string;
	active: boolean;
}

interface SessionResponse {
	user: {
		id: string;
		email: string;
		name: string;
	};
}

function storeResponseCookies(response: Response, cookies: CookieJar): void {
	for (const setCookie of response.headers.getSetCookie()) {
		const attributesIndex = setCookie.indexOf(";");
		const cookie =
			attributesIndex < 0 ? setCookie : setCookie.slice(0, attributesIndex);
		const separatorIndex = cookie.indexOf("=");
		if (separatorIndex < 1) continue;
		const name = cookie.slice(0, separatorIndex);
		const value = cookie.slice(separatorIndex + 1);
		if (value) cookies.set(name, value);
		else cookies.delete(name);
	}
}

function getCookieHeader(cookies: CookieJar): string {
	return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function readJSON<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

function createSCIMHeaders(token: string): HeadersInit {
	return {
		accept: SCIM_MEDIA_TYPE,
		authorization: `Bearer ${token}`,
		"content-type": SCIM_MEDIA_TYPE,
	};
}

function createDeferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe("SCIM-provisioned SSO authentication over HTTP", () => {
	const identityProvider = new OAuth2Server();
	const externalId = "directory-user-1";

	beforeAll(async () => {
		await identityProvider.issuer.keys.generate("RS256");
		identityProvider.service.on("beforeUserinfo", (response) => {
			response.body = {
				sub: externalId,
				email: "employee@identity-provider.example",
				name: "Identity Provider Employee",
				email_verified: true,
			};
			response.statusCode = 200;
		});
		identityProvider.service.on("beforeTokenSigning", (token) => {
			token.payload.sub = externalId;
			token.payload.email = "employee@identity-provider.example";
			token.payload.name = "Identity Provider Employee";
			token.payload.email_verified = true;
		});
		await identityProvider.start(undefined, "127.0.0.1");
	});

	afterAll(async () => {
		await identityProvider.stop();
	});

	it("authenticates only the active User owned by the paired SCIM connection", async ({
		onTestFinished,
	}) => {
		let resolverPause:
			| {
					reached: ReturnType<typeof createDeferred>;
					release: ReturnType<typeof createDeferred>;
			  }
			| undefined;
		const tempDirectory = mkdtempSync(join(tmpdir(), "better-auth-scim-sso-"));
		const databasePath = join(tempDirectory, "auth.sqlite");
		const sqlite = new DatabaseSync(databasePath);
		sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
		const db = new Kysely({
			dialect: new NodeSqliteDialect({ database: sqlite }),
		});
		const lifecycleSqlite = new DatabaseSync(databasePath);
		lifecycleSqlite.exec(
			"PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
		);
		const lifecycleDB = new Kysely({
			dialect: new NodeSqliteDialect({ database: lifecycleSqlite }),
		});
		const createSCIMPlugin = () =>
			scim({
				connections: [
					{
						id: WORKFORCE_CONNECTION_ID,
						credentials: [
							{
								type: "bearer",
								id: "workforce-token",
								token: WORKFORCE_TOKEN,
							},
						],
					},
					{
						id: CONTRACTOR_CONNECTION_ID,
						credentials: [
							{
								type: "bearer",
								id: "contractors-token",
								token: CONTRACTOR_TOKEN,
							},
						],
					},
				],
			});
		const instance = await getHttpTestInstance(
			{
				database: { db, type: "sqlite", transaction: true },
				trustedOrigins: [identityProvider.issuer.url!],
				plugins: [
					createSCIMPlugin(),
					sso({
						disableImplicitSignUp: true,
						defaultSSO: [
							{
								domain: "example.com",
								providerId: "workforce",
								oidcConfig: {
									issuer: identityProvider.issuer.url!,
									clientId: "workforce-client",
									clientSecret: "workforce-secret",
									pkce: false,
									discoveryEndpoint: `${identityProvider.issuer.url}/.well-known/openid-configuration`,
								},
							},
						],
						resolveUser: async (input, context) => {
							if (input.providerId !== "workforce") {
								return { action: "continue" };
							}
							const incrementOne: DBTransactionAdapter["incrementOne"] = async <
								Row,
							>(
								query: IncrementOneInput,
							) => {
								if (resolverPause && query.model === "scimSubject") {
									const pause = resolverPause;
									resolverPause = undefined;
									pause.reached.resolve();
									await pause.release.promise;
								}
								return context.database.incrementOne<Row>(query);
							};
							const link = await acquireActiveSCIMUserLink(
								{
									connectionId: WORKFORCE_CONNECTION_ID,
									externalId: input.accountKey.providerAccountId,
								},
								{
									database: {
										findOne: context.database.findOne,
										incrementOne,
									},
								},
							);
							return link
								? {
										action: "link",
										userId: link.userId,
										profile: "preserve",
									}
								: {
										action: "reject",
										code: "SCIM_USER_NOT_ACTIVE",
										message: "This directory user is not active",
									};
						},
					}),
				],
			},
			{ disableTestUser: true, testWith: "sqlite" },
		);
		const migrations = await getMigrations(instance.auth.options);
		await migrations.runMigrations();
		const lifecycleInstance = await getHttpTestInstance(
			{
				database: { db: lifecycleDB, type: "sqlite", transaction: true },
				plugins: [createSCIMPlugin()],
			},
			{ disableTestUser: true, testWith: "sqlite" },
		);
		onTestFinished(async () => {
			await Promise.all([
				instance.server.close(),
				lifecycleInstance.server.close(),
			]);
			await Promise.all([db.destroy(), lifecycleDB.destroy()]);
			rmSync(tempDirectory, { recursive: true, force: true });
		});

		async function provisionSCIMUser(
			token: string,
			userName: string,
		): Promise<SCIMUserResponse> {
			const response = await fetch(
				`${lifecycleInstance.baseURL}/api/auth/scim/v2/Users`,
				{
					method: "POST",
					headers: createSCIMHeaders(token),
					body: JSON.stringify({
						schemas: [SCIM_USER_SCHEMA],
						externalId,
						userName,
						name: { formatted: "Provisioned Employee" },
						active: true,
					}),
				},
			);
			expect(response.status).toBe(201);
			return readJSON<SCIMUserResponse>(response);
		}

		async function setSCIMUserActive(
			userId: string,
			active: boolean,
		): Promise<void> {
			const response = await fetch(
				`${lifecycleInstance.baseURL}/api/auth/scim/v2/Users/${encodeURIComponent(userId)}`,
				{
					method: "PATCH",
					headers: createSCIMHeaders(WORKFORCE_TOKEN),
					body: JSON.stringify({
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [{ op: "replace", path: "active", value: active }],
					}),
				},
			);
			expect(response.status).toBe(204);
		}

		async function deleteSCIMUser(userId: string): Promise<void> {
			const response = await fetch(
				`${lifecycleInstance.baseURL}/api/auth/scim/v2/Users/${encodeURIComponent(userId)}`,
				{
					method: "DELETE",
					headers: createSCIMHeaders(WORKFORCE_TOKEN),
				},
			);
			expect(response.status).toBe(204);
		}

		async function initiateSSO() {
			const cookies: CookieJar = new Map();
			const signInResponse = await fetch(
				`${instance.baseURL}/api/auth/sign-in/sso`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: instance.baseURL,
					},
					body: JSON.stringify({
						providerId: "workforce",
						callbackURL: `${instance.baseURL}/employee`,
					}),
				},
			);
			storeResponseCookies(signInResponse, cookies);
			expect(signInResponse.status).toBe(200);
			const signIn = await readJSON<{ url: string }>(signInResponse);
			const authorization = await fetch(signIn.url, { redirect: "manual" });
			const callbackURL = authorization.headers.get("location");
			if (!callbackURL) {
				throw new Error("OIDC provider did not return a callback URL");
			}
			return { callbackURL, cookies };
		}

		async function completeSSO(flow: Awaited<ReturnType<typeof initiateSSO>>) {
			const callback = await fetch(flow.callbackURL, {
				headers: { cookie: getCookieHeader(flow.cookies) },
				redirect: "manual",
			});
			expect(callback.status).toBe(302);
			storeResponseCookies(callback, flow.cookies);
			return { callback, cookies: flow.cookies };
		}

		async function signInWithSSO() {
			return completeSSO(await initiateSSO());
		}

		async function getSession(cookies: CookieJar) {
			const response = await fetch(`${instance.baseURL}/api/auth/get-session`, {
				headers: { cookie: getCookieHeader(cookies) },
			});
			expect(response.status).toBe(200);
			return readJSON<SessionResponse | null>(response);
		}

		async function expectRejectedSignIn() {
			const recordsBefore = {
				users: await lifecycleInstance.db.count({ model: "user", where: [] }),
				accounts: await lifecycleInstance.db.count({
					model: "account",
					where: [],
				}),
				sessions: await lifecycleInstance.db.count({
					model: "session",
					where: [],
				}),
			};
			const signIn = await signInWithSSO();
			const location = signIn.callback.headers.get("location");
			if (!location) throw new Error("SSO rejection did not redirect");
			expect(
				new URL(location, instance.baseURL).searchParams.get("error"),
			).toBe("SCIM_USER_NOT_ACTIVE");
			expect(await getSession(signIn.cookies)).toBeNull();
			expect({
				users: await lifecycleInstance.db.count({
					model: "user",
					where: [],
				}),
				accounts: await lifecycleInstance.db.count({
					model: "account",
					where: [],
				}),
				sessions: await lifecycleInstance.db.count({
					model: "session",
					where: [],
				}),
			}).toEqual(recordsBefore);
		}

		async function getFenceRevisions() {
			const subject = await lifecycleInstance.db.findOne<SCIMSubject>({
				model: "scimSubject",
				where: [],
			});
			const connection =
				await lifecycleInstance.db.findOne<SCIMConnectionBinding>({
					model: "scimConnectionBinding",
					where: [{ field: "connectionId", value: WORKFORCE_CONNECTION_ID }],
				});
			return {
				subject: subject?.revision,
				connection: connection?.decommissionRevision,
			};
		}

		const provisioned = await provisionSCIMUser(
			WORKFORCE_TOKEN,
			"provisioned.employee@example.com",
		);
		expect(await lifecycleInstance.db.count({ model: "user", where: [] })).toBe(
			1,
		);
		expect(
			await lifecycleInstance.db.count({ model: "account", where: [] }),
		).toBe(0);

		const pauseReached = createDeferred();
		const releaseResolver = createDeferred();
		resolverPause = { reached: pauseReached, release: releaseResolver };
		const conflictedFlow = await initiateSSO();
		const conflictedCallback = completeSSO(conflictedFlow);
		await pauseReached.promise;
		let lifecycleMutationError: unknown;
		let stateAfterCommittedDeactivation:
			| {
					revisions: Awaited<ReturnType<typeof getFenceRevisions>>;
					accounts: number;
					sessions: number;
			  }
			| undefined;
		try {
			await setSCIMUserActive(provisioned.id, false);
			stateAfterCommittedDeactivation = {
				revisions: await getFenceRevisions(),
				accounts: await lifecycleInstance.db.count({
					model: "account",
					where: [],
				}),
				sessions: await lifecycleInstance.db.count({
					model: "session",
					where: [],
				}),
			};
		} catch (error) {
			lifecycleMutationError = error;
		} finally {
			releaseResolver.resolve();
		}
		const conflictedSignIn = await conflictedCallback;
		if (lifecycleMutationError) throw lifecycleMutationError;
		expect(
			new URL(
				conflictedSignIn.callback.headers.get("location")!,
				instance.baseURL,
			).searchParams.get("error"),
		).toBe("SSO_USER_RESOLUTION_FAILED");
		expect(await getSession(conflictedSignIn.cookies)).toBeNull();
		expect(stateAfterCommittedDeactivation).toMatchObject({
			accounts: 0,
			sessions: 0,
		});
		expect({
			revisions: await getFenceRevisions(),
			accounts: await lifecycleInstance.db.count({
				model: "account",
				where: [],
			}),
			sessions: await lifecycleInstance.db.count({
				model: "session",
				where: [],
			}),
		}).toEqual(stateAfterCommittedDeactivation);
		await expectRejectedSignIn();
		await setSCIMUserActive(provisioned.id, true);

		const concurrentFlows = await Promise.all([initiateSSO(), initiateSSO()]);
		const concurrentSignIns = await Promise.all(
			concurrentFlows.map((flow) => completeSSO(flow)),
		);
		expect(
			concurrentSignIns.map(({ callback }) => callback.headers.get("location")),
		).toEqual([`${instance.baseURL}/employee`, `${instance.baseURL}/employee`]);
		const concurrentSessions = await Promise.all(
			concurrentSignIns.map(({ cookies }) => getSession(cookies)),
		);
		const firstSession = concurrentSessions[0];
		expect(firstSession?.user).toMatchObject({
			email: "provisioned.employee@example.com",
			name: "Provisioned Employee",
		});
		if (!firstSession) throw new Error("SSO sign-in did not create a session");
		const provisionedUserId = firstSession.user.id;
		expect(concurrentSessions).toEqual([
			expect.objectContaining({
				user: expect.objectContaining({ id: provisionedUserId }),
			}),
			expect.objectContaining({
				user: expect.objectContaining({ id: provisionedUserId }),
			}),
		]);
		expect(await instance.db.count({ model: "session", where: [] })).toBe(2);
		expect(await instance.db.count({ model: "user", where: [] })).toBe(1);
		expect(await instance.db.count({ model: "account", where: [] })).toBe(1);
		const account = await instance.db.findOne<Account>({
			model: "account",
			where: [],
		});
		expect(account).toMatchObject({
			issuer: identityProvider.issuer.url,
			providerAccountId: externalId,
			providerId: "workforce",
			userId: provisionedUserId,
		});

		await setSCIMUserActive(provisioned.id, false);
		expect(await instance.db.count({ model: "session", where: [] })).toBe(0);
		await expectRejectedSignIn();
		await setSCIMUserActive(provisioned.id, true);
		expect(await getSession((await signInWithSSO()).cookies)).toMatchObject({
			user: { id: provisionedUserId },
		});

		await deleteSCIMUser(provisioned.id);
		expect(await instance.db.count({ model: "session", where: [] })).toBe(0);
		await expectRejectedSignIn();
		await provisionSCIMUser(
			CONTRACTOR_TOKEN,
			"contractor.employee@example.com",
		);
		await expectRejectedSignIn();

		const restored = await provisionSCIMUser(
			WORKFORCE_TOKEN,
			"restored.employee@example.com",
		);
		expect(restored.id).not.toBe(provisioned.id);
		const restoredSession = await getSession((await signInWithSSO()).cookies);
		expect(restoredSession?.user).toMatchObject({
			id: provisionedUserId,
			email: "restored.employee@example.com",
		});
		expect(await instance.db.count({ model: "user", where: [] })).toBe(2);
		expect(await instance.db.count({ model: "account", where: [] })).toBe(1);
		expect(
			await instance.db.findOne<Account>({ model: "account", where: [] }),
		).toMatchObject({
			issuer: identityProvider.issuer.url,
			providerAccountId: externalId,
			providerId: "workforce",
			userId: provisionedUserId,
		});
	});
});
