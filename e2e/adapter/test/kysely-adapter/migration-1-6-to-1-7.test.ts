import { oauthProvider } from "@better-auth/oauth-provider";
import { scim } from "@better-auth/scim";
import { betterAuth } from "better-auth";
import { migrateFrom16 } from "better-auth/db/migration";
import { jwt, organization } from "better-auth/plugins";
import { betterAuth as betterAuth1625 } from "better-auth-1-6-25";
import { getMigrations as getMigrations1625 } from "better-auth-1-6-25/db/migration";
import {
	oidcProvider as oidcProvider1625,
	organization as organization1625,
} from "better-auth-1-6-25/plugins";
import { scim as scim1625 } from "better-auth-scim-1-6-25";
import { Kysely, MssqlDialect, PostgresDialect, sql } from "kysely";
import { createPool } from "mysql2/promise";
import { Pool } from "pg";
import * as Tarn from "tarn";
import * as Tedious from "tedious";
import { expect, it } from "vitest";

let databaseSequence = 0;

type MigrationDatabase = NonNullable<
	Parameters<typeof betterAuth>[0]["database"]
> &
	NonNullable<Parameters<typeof betterAuth1625>[0]["database"]>;

interface PublishedOrganizationApi {
	createOrganization(input: {
		body: {
			name: string;
			slug: string;
			userId: string;
		};
	}): Promise<{ id: string } | null>;
}

