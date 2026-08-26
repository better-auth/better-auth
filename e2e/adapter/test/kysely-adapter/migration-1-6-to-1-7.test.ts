import { DatabaseSync } from "node:sqlite";
import { oauthProvider } from "@better-auth/oauth-provider";
import { scim } from "@better-auth/scim";
import { betterAuth } from "better-auth";
import { getMigrations, migrateFrom16 } from "better-auth/db/migration";
import { jwt, organization } from "better-auth/plugins";
import { betterAuth as betterAuth1630 } from "better-auth-1-6-30";
import { getMigrations as getMigrations1630 } from "better-auth-1-6-30/db/migration";
import {
	oidcProvider as oidcProvider1630,
	organization as organization1630,
} from "better-auth-1-6-30/plugins";
import { betterAuth as betterAuth170 } from "better-auth-1-7-0";
import { getMigrations as getMigrations170 } from "better-auth-1-7-0/db/migration";
import { scim as scim1630 } from "better-auth-scim-1-6-30";
import type { KyselyPlugin } from "kysely";
import {
	Kysely,
	MssqlDialect,
	MysqlDialect,
	PostgresDialect,
	sql,
} from "kysely";
import type { RowDataPacket } from "mysql2/promise";
import { createPool } from "mysql2/promise";
import { Pool } from "pg";
import * as Tarn from "tarn";
import * as Tedious from "tedious";
import { expect, it } from "vitest";
import type {
	MigrationDatabase,
	PublishedOAuthProviderApi,
} from "./published-1-6-30-fixture";
import { seedPublishedOAuthProviderData } from "./published-1-6-30-fixture";

let databaseSequence = 0;

interface PublishedOrganizationApi {
	createOrganization(input: {
		body: {
			name: string;
			slug: string;
			userId: string;
		};
	}): Promise<{ id: string } | null>;
}

function configurePublishedReferenceField(field: {
	references?: { onDelete?: string | undefined } | undefined;
	sortable?: boolean | undefined;
}) {
	field.sortable = true;
	if (field.references) field.references.onDelete = "no action";
}

function createDatabaseName() {
	databaseSequence += 1;
	const databaseName = `better_auth_16_to_17_postgres_${process.pid}_${databaseSequence}`;
	if (!/^[a-z0-9_]+$/.test(databaseName)) {
		throw new Error(`Unsafe migration test database name: ${databaseName}`);
	}
	return databaseName;
}

function createMssqlConnectionFactory(database: string) {
	return () =>
		new Tedious.Connection({
			authentication: {
				options: {
					password: "Password123!",
					userName: "sa",
				},
				type: "default",
			},
			options: {
				connectTimeout: 30_000,
				database,
				encrypt: false,
				port: 1433,
				requestTimeout: 30_000,
				trustServerCertificate: true,
			},
			server: "localhost",
		});
}

function createMssqlDatabase(database: string) {
	return new Kysely<unknown>({
		dialect: new MssqlDialect({
			tarn: {
				...Tarn,
				options: {
					max: 5,
					min: 0,
				},
			},
			tedious: {
				...Tedious,
				connectionFactory: createMssqlConnectionFactory(database),
				TYPES: {
					...Tedious.TYPES,
					DateTime: Tedious.TYPES.DateTime2,
				},
			},
		}),
	});
}

async function seedPublishedScimAccount({
	accountIdField,
	database,
	emailDomain,
}: {
	accountIdField?: string | undefined;
	database: MigrationDatabase;
	emailDomain: string;
}) {
	const auth1630 = betterAuth1630({
		account: accountIdField
			? { fields: { accountId: accountIdField } }
			: undefined,
		baseURL: "http://localhost:3000",
		database,
		emailAndPassword: { enabled: true },
		plugins: [scim1630()],
	});
	await (await getMigrations1630(auth1630.options)).runMigrations();
	const administrator = await auth1630.api.signUpEmail({
		body: {
			email: `scim-admin@${emailDomain}`,
			name: "SCIM Administrator",
			password: "correct-horse-battery-staple",
		},
	});
	const administratorSignIn = await auth1630.api.signInEmail({
		body: {
			email: `scim-admin@${emailDomain}`,
			password: "correct-horse-battery-staple",
		},
		returnHeaders: true,
	});
	const administratorCookie = administratorSignIn.headers.getSetCookie()[0];
	if (!administratorCookie) {
		throw new Error("Expected the 1.6.30 administrator session cookie");
	}
	const generated = await auth1630.api.generateSCIMToken({
		body: { providerId: "workforce" },
		headers: { cookie: administratorCookie },
	});
	const provisionedUser = await auth1630.api.createSCIMUser({
		body: {
			name: { formatted: "Ada Provisioned" },
			userName: `ada-provisioned@${emailDomain}`,
		},
		headers: { authorization: `Bearer ${generated.scimToken}` },
	});
	const sourceContext = await auth1630.$context;
	const legacyScimAccount = await sourceContext.adapter.findOne<{
		id: string;
		userId: string;
	}>({
		model: "account",
		where: [{ field: "providerId", value: "workforce" }],
	});
	if (!legacyScimAccount) {
		throw new Error("Expected the 1.6.30 SCIM authentication account");
	}
	return { administrator, legacyScimAccount, provisionedUser };
}

function createCurrentScimPlugin(userId: string) {
	return scim({
		connections: [
			{
				credentials: [
					{
						id: "workforce-1-7-token",
						token: "workforce-1-7-token",
						type: "bearer",
					},
				],
				id: "workforce",
			},
		],
		identity: {
			resolveUser: () => ({
				action: "link",
				profile: "preserve",
				userId,
			}),
		},
	});
}