interface PublishedOAuthProviderApi {
	registerOAuthApplication(input: {
		body: {
			client_name: string;
			redirect_uris: string[];
		};
	}): Promise<{
		client_id: string;
		client_secret?: string | undefined;
	}>;
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

async function exerciseAccountAndOrganizationMigration({
	database,
	emailDomain,
	nameSuffix,
}: {
	database: MigrationDatabase;
	emailDomain: string;
	nameSuffix: string;
}) {
	const auth1625 = betterAuth1625({
		baseURL: "http://localhost:3000",
		database,
		emailAndPassword: {
			enabled: true,
		},
		plugins: [
			organization1625({
				teams: {
					enabled: true,
				},
			}),
		],
	});
	await (await getMigrations1625(auth1625.options)).runMigrations();

	const sourceUsers = [];
	for (const user of [
		{ email: `ada@${emailDomain}`, name: `Ada ${nameSuffix}` },
		{ email: `grace@${emailDomain}`, name: `Grace ${nameSuffix}` },
	]) {
		sourceUsers.push(
			await auth1625.api.signUpEmail({
				body: {
					...user,
					password: "correct-horse-battery-staple",
				},
			}),
		);
	}
	const publishedOrganizationApi =
		auth1625.api as unknown as PublishedOrganizationApi;
	const sourceOrganization = await publishedOrganizationApi.createOrganization({
		body: {
			name: `${nameSuffix} migration fixture`,
			slug: `${emailDomain.replaceAll(".", "-")}-migration-fixture`,
			userId: sourceUsers[0]!.user.id,
		},
	});
	if (!sourceOrganization) {
		throw new Error("Published 1.6.25 did not create the organization fixture");
	}
	const sourceContext = await auth1625.$context;
	const sourceTeam = await sourceContext.adapter.findOne<{ id: string }>({
		model: "team",
		where: [{ field: "organizationId", value: sourceOrganization.id }],
	});
	if (!sourceTeam) {
		throw new Error("Published 1.6.25 did not create the default team fixture");
	}

	const auth17 = betterAuth({
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
	const result = await migrateFrom16(auth17.options, {
		accountIssuers: {
			credential: "local:credential",
		},
	});

	expect(result.accounts).toEqual({
		migrated: 2,
		providers: {
			credential: 2,
		},
	});

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

	const rerun = await migrateFrom16(auth17.options, {
		accountIssuers: {
			credential: "local:credential",
		},
	});
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
}: {
	database: MigrationDatabase;
	emailDomain: string;
	nameSuffix: string;
	beforeMigrate?: (() => Promise<void>) | undefined;
	configureCurrentPlugin?:
		| ((plugin: ReturnType<typeof oauthProvider>) => void)
		| undefined;
	configurePublishedPlugin?:
		| ((plugin: ReturnType<typeof oidcProvider1625>) => void)
		| undefined;
	consentStrategy?: "migrate" | "reauthorize" | undefined;
	legacyTableNames?:
		| {
				oauthApplication?: string | undefined;
		  }
		| undefined;
}) {
	const publishedPlugin = oidcProvider1625({
		allowDynamicClientRegistration: true,
		loginPage: "/login",
	});
	configurePublishedPlugin?.(publishedPlugin);
	const auth1625 = betterAuth1625({
		baseURL: "http://localhost:3000",
		database,
		emailAndPassword: {
			enabled: true,
		},
		plugins: [publishedPlugin],
	});
	await (await getMigrations1625(auth1625.options)).runMigrations();
	const owner = await auth1625.api.signUpEmail({
		body: {
			email: `provider-owner@${emailDomain}`,
			name: `${nameSuffix} Provider Owner`,
			password: "correct-horse-battery-staple",
		},
	});
	const publishedOAuthProviderApi =
		auth1625.api as unknown as PublishedOAuthProviderApi;
	const registeredClient =
		await publishedOAuthProviderApi.registerOAuthApplication({
			body: {
				client_name: `${nameSuffix} published migration client`,
				redirect_uris: [`https://${emailDomain}/callback`],
			},
		});
	const sourceContext = await auth1625.$context;
	const now = new Date();
	const legacyAccessToken = crypto.randomUUID();
	await sourceContext.adapter.create({
		model: "oauthAccessToken",
		data: {
			accessToken: legacyAccessToken,
			accessTokenExpiresAt: new Date(now.getTime() + 60_000),
			clientId: registeredClient.client_id,
			createdAt: now,
			refreshToken: crypto.randomUUID(),
			refreshTokenExpiresAt: new Date(now.getTime() + 120_000),
			scopes: "openid profile",
			updatedAt: now,
			userId: owner.user.id,
		},
	});
	await sourceContext.adapter.create({
		model: "oauthConsent",
		data: {
			clientId: registeredClient.client_id,
			consentGiven: true,
			createdAt: now,
			scopes: "openid profile",
			updatedAt: now,
			userId: owner.user.id,
		},
	});

	const currentPlugin = oauthProvider({
		consentPage: "/consent",
		loginPage: "/login",
		silenceWarnings: {
			oauthAuthServerConfig: true,
			openidConfig: true,
		},
	});
	configureCurrentPlugin?.(currentPlugin);
	const auth17 = betterAuth({
		baseURL: "http://localhost:3000",
		database,
		emailAndPassword: {
			enabled: true,
		},
		plugins: [jwt(), currentPlugin],
	});
	await beforeMigrate?.();
	await expect(
		migrateFrom16(auth17.options, {
			accountIssuers: {
				credential: "local:credential",
			},
			legacyTableNames,
		}),
	).rejects.toThrow(
		'The 1.6 OAuth client migration requires clients: "migrate" and clientSecrets: "rehash-plaintext".',
	);
	const migration = await migrateFrom16(auth17.options, {
		accountIssuers: {
			credential: "local:credential",
		},
		legacyTableNames,
		oauthProvider: {
			clients: "migrate",
			clientSecrets: "rehash-plaintext",
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
		throw new Error("Expected the 1.6.25 client to have a client secret");
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
		accountIssuers: {
			credential: "local:credential",
		},
		legacyTableNames,
		oauthProvider: {
			clients: "migrate",
			clientSecrets: "rehash-plaintext",
			consents: consentStrategy,
			tokens: "revoke",
		},
	});
	expect(rerun.accounts).toEqual({
		migrated: 0,
		providers: {},
	});
	expect(rerun.oauthProvider).toMatchObject({
		clients: { migrated: 1 },
		consents:
			consentStrategy === "migrate"
				? { migrated: 1, reauthorizationRequired: 0 }
				: { migrated: 0, reauthorizationRequired: 1 },
		tokens: { revoked: 1 },
	});
}

it("migrates users created by published 1.6.25 and authenticates them through 1.7 on PostgreSQL", {
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

it("migrates users created by published 1.6.25 and authenticates them through 1.7 on MySQL", {
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

it("migrates users created by published 1.6.25 and authenticates them through 1.7 on SQL Server", {
	timeout: 60_000,
}, async () => {
	const databaseName = createDatabaseName().replace("postgres", "mssql");
	const adminDatabase = createMssqlDatabase("master");
	await sql.raw(`CREATE DATABASE [${databaseName}]`).execute(adminDatabase);
	const database = createMssqlDatabase(databaseName);

	try {
		const databaseOptions = { db: database, type: "mssql" as const };
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

it("honors a custom published 1.6.25 OAuth client table through the PostgreSQL cutover", {
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
					throw new Error("Expected the 1.6.25 OAuth application schema");
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

it("retires published 1.6.25 OAuth consents when reauthorization is selected", {
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

it("migrates a published 1.6.25 OAuth client and consent while revoking old tokens on MySQL", {
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

it("documents the published 1.6.25 OIDC schema failure on SQL Server", {
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
		const auth1625 = betterAuth1625({
			database: { db: database, type: "mssql" },
			plugins: [
				oidcProvider1625({
					allowDynamicClientRegistration: true,
					loginPage: "/login",
				}),
			],
		});
		let migrationError: unknown;
		try {
			await (await getMigrations1625(auth1625.options)).runMigrations();
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

it("migrates a published 1.6.25 OAuth client and consent while revoking old tokens on SQL Server", {
	timeout: 60_000,
}, async () => {
	const databaseName = createDatabaseName().replace("postgres", "oauth_mssql");
	const adminDatabase = createMssqlDatabase("master");
	await sql.raw(`CREATE DATABASE [${databaseName}]`).execute(adminDatabase);
	const database = createMssqlDatabase(databaseName);

	try {
		await exerciseOAuthProviderMigration({
			database: { db: database, type: "mssql" },
			emailDomain: "oauth-mssql.example.com",
			nameSuffix: "SQL Server",
			configurePublishedPlugin(plugin) {
				const accessTokenFields = plugin.schema.oauthAccessToken?.fields;
				const consentFields = plugin.schema.oauthConsent?.fields;
				if (!accessTokenFields || !consentFields) {
					throw new Error("Expected the 1.6.25 OIDC schema");
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

it("retires published 1.6.25 SCIM credentials and reprovisions a retained user through 1.7 on PostgreSQL", {
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
		const auth1625 = betterAuth1625({
			baseURL: "http://localhost:3000",
			database: pool,
			emailAndPassword: {
				enabled: true,
			},
			plugins: [scim1625()],
		});
		await (await getMigrations1625(auth1625.options)).runMigrations();
		const administrator = await auth1625.api.signUpEmail({
			body: {
				email: "scim-admin@postgres.example.com",
				name: "SCIM Administrator",
				password: "correct-horse-battery-staple",
			},
		});
		const administratorSignIn = await auth1625.api.signInEmail({
			body: {
				email: "scim-admin@postgres.example.com",
				password: "correct-horse-battery-staple",
			},
			returnHeaders: true,
		});
		const administratorCookie = administratorSignIn.headers.getSetCookie()[0];
		if (!administratorCookie) {
			throw new Error("Expected the 1.6.25 administrator session cookie");
		}
		const generated = await auth1625.api.generateSCIMToken({
			body: { providerId: "workforce" },
			headers: { cookie: administratorCookie },
		});
		const provisioned1625 = await auth1625.api.createSCIMUser({
			body: {
				name: { formatted: "Ada Provisioned" },
				userName: "ada-provisioned@postgres.example.com",
			},
			headers: {
				authorization: `Bearer ${generated.scimToken}`,
			},
		});
		const sourceContext = await auth1625.$context;
		const legacyScimAccount = await sourceContext.adapter.findOne<{
			id: string;
			userId: string;
		}>({
			model: "account",
			where: [{ field: "providerId", value: "workforce" }],
		});
		if (!legacyScimAccount) {
			throw new Error("Expected the 1.6.25 SCIM authentication account");
		}

		const auth17 = betterAuth({
			baseURL: "http://localhost:3000",
			database: {
				db: currentDatabase,
				transaction: true,
				type: "postgres",
			},
			emailAndPassword: {
				enabled: true,
			},
			plugins: [
				scim({
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
							userId: legacyScimAccount.userId,
						}),
					},
				}),
			],
		});
		await expect(
			migrateFrom16(auth17.options, {
				accountIssuers: {
					credential: "local:credential",
					workforce: "local:retired-scim:workforce",
				},
			}),
		).rejects.toThrow(
			'The 1.6 SCIM migration requires providers: "reprovision" and an explicit accountIdsToRetire inventory.',
		);
		const migration = await migrateFrom16(auth17.options, {
			accountIssuers: {
				credential: "local:credential",
				workforce: "local:retired-scim:workforce",
			},
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
			accountIssuers: {
				credential: "local:credential",
				workforce: "local:retired-scim:workforce",
			},
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
			scim: {
				identities: [],
				reprovisionRequired: true,
				retiredProviders: 1,
			},
		});
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
			id: provisioned1625.id,
		});
		expect(administrator.user.id).not.toBe(legacyScimAccount.userId);
	} finally {
		await currentDatabase.destroy();
		await adminPool.query(`DROP DATABASE "${databaseName}"`);
		await adminPool.end();
	}
});