async function exerciseAccountAndOrganizationMigration({
	afterMigrate,
	beforeMigrate,
	database,
	emailDomain,
	nameSuffix,
}: {
	afterMigrate?: (() => Promise<void> | void) | undefined;
	beforeMigrate?: (() => Promise<void> | void) | undefined;
	database: MigrationDatabase;
	emailDomain: string;
	nameSuffix: string;
}) {
	const auth1630 = betterAuth1630({
		baseURL: "http://localhost:3000",
		database,
		emailAndPassword: {
			enabled: true,
		},
		plugins: [
			organization1630({
				teams: {
					enabled: true,
				},
			}),
		],
	});
	await (await getMigrations1630(auth1630.options)).runMigrations();

	const sourceUsers = [];
	for (const user of [
		{ email: `ada@${emailDomain}`, name: `Ada ${nameSuffix}` },
		{ email: `grace@${emailDomain}`, name: `Grace ${nameSuffix}` },
	]) {
		sourceUsers.push(
			await auth1630.api.signUpEmail({
				body: {
					...user,
					password: "correct-horse-battery-staple",
				},
			}),
		);
	}
	const publishedOrganizationApi =
		auth1630.api as unknown as PublishedOrganizationApi;
	const sourceOrganization = await publishedOrganizationApi.createOrganization({
		body: {
			name: `${nameSuffix} migration fixture`,
			slug: `${emailDomain.replaceAll(".", "-")}-migration-fixture`,
			userId: sourceUsers[0]!.user.id,
		},
	});
	if (!sourceOrganization) {
		throw new Error("Published 1.6.30 did not create the organization fixture");
	}
	const sourceContext = await auth1630.$context;
	const sourceTeam = await sourceContext.adapter.findOne<{ id: string }>({
		model: "team",
		where: [{ field: "organizationId", value: sourceOrganization.id }],
	});
	if (!sourceTeam) {
		throw new Error("Published 1.6.30 did not create the default team fixture");
	}
	await beforeMigrate?.();

	const auth17 = betterAuth({
		account: { identityStrategy: "provider-id" },
		baseURL: "http://localhost:3000",
		database,
		emailAndPassword: {
			enabled: true,
		},
		plugins: [
			organization({
				teams: {
					enabled: true,
					maximumMembersPerTeam: 2,
				},
			}),
		],
	});
	const result = await migrateFrom16(auth17.options, {});

	expect(result.accounts).toEqual({
		migrated: 2,
		providers: {
			credential: 2,
		},
	});
	await afterMigrate?.();

	for (const credentials of [
		{ email: `ada@${emailDomain}`, name: `Ada ${nameSuffix}` },
		{ email: `grace@${emailDomain}`, name: `Grace ${nameSuffix}` },
	]) {
		const signIn = await auth17.api.signInEmail({
			body: {
				email: credentials.email,
				password: "correct-horse-battery-staple",
			},
		});
		expect(signIn.user.name).toBe(credentials.name);
	}

	const addedMember = await auth17.api.addMember({
		body: {
			organizationId: sourceOrganization.id,
			role: "member",
			teamId: sourceTeam.id,
			userId: sourceUsers[1]!.user.id,
		},
	});
	expect(addedMember?.userId).toBe(sourceUsers[1]!.user.id);

	const currentContext = await auth17.$context;
	expect(
		await currentContext.adapter.count({
			model: "teamMember",
			where: [{ field: "teamId", value: sourceTeam.id }],
		}),
	).toBe(2);
	expect(
		await currentContext.adapter.findOne<{ memberCount: number }>({
			model: "team",
			where: [{ field: "id", value: sourceTeam.id }],
		}),
	).toMatchObject({ memberCount: 2 });

	const rerun = await migrateFrom16(auth17.options, {});
	expect(rerun.accounts).toEqual({
		migrated: 0,
		providers: {},
	});
}

async function exerciseOAuthProviderMigration({
	database,
	emailDomain,
	nameSuffix,
	beforeMigrate,
	configureCurrentPlugin,
	configurePublishedPlugin,
	consentStrategy = "migrate",
	legacyTableNames,
	sourceClientSecretStorage = "plain",
	targetClientSecretStorage = "hashed",
}: {
	database: MigrationDatabase;
	emailDomain: string;
	nameSuffix: string;
	beforeMigrate?: (() => Promise<void>) | undefined;
	configureCurrentPlugin?:
		| ((plugin: ReturnType<typeof oauthProvider>) => void)
		| undefined;
	configurePublishedPlugin?:
		| ((plugin: ReturnType<typeof oidcProvider1630>) => void)
		| undefined;
	consentStrategy?: "migrate" | "reauthorize" | undefined;
	legacyTableNames?:
		| {
				oauthApplication?: string | undefined;
		  }
		| undefined;
	sourceClientSecretStorage?: "encrypted" | "hashed" | "plain" | undefined;
	targetClientSecretStorage?: "encrypted" | "hashed" | undefined;
}) {
	const { legacyAccessToken, owner, registeredClient } =
		await seedPublishedOAuthProviderData({
			configurePublishedPlugin,
			database,
			emailDomain,
			nameSuffix,
			storeClientSecret: sourceClientSecretStorage,
		});

	const currentPlugin = oauthProvider({
		consentPage: "/consent",
		disableJwtPlugin: targetClientSecretStorage === "encrypted",
		loginPage: "/login",
		silenceWarnings: {
			oauthAuthServerConfig: true,
			openidConfig: true,
		},
		storeClientSecret: targetClientSecretStorage,
	});
	configureCurrentPlugin?.(currentPlugin);
	const auth17 = betterAuth({
		account: { identityStrategy: "provider-id" },
		baseURL: "http://localhost:3000",
		database,
		emailAndPassword: {
			enabled: true,
		},
		plugins: [jwt(), currentPlugin],
	});
	await beforeMigrate?.();
	await expect(
		migrateFrom16(auth17.options, { legacyTableNames }),
	).rejects.toThrow(
		"The 1.6 OAuth client migration requires the 1.6 client secret storage policy",
	);
	const migration = await migrateFrom16(auth17.options, {
		legacyTableNames,
		oauthProvider: {
			clients: "migrate",
			clientSecrets: {
				source: sourceClientSecretStorage,
				target: targetClientSecretStorage,
			},
			consents: consentStrategy,
			tokens: "revoke",
		},
	});

	expect(migration.oauthProvider).toMatchObject({
		clients: { migrated: 1 },
		consents:
			consentStrategy === "migrate"
				? { migrated: 1, reauthorizationRequired: 0 }
				: { migrated: 0, reauthorizationRequired: 1 },
		tokens: { revoked: 1 },
	});
	const ownerSignIn = await auth17.api.signInEmail({
		body: {
			email: `provider-owner@${emailDomain}`,
			password: "correct-horse-battery-staple",
		},
		returnHeaders: true,
	});
	const ownerCookie = ownerSignIn.headers.getSetCookie()[0];
	if (!ownerCookie) {
		throw new Error("Expected 1.7 sign-in to set an owner session cookie");
	}
	const migratedClient = await auth17.api.getOAuthClientPublic({
		headers: { cookie: ownerCookie },
		query: {
			client_id: registeredClient.client_id,
		},
	});
	expect(migratedClient).toMatchObject({
		client_id: registeredClient.client_id,
		client_name: `${nameSuffix} published migration client`,
	});
	if (!registeredClient.client_secret) {
		throw new Error("Expected the 1.6.30 client to have a client secret");
	}
	const introspectionResponse = await auth17.handler(
		new Request("http://localhost:3000/api/auth/oauth2/introspect", {
			body: new URLSearchParams({
				token: legacyAccessToken,
			}),
			headers: {
				authorization: `Basic ${btoa(
					`${registeredClient.client_id}:${registeredClient.client_secret}`,
				)}`,
				"content-type": "application/x-www-form-urlencoded",
			},
			method: "POST",
		}),
	);
	const introspectionBody = (await introspectionResponse.json()) as {
		active?: boolean;
	};
	expect(introspectionResponse.status, JSON.stringify(introspectionBody)).toBe(
		200,
	);
	expect(introspectionBody.active).toBe(false);

	const currentContext = await auth17.$context;
	expect(
		await currentContext.adapter.findOne<{ redirectUris: string[] }>({
			model: "oauthClient",
			where: [{ field: "clientId", value: registeredClient.client_id }],
		}),
	).toMatchObject({
		redirectUris: [`https://${emailDomain}/callback`],
	});
	const migratedConsent = await currentContext.adapter.findOne<{
		scopes: string[];
		userId: string;
	}>({
		model: "oauthConsent",
		where: [
			{ field: "clientId", value: registeredClient.client_id },
			{ field: "userId", value: owner.user.id },
		],
	});
	if (consentStrategy === "migrate") {
		expect(migratedConsent).toMatchObject({
			scopes: ["openid", "profile"],
			userId: owner.user.id,
		});
	} else {
		expect(migratedConsent).toBeNull();
	}
	expect(
		await currentContext.adapter.findOne({
			model: "oauthAccessToken",
			where: [{ field: "token", value: legacyAccessToken }],
		}),
	).toBeNull();

	const rerun = await migrateFrom16(auth17.options, {
		legacyTableNames,
		oauthProvider: {
			clients: "migrate",
			clientSecrets: {
				source: sourceClientSecretStorage,
				target: targetClientSecretStorage,
			},
			consents: consentStrategy,
			tokens: "revoke",
		},
	});
	expect(rerun.accounts).toEqual({
		migrated: 0,
		providers: {},
	});
	expect(rerun.oauthProvider).toBeUndefined();
}

it("migrates users created by published 1.6.30 and authenticates them through 1.7 on SQLite", {
	timeout: 60_000,
}, async () => {
	const database = new DatabaseSync(":memory:");
	try {
		await exerciseAccountAndOrganizationMigration({
			afterMigrate() {
				const schemaObjects = database
					.prepare(
						`SELECT name FROM sqlite_master
						 WHERE tbl_name = 'account' AND type IN ('index', 'trigger')`,
					)
					.all()
					.map((object) => (object as { name: string }).name);
				expect(schemaObjects).toEqual(
					expect.arrayContaining([
						"account_provider_id_idx",
						"account_provider_update_audit",
					]),
				);
				database.exec(`UPDATE account SET providerId = providerId`);
				expect(
					database
						.prepare(`SELECT COUNT(*) AS count FROM accountUpdateAudit`)
						.get(),
				).toEqual({ count: 2 });
			},
			beforeMigrate() {
				database.exec(`
					CREATE INDEX account_provider_id_idx ON account(providerId);
					CREATE TABLE accountUpdateAudit (
						id INTEGER PRIMARY KEY AUTOINCREMENT,
						accountId TEXT NOT NULL
					);
					CREATE TRIGGER account_provider_update_audit
					AFTER UPDATE OF providerId ON account
					BEGIN
						INSERT INTO accountUpdateAudit (accountId) VALUES (NEW.id);
					END;
				`);
			},
			database,
			emailDomain: "sqlite.example.com",
			nameSuffix: "SQLite",
		});
	} finally {
		database.close();
	}
});

it("preserves a published 1.6.30 provider-scoped account through the 1.7 cutover", {
	timeout: 60_000,
}, async () => {
	const database = new DatabaseSync(":memory:");
	try {
		const auth1630 = betterAuth1630({
			baseURL: "http://localhost:3000",
			database,
			emailAndPassword: { enabled: true },
		});
		await (await getMigrations1630(auth1630.options)).runMigrations();
		const source = await auth1630.api.signUpEmail({
			body: {
				email: "provider-scoped@sqlite.example.com",
				name: "Provider Scoped User",
				password: "correct-horse-battery-staple",
			},
		});
		const sourceContext = await auth1630.$context;
		await sourceContext.internalAdapter.linkAccount({
			accountId: "published-google-subject",
			providerId: "google",
			userId: source.user.id,
		});

		const auth17 = betterAuth({
			account: { identityStrategy: "provider-id" },
			baseURL: "http://localhost:3000",
			database,
			emailAndPassword: { enabled: true },
			socialProviders: {
				google: {
					clientId: "google-client",
					clientSecret: "google-secret",
				},
			},
		});
		const migration = await migrateFrom16(auth17.options, {});
		expect(migration.accounts).toEqual({
			migrated: 2,
			providers: { credential: 1, google: 1 },
		});

		const signIn = await auth17.api.signInEmail({
			body: {
				email: "provider-scoped@sqlite.example.com",
				password: "correct-horse-battery-staple",
			},
			returnHeaders: true,
		});
		const sessionCookie = signIn.headers.getSetCookie()[0];
		if (!sessionCookie) throw new Error("Expected 1.7 to create a session");
		const accounts = await auth17.api.listUserAccounts({
			headers: { cookie: sessionCookie },
		});
		expect(accounts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					providerId: "credential",
				}),
				expect.objectContaining({
					accountId: "published-google-subject",
					providerId: "google",
				}),
			]),
		);
		expect(
			database
				.prepare(
					`SELECT "providerId", "issuer" FROM "account" ORDER BY "providerId"`,
				)
				.all(),
		).toEqual([
			expect.objectContaining({
				issuer: "local:credential",
				providerId: "credential",
			}),
			expect.objectContaining({
				issuer: "local:oauth:google",
				providerId: "google",
			}),
		]);
	} finally {
		database.close();
	}
});

it("keeps a published 1.7.0 issuer database and runtime unchanged when the strategy is omitted", {
	timeout: 60_000,
}, async () => {
	const database = new DatabaseSync(":memory:");
	try {
		const publishedAuth = betterAuth170({
			baseURL: "http://localhost:3000",
			database,
			emailAndPassword: { enabled: true },
			socialProviders: {
				google: {
					clientId: "google-client",
					clientSecret: "google-secret",
				},
			},
		});
		await (await getMigrations170(publishedAuth.options)).runMigrations();
		const source = await publishedAuth.api.signUpEmail({
			body: {
				email: "issuer-scoped@sqlite.example.com",
				name: "Issuer Scoped User",
				password: "correct-horse-battery-staple",
			},
		});
		const publishedContext = await publishedAuth.$context;
		await publishedContext.internalAdapter.linkAccount({
			accountId: "published-google-subject",
			issuer: "https://accounts.google.com",
			providerId: "google",
			userId: source.user.id,
		});

		const identityBefore = database
			.prepare(
				`SELECT "id", "issuer", "accountId", "providerId", "userId"
				 FROM "account" ORDER BY "providerId"`,
			)
			.all();
		const issuerColumnBefore = database
			.prepare(`PRAGMA table_info("account")`)
			.all()
			.find((column) => (column as { name: string }).name === "issuer");
		const identityIndexBefore = database
			.prepare(`PRAGMA index_info("account_issuer_accountId_uidx")`)
			.all();
		expect(issuerColumnBefore).toMatchObject({ name: "issuer", notnull: 1 });
		expect(identityIndexBefore).toEqual([
			expect.objectContaining({ name: "issuer" }),
			expect.objectContaining({ name: "accountId" }),
		]);

		const currentAuth = betterAuth({
			baseURL: "http://localhost:3000",
			database,
			emailAndPassword: { enabled: true },
			socialProviders: {
				google: {
					clientId: "google-client",
					clientSecret: "google-secret",
				},
			},
		});
		const plan = await getMigrations(currentAuth.options, {
			throwOnUnsafe: false,
		});
		expect(plan.accountIdentity).toMatchObject({
			detectedStrategy: "issuer",
			migrationRequired: false,
			selectedStrategy: "issuer",
		});
		expect(plan.migrationBlockers).not.toContainEqual(
			expect.objectContaining({ code: "account-identity-strategy-mismatch" }),
		);
		expect(
			Object.keys(
				plan.toBeAdded.find(({ table }) => table === "account")?.fields ?? {},
			),
		).not.toContain("issuer");
		expect(plan.toBeAddedIndexes).not.toContainEqual(
			expect.objectContaining({
				index: expect.objectContaining({ columns: ["issuer", "accountId"] }),
				table: "account",
			}),
		);

		const migration = await migrateFrom16(currentAuth.options, {});
		expect(migration.accounts).toEqual({ migrated: 0, providers: {} });
		expect(
			database
				.prepare(
					`SELECT "id", "issuer", "accountId", "providerId", "userId"
					 FROM "account" ORDER BY "providerId"`,
				)
				.all(),
		).toEqual(identityBefore);
		expect(
			database
				.prepare(`PRAGMA index_info("account_issuer_accountId_uidx")`)
				.all(),
		).toEqual(identityIndexBefore);

		const signIn = await currentAuth.api.signInEmail({
			body: {
				email: "issuer-scoped@sqlite.example.com",
				password: "correct-horse-battery-staple",
			},
		});
		expect(signIn.user.id).toBe(source.user.id);
		const currentContext = await currentAuth.$context;
		await expect(
			currentContext.internalAdapter.findAccountByKey({
				accountId: "published-google-subject",
				issuer: "https://accounts.google.com",
			}),
		).resolves.toMatchObject({
			providerId: "google",
			userId: source.user.id,
		});
	} finally {
		database.close();
	}
});

it("rejects invalid OAuth data before changing the 1.6 database", async () => {
	const database = new DatabaseSync(":memory:");
	try {
		const auth1630 = betterAuth1630({
			baseURL: "http://localhost:3000",
			database,
			emailAndPassword: { enabled: true },
			plugins: [
				oidcProvider1630({
					allowDynamicClientRegistration: true,
					loginPage: "/login",
				}),
			],
		});
		await (await getMigrations1630(auth1630.options)).runMigrations();
		await auth1630.api.signUpEmail({
			body: {
				email: "invalid-oauth@sqlite.example.com",
				name: "Invalid OAuth",
				password: "correct-horse-battery-staple",
			},
		});
		const publishedOAuthProviderApi =
			auth1630.api as unknown as PublishedOAuthProviderApi;
		await publishedOAuthProviderApi.registerOAuthApplication({
			body: {
				client_name: "Invalid migration client",
				redirect_uris: ["https://sqlite.example.com/callback"],
			},
		});
		database.exec(`UPDATE oauthApplication SET redirectUrls = ''`);

		const auth17 = betterAuth({
			account: { identityStrategy: "provider-id" },
			baseURL: "http://localhost:3000",
			database,
			emailAndPassword: { enabled: true },
			plugins: [
				jwt(),
				oauthProvider({
					consentPage: "/consent",
					loginPage: "/login",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
			],
		});
		await expect(
			migrateFrom16(auth17.options, {
				oauthProvider: {
					clients: "migrate",
					clientSecrets: { source: "plain", target: "hashed" },
					consents: "migrate",
					tokens: "revoke",
				},
			}),
		).rejects.toThrow("has no redirect URI and cannot be migrated");

		const accountColumns = database
			.prepare(`PRAGMA table_info(account)`)
			.all()
			.map((column) => (column as { name: string }).name);
		expect(accountColumns).not.toContain("issuer");
		const legacyTables = database
			.prepare(
				`SELECT name FROM sqlite_master
				 WHERE type = 'table' AND name IN (
					'oauthApplication',
					'oauthApplication__better_auth_1_6',
					'oauthClient'
				 )`,
			)
			.all()
			.map((table) => (table as { name: string }).name);
		expect(legacyTables).toEqual(["oauthApplication"]);
	} finally {
		database.close();
	}
});

it("preserves published 1.6.30 hashed OAuth client authentication on SQLite", {
	timeout: 60_000,
}, async () => {
	const database = new DatabaseSync(":memory:");
	try {
		await exerciseOAuthProviderMigration({
			database,
			emailDomain: "oauth-hashed-sqlite.example.com",
			nameSuffix: "SQLite hashed secret",
			sourceClientSecretStorage: "hashed",
		});
	} finally {
		database.close();
	}
});

it("preserves published 1.6.30 encrypted OAuth client authentication on SQLite", {
	timeout: 60_000,
}, async () => {
	const database = new DatabaseSync(":memory:");
	try {
		await exerciseOAuthProviderMigration({
			database,
			emailDomain: "oauth-encrypted-sqlite.example.com",
			nameSuffix: "SQLite encrypted secret",
			sourceClientSecretStorage: "encrypted",
			targetClientSecretStorage: "encrypted",
		});
	} finally {
		database.close();
	}
});

it("rolls back the SQLite release migration when schema application is blocked", async () => {
	const database = new DatabaseSync(":memory:");
	try {
		const auth1630 = betterAuth1630({
			baseURL: "http://localhost:3000",
			database,
			emailAndPassword: { enabled: true },
		});
		await (await getMigrations1630(auth1630.options)).runMigrations();
		await auth1630.api.signUpEmail({
			body: {
				email: "rollback@sqlite.example.com",
				name: "Rollback",
				password: "correct-horse-battery-staple",
			},
		});
		database.exec(`
			CREATE TRIGGER reject_account_identity_update
			BEFORE UPDATE ON account
			BEGIN
				SELECT RAISE(ABORT, 'forced account migration failure');
			END;
		`);

		const auth17 = betterAuth({
			account: { identityStrategy: "provider-id" },
			baseURL: "http://localhost:3000",
			database,
			emailAndPassword: { enabled: true },
		});
		await expect(migrateFrom16(auth17.options, {})).rejects.toThrow(
			"forced account migration failure",
		);

		const accountColumns = database
			.prepare(`PRAGMA table_info(account)`)
			.all()
			.map((column) => (column as { name: string }).name);
		expect(accountColumns).not.toContain("issuer");
		expect(
			database.prepare(`SELECT accountId FROM account`).get(),
		).toMatchObject({ accountId: expect.any(String) });
	} finally {
		database.close();
	}
});

it("rolls back the SQLite release migration when an OAuth record cannot be created", async () => {
	const database = new DatabaseSync(":memory:");
	try {
		await seedPublishedOAuthProviderData({
			database,
			emailDomain: "oauth-rollback-sqlite.example.com",
			nameSuffix: "SQLite OAuth rollback",
			storeClientSecret: "plain",
		});
		database.exec(`
			CREATE TABLE "oauthClient" (
				"id" text primary key not null,
				"clientId" text not null unique,
				"redirectUris" text not null
			);
			CREATE TRIGGER reject_oauth_client_insert
			BEFORE INSERT ON "oauthClient"
			BEGIN
				SELECT RAISE(ABORT, 'forced OAuth migration failure');
			END;
		`);

		const auth17 = betterAuth({
			account: { identityStrategy: "provider-id" },
			baseURL: "http://localhost:3000",
			database,
			emailAndPassword: { enabled: true },
			plugins: [
				jwt(),
				oauthProvider({
					consentPage: "/consent",
					loginPage: "/login",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
					storeClientSecret: "hashed",
				}),
			],
		});
		await expect(
			migrateFrom16(auth17.options, {
				oauthProvider: {
					clients: "migrate",
					clientSecrets: { source: "plain", target: "hashed" },
					consents: "migrate",
					tokens: "revoke",
				},
			}),
		).rejects.toThrow("forced OAuth migration failure");

		const accountColumns = database
			.prepare(`PRAGMA table_info(account)`)
			.all()
			.map((column) => (column as { name: string }).name);
		expect(accountColumns).not.toContain("issuer");
		expect(
			database
				.prepare(
					`SELECT name FROM sqlite_master
					 WHERE type = 'table' AND name = 'oauthApplication'`,
				)
				.get(),
		).toEqual({ name: "oauthApplication" });
		expect(
			database
				.prepare(
					`SELECT name FROM sqlite_master
					 WHERE type = 'table' AND name = 'oauthApplication__better_auth_1_6'`,
				)
				.get(),
		).toBeUndefined();
	} finally {
		database.close();
	}
});

it("migrates users created by published 1.6.30 and authenticates them through 1.7 on PostgreSQL", {
	timeout: 60_000,
}, async () => {
	const databaseName = createDatabaseName();
	const adminPool = new Pool({
		connectionString: "postgres://user:password@localhost:5433/postgres",
	});
	await adminPool.query(`CREATE DATABASE "${databaseName}"`);
	const pool = new Pool({
		connectionString: `postgres://user:password@localhost:5433/${databaseName}`,
	});
	try {
		await exerciseAccountAndOrganizationMigration({
			database: pool,
			emailDomain: "postgres.example.com",
			nameSuffix: "PostgreSQL",
		});
	} finally {
		await pool.end();
		await adminPool.query(`DROP DATABASE "${databaseName}"`);
		await adminPool.end();
	}
});

it("migrates users created by published 1.6.30 and authenticates them through 1.7 on MySQL", {
	timeout: 60_000,
}, async () => {
	const databaseName = createDatabaseName().replace("postgres", "mysql");
	const adminPool = createPool({
		uri: "mysql://root:root_password@localhost:3307/mysql",
	});
	await adminPool.query(`CREATE DATABASE \`${databaseName}\``);
	const pool = createPool({
		timezone: "Z",
		uri: `mysql://root:root_password@localhost:3307/${databaseName}`,
	});

	try {
		await exerciseAccountAndOrganizationMigration({
			database: pool,
			emailDomain: "mysql.example.com",
			nameSuffix: "MySQL",
		});
	} finally {
		await pool.end();
		await adminPool.query(`DROP DATABASE \`${databaseName}\``);
		await adminPool.end();
	}
});

/**
 * Before 1.7.1 the generated migration added the required `issuer` column with
 * no default. MySQL accepted it and wrote an empty string into every existing
 * row, then built the compound unique index over those empty values.
 */
it("repairs a MySQL account table an earlier migration filled with empty issuers", {
	timeout: 60_000,
}, async () => {
	const databaseName = createDatabaseName().replace("postgres", "mysql_repair");
	const adminPool = createPool({
		uri: "mysql://root:root_password@localhost:3307/mysql",
	});
	await adminPool.query(`CREATE DATABASE \`${databaseName}\``);
	const pool = createPool({
		timezone: "Z",
		uri: `mysql://root:root_password@localhost:3307/${databaseName}`,
	});

	try {
		const auth1630 = betterAuth1630({
			baseURL: "http://localhost:3000",
			database: pool,
			emailAndPassword: { enabled: true },
		});
		await (await getMigrations1630(auth1630.options)).runMigrations();
		for (const user of [
			{ email: "ada@mysql-repair.example.com", name: "Ada Repair" },
			{ email: "grace@mysql-repair.example.com", name: "Grace Repair" },
		]) {
			await auth1630.api.signUpEmail({
				body: { ...user, password: "correct-horse-battery-staple" },
			});
		}

		await pool.query(
			"ALTER TABLE `account` MODIFY COLUMN `accountId` varchar(255) NOT NULL",
		);
		await pool.query(
			"ALTER TABLE `account` ADD COLUMN `issuer` varchar(255) NOT NULL",
		);
		await pool.query(
			"CREATE UNIQUE INDEX `account_issuer_accountId_uidx` ON `account` (`issuer`, `accountId`)",
		);
		const [corrupted] = await pool.query<RowDataPacket[]>(
			"SELECT COUNT(*) AS count FROM `account` WHERE `issuer` = ''",
		);
		expect(Number(corrupted[0]?.count)).toBe(2);

		const auth17 = betterAuth({
			baseURL: "http://localhost:3000",
			database: pool,
			account: { identityStrategy: "provider-id" },
			emailAndPassword: { enabled: true },
		});
		await expect(migrateFrom16(auth17.options, {})).resolves.toMatchObject({
			accounts: { migrated: 2, providers: { credential: 2 } },
		});

		const [repaired] = await pool.query<RowDataPacket[]>(
			"SELECT `issuer`, `accountId` FROM `account` ORDER BY `accountId`",
		);
		expect(repaired).toHaveLength(2);
		for (const account of repaired) {
			expect(account.issuer).toBe("local:credential");
			expect(account.accountId).not.toBe("");
		}
		const [indexes] = await pool.query<RowDataPacket[]>(
			"SELECT INDEX_NAME AS name FROM information_schema.statistics WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account' AND INDEX_NAME = 'account_issuer_accountId_uidx'",
		);
		expect(indexes.length).toBeGreaterThan(0);

		const signIn = await auth17.api.signInEmail({
			body: {
				email: "ada@mysql-repair.example.com",
				password: "correct-horse-battery-staple",
			},
		});
		expect(signIn.user.name).toBe("Ada Repair");
	} finally {
		await pool.end();
		await adminPool.query(`DROP DATABASE \`${databaseName}\``);
		await adminPool.end();
	}
});

it("ignores a matching account index outside the active PostgreSQL schema", {
	timeout: 60_000,
}, async () => {
	const databaseName = createDatabaseName().replace(
		"postgres",
		"postgres_index_schema",
	);
	const adminPool = new Pool({
		connectionString: "postgres://user:password@localhost:5433/postgres",
	});
	await adminPool.query(`CREATE DATABASE "${databaseName}"`);
	const pool = new Pool({
		connectionString: `postgres://user:password@localhost:5433/${databaseName}`,
	});

	try {
		const auth1630 = betterAuth1630({
			baseURL: "http://localhost:3000",
			database: pool,
			emailAndPassword: { enabled: true },
		});
		await (await getMigrations1630(auth1630.options)).runMigrations();
		await auth1630.api.signUpEmail({
			body: {
				email: "schema-index@postgres.example.com",
				name: "Schema Index",
				password: "correct-horse-battery-staple",
			},
		});
		await pool.query(`
			ALTER TABLE "account"
			ADD COLUMN "issuer" text NOT NULL DEFAULT '';
			ALTER TABLE "account" ALTER COLUMN "issuer" DROP DEFAULT;
			CREATE SCHEMA "migration_shadow";
			CREATE TABLE "migration_shadow"."account" (
				"issuer" text NOT NULL,
				"accountId" text NOT NULL
			);
			CREATE UNIQUE INDEX "account_issuer_accountId_uidx"
			ON "migration_shadow"."account" ("issuer", "accountId");
		`);

		const auth17 = betterAuth({
			baseURL: "http://localhost:3000",
			database: pool,
			account: { identityStrategy: "provider-id" },
			emailAndPassword: { enabled: true },
		});
		await expect(migrateFrom16(auth17.options, {})).resolves.toMatchObject({
			accounts: { migrated: 1, providers: { credential: 1 } },
		});
		await pool.query(`UPDATE "account" SET "issuer" = ''`);
		await expect(migrateFrom16(auth17.options, {})).resolves.toMatchObject({
			accounts: { migrated: 1, providers: { credential: 1 } },
		});
		const indexes = await pool.query<{ schemaname: string }>(`
			SELECT schemaname
			FROM pg_indexes
			WHERE indexname = 'account_issuer_accountId_uidx'
			ORDER BY schemaname
		`);
		expect(indexes.rows).toEqual([
			{ schemaname: "migration_shadow" },
			{ schemaname: "public" },
		]);
	} finally {
		await pool.end();
		await adminPool.query(`DROP DATABASE "${databaseName}"`);
		await adminPool.end();
	}
});

it("migrates users created by published 1.6.30 and authenticates them through 1.7 on SQL Server", {
	timeout: 60_000,
}, async () => {
	const databaseName = createDatabaseName().replace("postgres", "mssql");
	const adminDatabase = createMssqlDatabase("master");
	await sql.raw(`CREATE DATABASE [${databaseName}]`).execute(adminDatabase);
	const database = createMssqlDatabase(databaseName);

	try {
		const databaseOptions = {
			db: database,
			transaction: true,
			type: "mssql" as const,
		};
		await exerciseAccountAndOrganizationMigration({
			database: databaseOptions,
			emailDomain: "mssql.example.com",
			nameSuffix: "SQL Server",
		});
	} finally {
		await database.destroy();
		await sql.raw(`DROP DATABASE [${databaseName}]`).execute(adminDatabase);
		await adminDatabase.destroy();
	}
});

it("honors a custom published 1.6.30 OAuth client table through the PostgreSQL cutover", {
	timeout: 60_000,
}, async () => {
	const databaseName = createDatabaseName().replace(
		"postgres",
		"oauth_postgres",
	);
	const adminPool = new Pool({
		connectionString: "postgres://user:password@localhost:5433/postgres",
	});
	await adminPool.query(`CREATE DATABASE "${databaseName}"`);
	const pool = new Pool({
		connectionString: `postgres://user:password@localhost:5433/${databaseName}`,
	});

	try {
		await exerciseOAuthProviderMigration({
			async beforeMigrate() {
				await pool.query(`
					CREATE TABLE "oauthApplication" (
						"id" TEXT PRIMARY KEY NOT NULL
					);
					INSERT INTO "oauthApplication" ("id")
					VALUES ('unrelated-default-name-table');
				`);
			},
			configurePublishedPlugin(plugin) {
				const oauthApplication = plugin.schema.oauthApplication;
				if (!oauthApplication) {
					throw new Error("Expected the 1.6.30 OAuth application schema");
				}
				oauthApplication.modelName = "legacyOAuthApplication";
			},
			database: pool,
			emailDomain: "oauth-postgres.example.com",
			legacyTableNames: {
				oauthApplication: "legacyOAuthApplication",
			},
			nameSuffix: "PostgreSQL",
		});
		const unrelatedTable = await pool.query<{ count: string }>(
			'SELECT COUNT(*) AS "count" FROM "oauthApplication"',
		);
		expect(unrelatedTable.rows[0]?.count).toBe("1");
	} finally {
		await pool.end();
		await adminPool.query(`DROP DATABASE "${databaseName}"`);
		await adminPool.end();
	}
});

it("retires published 1.6.30 OAuth consents when reauthorization is selected", {
	timeout: 60_000,
}, async () => {
	const databaseName = createDatabaseName().replace(
		"postgres",
		"oauth_reauthorize",
	);
	const adminPool = new Pool({
		connectionString: "postgres://user:password@localhost:5433/postgres",
	});
	await adminPool.query(`CREATE DATABASE "${databaseName}"`);
	const pool = new Pool({
		connectionString: `postgres://user:password@localhost:5433/${databaseName}`,
	});

	try {
		await exerciseOAuthProviderMigration({
			consentStrategy: "reauthorize",
			database: pool,
			emailDomain: "oauth-reauthorize.example.com",
			nameSuffix: "PostgreSQL reauthorization",
		});
	} finally {
		await pool.end();
		await adminPool.query(`DROP DATABASE "${databaseName}"`);
		await adminPool.end();
	}
});

it("migrates a published 1.6.30 OAuth client and consent while revoking old tokens on MySQL", {
	timeout: 60_000,
}, async () => {
	const databaseName = createDatabaseName().replace("postgres", "oauth_mysql");
	const adminPool = createPool({
		uri: "mysql://root:root_password@localhost:3307/mysql",
	});
	await adminPool.query(`CREATE DATABASE \`${databaseName}\``);
	const pool = createPool({
		timezone: "Z",
		uri: `mysql://root:root_password@localhost:3307/${databaseName}`,
	});

	try {
		await exerciseOAuthProviderMigration({
			database: pool,
			emailDomain: "oauth-mysql.example.com",
			nameSuffix: "MySQL",
		});
	} finally {
		await pool.end();
		await adminPool.query(`DROP DATABASE \`${databaseName}\``);
		await adminPool.end();
	}
});

it("documents the published 1.6.30 OIDC schema failure on SQL Server", {
	timeout: 60_000,
}, async () => {
	const databaseName = createDatabaseName().replace(
		"postgres",
		"oidc_schema_mssql",
	);
	const adminDatabase = createMssqlDatabase("master");
	await sql.raw(`CREATE DATABASE [${databaseName}]`).execute(adminDatabase);
	const database = createMssqlDatabase(databaseName);

	try {
		const auth1630 = betterAuth1630({
			database: { db: database, type: "mssql" },
			plugins: [
				oidcProvider1630({
					allowDynamicClientRegistration: true,
					loginPage: "/login",
				}),
			],
		});
		let migrationError: unknown;
		try {
			await (await getMigrations1630(auth1630.options)).runMigrations();
		} catch (error) {
			migrationError = error;
		}
		const errorText = (
			Array.isArray(migrationError) ? migrationError : [migrationError]
		)
			.map((entry) => (entry instanceof Error ? entry.message : String(entry)))
			.join("\n");
		expect(errorText).toContain(
			"is not the same length or scale as referencing column",
		);
	} finally {
		await database.destroy();
		await sql.raw(`DROP DATABASE [${databaseName}]`).execute(adminDatabase);
		await adminDatabase.destroy();
	}
});

it("migrates a published 1.6.30 OAuth client and consent while revoking old tokens on SQL Server", {
	timeout: 60_000,
}, async () => {
	const databaseName = createDatabaseName().replace("postgres", "oauth_mssql");
	const adminDatabase = createMssqlDatabase("master");
	await sql.raw(`CREATE DATABASE [${databaseName}]`).execute(adminDatabase);
	const database = createMssqlDatabase(databaseName);

	try {
		await exerciseOAuthProviderMigration({
			database: { db: database, transaction: true, type: "mssql" },
			emailDomain: "oauth-mssql.example.com",
			nameSuffix: "SQL Server",
			configurePublishedPlugin(plugin) {
				const accessTokenFields = plugin.schema.oauthAccessToken?.fields;
				const consentFields = plugin.schema.oauthConsent?.fields;
				if (!accessTokenFields || !consentFields) {
					throw new Error("Expected the 1.6.30 OIDC schema");
				}
				configurePublishedReferenceField(accessTokenFields.clientId!);
				configurePublishedReferenceField(accessTokenFields.userId!);
				configurePublishedReferenceField(consentFields.clientId!);
				configurePublishedReferenceField(consentFields.userId!);
			},
			configureCurrentPlugin(plugin) {
				for (const table of Object.values(plugin.schema)) {
					for (const field of Object.values(table.fields)) {
						if (field.references) {
							field.references.onDelete = "no action";
						}
					}
				}
			},
		});
	} finally {
		await database.destroy();
		await sql.raw(`DROP DATABASE [${databaseName}]`).execute(adminDatabase);
		await adminDatabase.destroy();
	}
});

it("retires published 1.6.30 SCIM credentials with a custom account ID column and reprovisions a retained user through 1.7 on PostgreSQL", {
	timeout: 60_000,
}, async () => {
	const databaseName = createDatabaseName().replace(
		"postgres",
		"scim_postgres",
	);
	const adminPool = new Pool({
		connectionString: "postgres://user:password@localhost:5433/postgres",
	});
	await adminPool.query(`CREATE DATABASE "${databaseName}"`);
	const pool = new Pool({
		connectionString: `postgres://user:password@localhost:5433/${databaseName}`,
	});
	const currentDatabase = new Kysely<unknown>({
		dialect: new PostgresDialect({ pool }),
	});

	try {
		const { administrator, legacyScimAccount, provisionedUser } =
			await seedPublishedScimAccount({
				accountIdField: "externalAccountId",
				database: pool,
				emailDomain: "postgres.example.com",
			});

		const auth17 = betterAuth({
			account: {
				fields: {
					accountId: "externalAccountId",
				},
				identityStrategy: "provider-id",
			},
			baseURL: "http://localhost:3000",
			database: {
				db: currentDatabase,
				transaction: true,
				type: "postgres",
			},
			emailAndPassword: {
				enabled: true,
			},
			plugins: [createCurrentScimPlugin(legacyScimAccount.userId)],
		});
		await expect(migrateFrom16(auth17.options, {})).rejects.toThrow(
			'The 1.6 SCIM migration requires providers: "reprovision" and an explicit accountIdsToRetire inventory.',
		);
		await expect(
			migrateFrom16(auth17.options, {
				scim: {
					accountIdsToRetire: [],
					providers: "reprovision",
				},
			}),
		).rejects.toThrow(
			"The SCIM account retirement inventory must exactly match every account owned by the legacy SCIM providers.",
		);
		const migration = await migrateFrom16(auth17.options, {
			scim: {
				accountIdsToRetire: [legacyScimAccount.id],
				providers: "reprovision",
			},
		});

		expect(migration.accounts).toEqual({
			migrated: 1,
			providers: { credential: 1 },
		});
		expect(migration.scim).toMatchObject({
			identities: [
				{
					providerId: "workforce",
					userId: legacyScimAccount.userId,
				},
			],
			reprovisionRequired: true,
			retiredProviders: 1,
		});
		const rerun = await migrateFrom16(auth17.options, {
			scim: {
				accountIdsToRetire: [legacyScimAccount.id],
				providers: "reprovision",
			},
		});
		expect(rerun).toMatchObject({
			accounts: {
				migrated: 0,
				providers: {},
			},
		});
		expect(rerun.scim).toBeUndefined();
		const reprovisioned = await auth17.api.createSCIMUser({
			body: {
				name: { formatted: "Ada Provisioned" },
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ada-provisioned@postgres.example.com",
			},
			headers: {
				authorization: "Bearer workforce-1-7-token",
			},
		});
		const retrieved = await auth17.api.getSCIMUser({
			headers: {
				authorization: "Bearer workforce-1-7-token",
			},
			params: { userId: reprovisioned.id },
		});
		expect(retrieved).toMatchObject({
			id: reprovisioned.id,
			userName: "ada-provisioned@postgres.example.com",
		});
		const currentContext = await auth17.$context;
		expect(
			await currentContext.adapter.findOne({
				model: "account",
				where: [{ field: "id", value: legacyScimAccount.id }],
			}),
		).toBeNull();
		expect(
			await currentContext.internalAdapter.findUserById(
				legacyScimAccount.userId,
			),
		).toMatchObject({
			id: provisionedUser.id,
		});
		expect(administrator.user.id).not.toBe(legacyScimAccount.userId);
	} finally {
		await currentDatabase.destroy();
		await adminPool.query(`DROP DATABASE "${databaseName}"`);
		await adminPool.end();
	}
});

/**
 * @see https://github.com/better-auth/better-auth/pull/10575#discussion_r3831145554
 */
it("checkpoints MySQL legacy tables and rolls back interrupted SCIM retirement", {
	timeout: 60_000,
}, async () => {
	const databaseName = createDatabaseName().replace("postgres", "scim_mysql");
	const adminPool = createPool({
		uri: "mysql://root:root_password@localhost:3307/mysql",
	});
	await adminPool.query(`CREATE DATABASE \`${databaseName}\``);
	const pool = createPool({
		timezone: "Z",
		uri: `mysql://root:root_password@localhost:3307/${databaseName}`,
	});
	let shouldInterruptAccountDeletion = true;
	const accountDeletionQueries = new Set<string>();
	const interruptAccountDeletion = {
		transformQuery({ node, queryId }) {
			if (
				shouldInterruptAccountDeletion &&
				node.kind === "RawNode" &&
				/DELETE\s+FROM/i.test(node.sqlFragments.join(" "))
			) {
				accountDeletionQueries.add(queryId.queryId);
			}
			return node;
		},
		async transformResult({ queryId, result }) {
			if (accountDeletionQueries.delete(queryId.queryId)) {
				shouldInterruptAccountDeletion = false;
				throw new Error("forced SCIM account retirement interruption");
			}
			return result;
		},
	} satisfies KyselyPlugin;
	const currentDatabase = new Kysely<unknown>({
		dialect: new MysqlDialect(pool),
		plugins: [interruptAccountDeletion],
	});

	try {
		const { legacyScimAccount } = await seedPublishedScimAccount({
			database: pool,
			emailDomain: "mysql.example.com",
		});

		const options = {
			accountIssuers: {
				workforce: "local:retired-scim:workforce",
			},
			scim: {
				accountIdsToRetire: [legacyScimAccount.id],
				providers: "reprovision" as const,
			},
		};
		const auth17 = betterAuth({
			account: { identityStrategy: "provider-id" },
			baseURL: "http://localhost:3000",
			database: { db: currentDatabase, transaction: true, type: "mysql" },
			emailAndPassword: { enabled: true },
			plugins: [createCurrentScimPlugin(legacyScimAccount.userId)],
		});
		await expect(migrateFrom16(auth17.options, options)).rejects.toThrow(
			"forced SCIM account retirement interruption",
		);

		const [legacyTables] = await pool.query<RowDataPacket[]>(`
			SELECT TABLE_NAME AS name
			FROM information_schema.tables
			WHERE
				TABLE_SCHEMA = DATABASE() AND
				TABLE_NAME IN (
					'scimProvider',
					'scimProvider__better_auth_1_6'
				)
			ORDER BY TABLE_NAME
		`);
		expect(legacyTables.map(({ name }) => name)).toEqual([
			"scimProvider__better_auth_1_6",
		]);
		const [remainingAccounts] = await pool.query<RowDataPacket[]>(
			"SELECT COUNT(*) AS count FROM `account` WHERE `id` = ?",
			[legacyScimAccount.id],
		);
		expect(Number(remainingAccounts[0]?.count)).toBe(1);

		const migration = await migrateFrom16(auth17.options, options);
		expect(migration).toMatchObject({
			accounts: { migrated: 0, providers: {} },
			scim: {
				identities: [
					{
						providerId: "workforce",
						userId: legacyScimAccount.userId,
					},
				],
				reprovisionRequired: true,
				retiredProviders: 1,
			},
		});
		const [retiredAccounts] = await pool.query<RowDataPacket[]>(
			"SELECT COUNT(*) AS count FROM `account` WHERE `id` = ?",
			[legacyScimAccount.id],
		);
		expect(Number(retiredAccounts[0]?.count)).toBe(0);
	} finally {
		await currentDatabase.destroy();
		await adminPool.query(`DROP DATABASE \`${databaseName}\``);
		await adminPool.end();
	}
});
