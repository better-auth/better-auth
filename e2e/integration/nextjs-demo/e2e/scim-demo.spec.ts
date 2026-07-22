import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { getSCIMDemoCompletedOperations } from "../../../../demo/nextjs/lib/scim-demo-service.ts";

const SCIM_DEMO_SSO_PROVIDER_ID = "scim-demo-sso";

function findRepositoryRoot() {
	let directory = resolve(process.cwd());
	while (true) {
		if (existsSync(join(directory, "pnpm-workspace.yaml"))) return directory;
		const parent = dirname(directory);
		if (parent === directory) {
			throw new Error("Could not find the Better Auth repository root");
		}
		directory = parent;
	}
}

const demoDirectory = join(findRepositoryRoot(), "demo/nextjs");

async function findClientAssetSecretExposures(
	directory: string,
	secrets: readonly { label: string; value: string }[],
) {
	const exposures: Array<{ file: string; secret: string }> = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			exposures.push(...(await findClientAssetSecretExposures(path, secrets)));
			continue;
		}
		if (!/\.(?:css|js|json|map)$/.test(entry.name)) continue;
		const contents = await readFile(path, "utf8");
		for (const secret of secrets) {
			if (contents.includes(secret.value)) {
				exposures.push({ file: path, secret: secret.label });
			}
		}
	}
	return exposures;
}

const transientSCIMTables = [
	"scimGroup",
	"scimGroupMember",
	"scimIdentityTombstone",
	"scimProjectionGrant",
	"scimSubject",
	"scimUser",
] as const;

async function getAvailablePort() {
	const server = createServer();
	const port = await new Promise<number>((resolvePort, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address && typeof address === "object") {
				resolvePort(address.port);
				return;
			}
			reject(new Error("Could not reserve a port for the Next.js demo"));
		});
	});
	await new Promise<void>((resolveClose, reject) => {
		server.close((error) => (error ? reject(error) : resolveClose()));
	});
	return port;
}

async function waitForDemo(
	baseURL: string,
	child: ChildProcessWithoutNullStreams,
	getOutput: () => string,
	getStartupError: () => Error | undefined,
) {
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		const startupError = getStartupError();
		if (startupError) {
			throw new Error(`Next.js demo failed to start: ${startupError.message}`);
		}
		if (child.exitCode !== null || child.signalCode !== null) {
			throw new Error(`Next.js demo exited before startup:\n${getOutput()}`);
		}
		try {
			const response = await fetch(`${baseURL}/sign-in`, {
				signal: AbortSignal.timeout(1_000),
			});
			if (response.ok) return;
		} catch {
			// The development server has not bound its port yet.
		}
		await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
	}
	throw new Error(`Next.js demo did not start:\n${getOutput()}`);
}

async function stopProcess(child: ChildProcessWithoutNullStreams | undefined) {
	if (!child?.pid || child.exitCode !== null) return;
	const { terminate } = await import("@better-auth-test/test-utils/playwright");
	await terminate(child.pid);
}

async function runDemoModuleScript(
	script: string,
	environment: NodeJS.ProcessEnv,
) {
	const child = spawn(
		process.execPath,
		["--experimental-strip-types", "--input-type=module", "--eval", script],
		{
			cwd: demoDirectory,
			env: environment,
			stdio: "pipe",
		},
	);
	let stdout = "";
	let stderr = "";
	child.stdout.on("data", (chunk) => {
		stdout += chunk.toString();
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk.toString();
	});
	const exitCode = await new Promise<number | null>((resolveExit, reject) => {
		child.once("error", reject);
		child.once("exit", resolveExit);
	});
	if (exitCode !== 0) {
		throw new Error(`Demo module script failed:\n${stderr || stdout}`);
	}
	return stdout.trim();
}

async function createOIDCTestSigningPrivateJWK() {
	const signingKeys = await crypto.subtle.generateKey(
		{
			name: "RSASSA-PKCS1-v1_5",
			modulusLength: 2_048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: "SHA-256",
		},
		true,
		["sign", "verify"],
	);
	if (!("privateKey" in signingKeys)) {
		throw new Error("Could not generate the OIDC test signing key");
	}
	return JSON.stringify(
		await crypto.subtle.exportKey("jwk", signingKeys.privateKey),
	);
}

function readCount(
	database: DatabaseSync,
	query: string,
	...parameters: string[]
) {
	const row = database.prepare(query).get(...parameters);
	const count = row?.count;
	if (typeof count === "number") return count;
	if (typeof count === "bigint") return Number(count);
	throw new Error(`Count query returned an invalid result: ${query}`);
}

function expectNoTransientSCIMData(databasePath: string) {
	const database = new DatabaseSync(databasePath, { readOnly: true });
	try {
		for (const table of transientSCIMTables) {
			expect(
				readCount(database, `SELECT COUNT(*) AS count FROM "${table}"`),
				`${table} should not retain sandbox rows`,
			).toBe(0);
		}
		expect(
			readCount(
				database,
				`SELECT COUNT(*) AS count FROM "user" WHERE "email" LIKE '%@acme.example'`,
			),
			"the application users created by the sandbox should be removed",
		).toBe(0);
	} finally {
		database.close();
	}
}

function readMayaProvisioningState(databasePath: string) {
	const database = new DatabaseSync(databasePath, { readOnly: true });
	try {
		const row = database
			.prepare(
				`SELECT
					s."id" AS "scimResourceId",
					s."userId" AS "applicationUserId",
					s."externalId",
					s."userName",
					s."displayName",
					u."email" AS "applicationEmail",
					u."name" AS "applicationName",
					u."scimDemoRole" AS "applicationRole"
				 FROM "scimUser" s
				 JOIN "user" u ON u."id" = s."userId"
				 WHERE s."userName" LIKE 'maya.chen+%@acme.example'`,
			)
			.get();
		if (
			typeof row?.scimResourceId !== "string" ||
			typeof row.applicationUserId !== "string" ||
			typeof row.externalId !== "string" ||
			typeof row.userName !== "string" ||
			typeof row.displayName !== "string" ||
			typeof row.applicationEmail !== "string" ||
			typeof row.applicationName !== "string" ||
			(row.applicationRole !== null && typeof row.applicationRole !== "string")
		) {
			throw new Error("Maya Chen's SCIM identity was not found");
		}
		return {
			scimResourceId: row.scimResourceId,
			applicationUserId: row.applicationUserId,
			externalId: row.externalId,
			userName: row.userName,
			displayName: row.displayName,
			applicationEmail: row.applicationEmail,
			applicationName: row.applicationName,
			applicationRole: row.applicationRole,
		};
	} finally {
		database.close();
	}
}

function readMayaAuthenticationLink(
	databasePath: string,
	applicationUserId: string,
	issuer: string,
	providerAccountId: string,
) {
	const database = new DatabaseSync(databasePath, { readOnly: true });
	try {
		const row = database
			.prepare(
				`SELECT
					"id" AS "accountId",
					"issuer",
					"providerAccountId",
					"providerId",
					"userId"
				 FROM "account"
				 WHERE "userId" = ?
				   AND "issuer" = ?
				   AND "providerAccountId" = ?
				   AND "providerId" = ?`,
			)
			.get(
				applicationUserId,
				issuer,
				providerAccountId,
				SCIM_DEMO_SSO_PROVIDER_ID,
			);
		if (
			typeof row?.accountId !== "string" ||
			typeof row.issuer !== "string" ||
			typeof row.providerAccountId !== "string" ||
			typeof row.providerId !== "string" ||
			typeof row.userId !== "string"
		) {
			throw new Error("Maya Chen's SSO authentication link was not found");
		}
		return {
			accountId: row.accountId,
			issuer: row.issuer,
			providerAccountId: row.providerAccountId,
			providerId: row.providerId,
			userId: row.userId,
		};
	} finally {
		database.close();
	}
}

function readApplicationAuthenticationCounts(
	databasePath: string,
	applicationUserId: string,
) {
	const database = new DatabaseSync(databasePath, { readOnly: true });
	try {
		return {
			users: readCount(
				database,
				`SELECT COUNT(*) AS count FROM "user" WHERE "id" = ?`,
				applicationUserId,
			),
			accounts: readCount(
				database,
				`SELECT COUNT(*) AS count FROM "account" WHERE "userId" = ?`,
				applicationUserId,
			),
			sessions: readCount(
				database,
				`SELECT COUNT(*) AS count FROM "session" WHERE "userId" = ?`,
				applicationUserId,
			),
		};
	} finally {
		database.close();
	}
}

function insertExternalAccount(databasePath: string, userId: string) {
	const database = new DatabaseSync(databasePath);
	const accountId = crypto.randomUUID();
	const now = new Date().toISOString();
	try {
		database
			.prepare(
				`INSERT INTO "account"
					("id", "issuer", "providerAccountId", "providerId", "userId", "createdAt", "updatedAt")
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				accountId,
				"https://accounts.example.com",
				`external-${accountId}`,
				"external-sso",
				userId,
				now,
				now,
			);
		return accountId;
	} finally {
		database.close();
	}
}

function deleteAccount(databasePath: string, accountId: string) {
	const database = new DatabaseSync(databasePath);
	try {
		database.prepare(`DELETE FROM "account" WHERE "id" = ?`).run(accountId);
	} finally {
		database.close();
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface EmployeeSession {
	session: { id: string };
	user: { email: string; id: string; name: string };
}

function readEmployeeSession(value: unknown): EmployeeSession | null {
	if (value === null) return null;
	if (!isRecord(value) || !isRecord(value.session) || !isRecord(value.user)) {
		throw new Error("The employee session response was invalid");
	}
	if (
		typeof value.session.id !== "string" ||
		typeof value.user.id !== "string" ||
		typeof value.user.email !== "string" ||
		typeof value.user.name !== "string"
	) {
		throw new Error("The employee session response was incomplete");
	}
	return {
		session: { id: value.session.id },
		user: {
			id: value.user.id,
			email: value.user.email,
			name: value.user.name,
		},
	};
}

async function getEmployeeSession(
	context: BrowserContext,
	baseURL: string,
): Promise<EmployeeSession | null> {
	const response = await context.request.get(`${baseURL}/api/auth/get-session`);
	expect(response.status()).toBe(200);
	const body: unknown = await response.json();
	return readEmployeeSession(body);
}

function expectProvisionedUserCount(databasePath: string, expected: number) {
	const database = new DatabaseSync(databasePath, { readOnly: true });
	try {
		expect(
			readCount(database, `SELECT COUNT(*) AS count FROM "scimUser"`),
		).toBe(expected);
		expect(
			readCount(
				database,
				`SELECT COUNT(*) AS count FROM "user" WHERE "email" LIKE '%@acme.example'`,
			),
		).toBe(expected);
	} finally {
		database.close();
	}
}

function addForeignIdentityTombstone(databasePath: string, userId: string) {
	const database = new DatabaseSync(databasePath);
	try {
		const result = database
			.prepare(
				`INSERT INTO "scimIdentityTombstone"
					("id", "connectionId", "provisioningDomainId", "externalId", "externalIdKey", "userId", "profile", "deletedAt")
				 SELECT 'foreign-tombstone', 'foreign-directory', 'foreign-domain', "externalId",
					'foreign-tombstone-key', "userId", "profile", "deletedAt"
				 FROM "scimIdentityTombstone"
				 WHERE "userId" = ?
				 LIMIT 1`,
			)
			.run(userId);
		expect(Number(result.changes)).toBe(1);
	} finally {
		database.close();
	}
}

function removeForeignIdentityTombstone(databasePath: string) {
	const database = new DatabaseSync(databasePath);
	try {
		database
			.prepare(
				`DELETE FROM "scimIdentityTombstone" WHERE "id" = 'foreign-tombstone'`,
			)
			.run();
	} finally {
		database.close();
	}
}

function expectRetainedApplicationIdentity(
	databasePath: string,
	userId: string,
) {
	const database = new DatabaseSync(databasePath, { readOnly: true });
	try {
		const tombstoneCount = database
			.prepare(
				`SELECT COUNT(*) AS count FROM "scimIdentityTombstone" WHERE "userId" = ?`,
			)
			.get(userId)?.count;
		const applicationUserCount = database
			.prepare(`SELECT COUNT(*) AS count FROM "user" WHERE "id" = ?`)
			.get(userId)?.count;
		expect(Number(tombstoneCount)).toBe(2);
		expect(Number(applicationUserCount)).toBe(1);
	} finally {
		database.close();
	}
}

async function validateRemoteHTTPDemoConfiguration() {
	const script = [
		'const { createSCIMDemoPlugin } = await import("./lib/scim-demo.ts");',
		"createSCIMDemoPlugin();",
	].join("\n");
	const child = spawn(
		process.execPath,
		["--experimental-strip-types", "--input-type=module", "--eval", script],
		{
			cwd: demoDirectory,
			env: {
				...process.env,
				BETTER_AUTH_URL: "http://directory.example",
				SCIM_DEMO_ENABLED: "true",
				SCIM_DEMO_TOKEN: "configuration-test-token",
			},
			stdio: "pipe",
		},
	);
	let output = "";
	child.stdout.on("data", (chunk) => {
		output += chunk.toString();
	});
	child.stderr.on("data", (chunk) => {
		output += chunk.toString();
	});
	const exitCode = await new Promise<number | null>((resolveExit) => {
		child.once("exit", resolveExit);
	});
	return { exitCode, output };
}

async function selectUser(page: Page, name: string) {
	await page
		.getByRole("link", { name: new RegExp(name) })
		.first()
		.click();
	await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
}

async function expectSuccessMessage(page: Page, message: string) {
	await expect(page.getByText(message, { exact: true }).first()).toBeVisible();
}

async function provisionSelectedUser(page: Page, name: string) {
	await page.getByRole("button", { name: "Provision user" }).click();
	await expectSuccessMessage(page, `${name} was provisioned`);
	await expect(page.getByText("Active", { exact: true }).last()).toBeVisible();
}

async function assignSelectedUserToGroup(
	page: Page,
	name: string,
	groupName: string,
) {
	await page.getByRole("button", { name: "Change groups" }).click();
	const dialog = page.getByRole("dialog", { name: "Change directory groups" });
	await dialog.getByRole("checkbox", { name: new RegExp(groupName) }).check();
	await dialog.getByRole("button", { name: "Stage group changes" }).click();
	await expect(
		page.getByText(`Set groups to ${groupName}`, { exact: false }),
	).toBeVisible();
	await page.getByRole("button", { name: "Apply change" }).click();
	await expectSuccessMessage(page, `${name}’s groups were synchronized`);
}

async function getMayaEmployeeURL(page: Page) {
	await expect(
		page.getByRole("button", { name: "Copy employee link" }),
	).toBeVisible();
	const employeeLink = page
		.locator('a[href^="/scim-demo/employee?"][href*="user=maya-chen"]')
		.first();
	await expect(employeeLink).toBeVisible();
	const href = await employeeLink.getAttribute("href");
	if (!href) throw new Error("Maya Chen's employee link was not available");
	const url = new URL(href, page.url());
	expect(url.pathname).toBe("/scim-demo/employee");
	expect(url.searchParams.get("workspace")).toMatch(/^[a-f0-9]{12}$/);
	expect(url.searchParams.get("user")).toBe("maya-chen");
	return url.toString();
}

async function selectIdentityProviderAccount(
	page: Page,
	displayName: string,
	givenName: string,
	onAccountSelected?: () => Promise<void>,
) {
	await expect(
		page.getByRole("heading", { name: /Acme Identity/ }),
	).toBeVisible({ timeout: 10_000 });
	const account = page.getByRole("radio", {
		name: new RegExp(displayName),
	});
	await expect(account).not.toBeChecked();
	await expect(
		page.getByRole("button", { name: "Choose an account" }),
	).toBeDisabled();
	await expect(page.getByRole("radio", { name: /Maya Chen/ })).toBeVisible();
	await expect(
		page.getByRole("radio", { name: /Julian Foster/ }),
	).toBeVisible();
	await expect(page.getByRole("radio", { name: /Priya Shah/ })).toBeVisible();
	await account.click();
	await expect(account).toBeChecked();
	await onAccountSelected?.();
	await page.getByRole("button", { name: `Continue as ${givenName}` }).click();
}

async function selectMayaIdentityProviderAccount(page: Page) {
	await selectIdentityProviderAccount(page, "Maya Chen", "Maya");
}

async function beginMayaSSOSignIn(page: Page, employeeURL: string) {
	await page.goto(employeeURL);
	await page.getByRole("button", { name: "Continue with Acme SSO" }).click();
	await selectMayaIdentityProviderAccount(page);
}

async function attemptMayaSSOSignInOverHTTP(
	context: BrowserContext,
	page: Page,
	baseURL: string,
	employeeURL: string,
	email: string,
) {
	const response = await context.request.post(
		`${baseURL}/api/auth/sign-in/sso`,
		{
			headers: { origin: baseURL },
			data: {
				callbackURL: employeeURL,
				email,
				errorCallbackURL: employeeURL,
				loginHint: email,
				providerId: SCIM_DEMO_SSO_PROVIDER_ID,
			},
		},
	);
	const body: unknown = await response.json();
	expect(response.ok(), JSON.stringify(body)).toBe(true);
	if (!isRecord(body) || typeof body.url !== "string") {
		throw new Error(
			"The SSO sign-in endpoint did not return an authorization URL",
		);
	}
	await page.goto(body.url);
	await selectMayaIdentityProviderAccount(page);
}

test.describe("Next.js SCIM demo", () => {
	test.describe.configure({ mode: "serial" });
	test.setTimeout(120_000);

	let baseURL = "";
	let demoProcess: ChildProcessWithoutNullStreams | undefined;
	let temporaryDirectory = "";
	let databasePath = "";
	let output = "";
	let demoEnvironment: NodeJS.ProcessEnv = {};
	let demoPort = 0;
	const scimToken = "e2e-scim-token-that-must-stay-on-the-server";
	const oidcClientSecret =
		"e2e-scim-demo-oidc-secret-that-must-stay-on-the-server";
	let oidcSigningPrivateKey = "";
	let oidcSigningPrivateKeyMaterial = "";

	async function startDemo(environment: NodeJS.ProcessEnv) {
		const process = spawn(
			"pnpm",
			["dev", "--hostname", "127.0.0.1", "--port", String(demoPort)],
			{
				cwd: demoDirectory,
				detached: true,
				env: environment,
				stdio: "pipe",
			},
		);
		process.stdout.on("data", (chunk) => {
			output += chunk.toString();
		});
		process.stderr.on("data", (chunk) => {
			output += chunk.toString();
		});
		let startupError: Error | undefined;
		process.once("error", (error) => {
			startupError = error;
		});
		await waitForDemo(
			baseURL,
			process,
			() => output,
			() => startupError,
		);
		return process;
	}

	test.beforeAll(async () => {
		temporaryDirectory = await mkdtemp(
			join(tmpdir(), "better-auth-scim-demo-"),
		);
		demoPort = await getAvailablePort();
		baseURL = `http://127.0.0.1:${demoPort}`;
		databasePath = join(temporaryDirectory, "demo.sqlite");
		oidcSigningPrivateKey = await createOIDCTestSigningPrivateJWK();
		const signingPrivateJWK: unknown = JSON.parse(oidcSigningPrivateKey);
		if (
			!isRecord(signingPrivateJWK) ||
			typeof signingPrivateJWK.d !== "string"
		) {
			throw new Error("The OIDC test signing key is missing private material");
		}
		oidcSigningPrivateKeyMaterial = signingPrivateJWK.d;
		demoEnvironment = {
			...process.env,
			BETTER_AUTH_SECRET:
				"better-auth-scim-demo-e2e-secret-at-least-thirty-two-characters",
			BETTER_AUTH_URL: baseURL,
			DEMO_SQLITE_PATH: databasePath,
			NO_COLOR: "1",
			SCIM_DEMO_ENABLED: "true",
			SCIM_DEMO_OIDC_CLIENT_SECRET: oidcClientSecret,
			SCIM_DEMO_OIDC_SIGNING_PRIVATE_KEY: oidcSigningPrivateKey,
			SCIM_DEMO_TOKEN: scimToken,
		};

		const migrationScript = [
			'import { getMigrations } from "better-auth/db/migration";',
			'const { auth } = await import("./lib/auth.ts");',
			"const { runMigrations } = await getMigrations(auth.options);",
			"await runMigrations();",
		].join("\n");
		const migration = spawn(
			process.execPath,
			[
				"--experimental-strip-types",
				"--input-type=module",
				"--eval",
				migrationScript,
			],
			{
				cwd: demoDirectory,
				env: demoEnvironment,
				stdio: "pipe",
			},
		);
		migration.stdout.on("data", (chunk) => {
			output += chunk.toString();
		});
		migration.stderr.on("data", (chunk) => {
			output += chunk.toString();
		});
		const migrationExitCode = await new Promise<number | null>(
			(resolveExit) => {
				migration.once("exit", resolveExit);
			},
		);
		expect(migrationExitCode, output).toBe(0);

		demoProcess = await startDemo(demoEnvironment);
	});

	test.afterAll(async () => {
		await stopProcess(demoProcess);
		if (temporaryDirectory) {
			await rm(temporaryDirectory, { force: true, recursive: true });
		}
	});

	test("requires an authenticated same-origin session", async ({ request }) => {
		const response = await request.post(`${baseURL}/api/scim-demo`, {
			headers: { origin: baseURL },
			data: { type: "reset-sandbox" },
		});

		expect(response.status()).toBe(401);
		expect(await response.json()).toEqual({ error: "Authentication required" });
		expectNoTransientSCIMData(databasePath);
	});

	test("rejects a remote HTTP callback URL during demo startup", async () => {
		const result = await validateRemoteHTTPDemoConfiguration();

		expect(result.exitCode).not.toBe(0);
		expect(result.output).toContain(
			"BETTER_AUTH_URL must use HTTPS unless the SCIM demo runs on loopback",
		);
	});

	test("keeps only complete operation records from partial failures", () => {
		const completedOperation = {
			createdAt: "2026-07-16T08:00:00.000Z",
			effect: "Application access enabled",
			id: "operation-1",
			method: "POST",
			requestBody: "{}",
			resource: "/Users",
			responseBody: "{}",
			status: 201,
			userKey: "maya-chen",
		} as const;
		const error = Object.assign(new Error("Partial SCIM failure"), {
			operations: [
				completedOperation,
				{ id: "operation-2", effect: "Missing response contract" },
			],
		});

		expect(getSCIMDemoCompletedOperations(error)).toEqual([completedOperation]);
	});

	test("hides public SCIM demo pages when the feature is disabled", async ({
		request,
	}) => {
		await stopProcess(demoProcess);
		demoProcess = undefined;
		const disabledEnvironment = {
			...demoEnvironment,
			DEMO_SQLITE_PATH: join(temporaryDirectory, "disabled-demo.sqlite"),
			SCIM_DEMO_ENABLED: "false",
			SCIM_DEMO_OIDC_CLIENT_SECRET: undefined,
			SCIM_DEMO_OIDC_SIGNING_PRIVATE_KEY: undefined,
			SCIM_DEMO_TOKEN: undefined,
		};

		try {
			demoProcess = await startDemo(disabledEnvironment);
			const [employeePage, identityProviderPage, api] = await Promise.all([
				request.get(
					`${baseURL}/scim-demo/employee?workspace=0123456789ab&user=maya-chen`,
				),
				request.get(`${baseURL}/scim-demo/idp/authorize`),
				request.get(`${baseURL}/api/scim-demo`),
			]);
			expect(employeePage.status()).toBe(404);
			expect(identityProviderPage.status()).toBe(404);
			expect(api.status()).toBe(404);
		} finally {
			await stopProcess(demoProcess);
			demoProcess = await startDemo(demoEnvironment);
		}
	});

	test("keeps OIDC tokens verifiable when the signing-key cache is rebuilt", async ({
		request,
	}) => {
		const result = JSON.parse(
			await runDemoModuleScript(
				[
					'import { base64url, createLocalJWKSet, jwtVerify } from "jose";',
					'const oidc = await import("./lib/scim-demo-oidc.ts");',
					'const workspaceId = "0123456789ab";',
					'const verifier = "a".repeat(43);',
					'const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));',
					"const challenge = base64url.encode(new Uint8Array(digest));",
					"let storedValue;",
					"const callback = await oidc.issueSCIMDemoOIDCAuthorizationCode({",
					"  async createVerificationValue(input) { storedValue = input.value; },",
					"}, new URLSearchParams({",
					"  client_id: oidc.SCIM_DEMO_OIDC_CLIENT_ID,",
					"  code_challenge: challenge,",
					'  code_challenge_method: "S256",',
					"  login_hint: `maya.chen+${workspaceId}@acme.example`,",
					'  nonce: "cache-reset-proof",',
					"  redirect_uri: oidc.getSCIMDemoOIDCRedirectURI(),",
					'  response_type: "code",',
					'  scope: "openid email profile",',
					'  state: "stable-signing-key",',
					'}), { userKey: "maya-chen", workspaceId });',
					'const code = callback.searchParams.get("code");',
					'if (!code || !storedValue) throw new Error("Authorization code was not issued");',
					"const before = await oidc.getSCIMDemoOIDCJWKS();",
					"const tokens = await oidc.exchangeSCIMDemoOIDCAuthorizationCode({",
					"  async consumeVerificationValue() { return { value: storedValue }; },",
					"}, new URLSearchParams({",
					"  client_id: oidc.SCIM_DEMO_OIDC_CLIENT_ID,",
					"  client_secret: oidc.getSCIMDemoOIDCClientSecret(),",
					"  code,",
					"  code_verifier: verifier,",
					'  grant_type: "authorization_code",',
					"  redirect_uri: oidc.getSCIMDemoOIDCRedirectURI(),",
					"}));",
					"delete globalThis.__betterAuthSCIMDemoOIDCSigningKeys;",
					"const after = await oidc.getSCIMDemoOIDCJWKS();",
					"const verified = await jwtVerify(tokens.id_token, createLocalJWKSet(after), {",
					"  audience: oidc.SCIM_DEMO_OIDC_CLIENT_ID,",
					"  issuer: oidc.getSCIMDemoOIDCIssuer(),",
					"});",
					"console.log(JSON.stringify({ after, before, subject: verified.payload.sub }));",
				].join("\n"),
				{
					...process.env,
					BETTER_AUTH_URL: baseURL,
					SCIM_DEMO_OIDC_CLIENT_SECRET: oidcClientSecret,
					SCIM_DEMO_OIDC_SIGNING_PRIVATE_KEY: oidcSigningPrivateKey,
				},
			),
		) as unknown;
		const serverJWKSResponse = await request.get(
			`${baseURL}/api/scim-demo/idp/jwks`,
		);
		expect(serverJWKSResponse.status()).toBe(200);
		const serverJWKS: unknown = await serverJWKSResponse.json();
		expect(result).toEqual({
			after: serverJWKS,
			before: serverJWKS,
			subject: "scim-demo:0123456789ab:maya-chen",
		});

		const deployedEnvironment = {
			...process.env,
			BETTER_AUTH_URL: "https://scim-demo.example",
			SCIM_DEMO_OIDC_CLIENT_SECRET: oidcClientSecret,
			SCIM_DEMO_OIDC_SIGNING_PRIVATE_KEY: undefined,
		};
		await expect(
			runDemoModuleScript(
				[
					'const { getSCIMDemoOIDCJWKS } = await import("./lib/scim-demo-oidc.ts");',
					"await getSCIMDemoOIDCJWKS();",
				].join("\n"),
				deployedEnvironment,
			),
		).rejects.toThrow(
			"SCIM_DEMO_OIDC_SIGNING_PRIVATE_KEY is required when the SCIM demo issuer is not loopback",
		);
	});

	test("reconciles a partially applied group change", async ({ page }) => {
		const signUpResponse = await page.request.post(
			`${baseURL}/api/auth/sign-up/email`,
			{
				data: {
					email: `scim-partial-${Date.now()}@example.com`,
					name: "SCIM Partial Change Operator",
					password: "correct-horse-battery-staple",
				},
			},
		);
		expect(signUpResponse.ok(), await signUpResponse.text()).toBe(true);

		await page.goto(`${baseURL}/dashboard/scim`);
		await provisionSelectedUser(page, "Maya Chen");
		const identity = readMayaProvisioningState(databasePath);
		const scopeMatch = /^scim-demo:([a-f0-9]+):maya-chen$/.exec(
			identity.externalId,
		);
		expect(scopeMatch).not.toBeNull();
		const scope = scopeMatch?.[1];
		if (!scope) throw new Error("The demo operator scope was not found");

		const conflictingGroupResponse = await page.request.post(
			`${baseURL}/api/auth/scim/v2/Groups`,
			{
				headers: {
					accept: "application/scim+json",
					authorization: `Bearer ${scimToken}`,
					"content-type": "application/scim+json",
					origin: baseURL,
				},
				data: {
					schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
					externalId: `scim-demo:${scope}:conflicting-developers`,
					displayName: `Developers (${scope})`,
					members: [],
				},
			},
		);
		const conflictingGroup: unknown = await conflictingGroupResponse.json();
		expect(
			conflictingGroupResponse.status(),
			JSON.stringify(conflictingGroup),
		).toBe(201);
		if (
			typeof conflictingGroup !== "object" ||
			conflictingGroup === null ||
			!("id" in conflictingGroup) ||
			typeof conflictingGroup.id !== "string"
		) {
			throw new Error("The conflicting SCIM Group did not return an ID");
		}

		await page.getByRole("button", { name: "Change groups" }).click();
		const groupDialog = page.getByRole("dialog", {
			name: "Change directory groups",
		});
		await groupDialog
			.getByRole("checkbox", { name: /Finance administrators/ })
			.check();
		await groupDialog.getByRole("checkbox", { name: /Developers/ }).check();
		await groupDialog
			.getByRole("button", { name: "Stage group changes" })
			.click();
		await page.getByRole("button", { name: "Change groups" }).click();
		const reopenedGroupDialog = page.getByRole("dialog", {
			name: "Change directory groups",
		});
		await expect(
			reopenedGroupDialog.getByRole("checkbox", {
				name: /Finance administrators/,
			}),
		).toBeChecked();
		await expect(
			reopenedGroupDialog.getByRole("checkbox", { name: /Developers/ }),
		).toBeChecked();
		await reopenedGroupDialog.getByRole("button", { name: "Cancel" }).click();
		await page.getByRole("button", { name: "Apply change" }).click();

		await expect(
			page
				.getByRole("alert")
				.getByText("SCIM Group displayName already exists", {
					exact: false,
				}),
		).toBeVisible();
		await expect(
			page.getByText("Set groups to Finance administrators, Developers", {
				exact: false,
			}),
		).toBeVisible();
		await expect(
			page.getByText("Finance administrators group created", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("User added to Finance administrators", { exact: true }),
		).toBeVisible();

		const deleteConflict = await page.request.delete(
			`${baseURL}/api/auth/scim/v2/Groups/${conflictingGroup.id}`,
			{
				headers: {
					accept: "application/scim+json",
					authorization: `Bearer ${scimToken}`,
					origin: baseURL,
				},
			},
		);
		expect(deleteConflict.status()).toBe(204);
		await page.getByRole("button", { name: "Try again" }).click();
		await expectSuccessMessage(page, "Maya Chen’s groups were synchronized");

		await page.getByRole("button", { name: "Reset sandbox" }).click();
		await page.getByRole("button", { name: "Reset sandbox" }).last().click();
		await expectSuccessMessage(page, "SCIM sandbox reset");
		expectNoTransientSCIMData(databasePath);
	});

	test("refuses to reset an identity owned by another SCIM connection", async ({
		page,
	}) => {
		const signUpResponse = await page.request.post(
			`${baseURL}/api/auth/sign-up/email`,
			{
				data: {
					email: `scim-reset-ownership-${Date.now()}@example.com`,
					name: "SCIM Reset Ownership Operator",
					password: "correct-horse-battery-staple",
				},
			},
		);
		expect(signUpResponse.ok(), await signUpResponse.text()).toBe(true);

		await page.goto(`${baseURL}/dashboard/scim`);
		await provisionSelectedUser(page, "Maya Chen");
		const identity = readMayaProvisioningState(databasePath);
		await page.getByRole("button", { name: "Delete SCIM resource" }).click();
		await page.getByRole("button", { name: "Delete resource" }).click();
		await expect(
			page.getByText("Deleted", { exact: true }).last(),
		).toBeVisible();
		addForeignIdentityTombstone(databasePath, identity.applicationUserId);

		await page.getByRole("button", { name: "Reset sandbox" }).click();
		await page.getByRole("button", { name: "Reset sandbox" }).last().click();
		await expect(
			page
				.getByRole("alert")
				.getByText("The application user is linked outside this demo sandbox", {
					exact: false,
				}),
		).toBeVisible();
		expectRetainedApplicationIdentity(databasePath, identity.applicationUserId);

		removeForeignIdentityTombstone(databasePath);
		await page.getByRole("button", { name: "Reset sandbox" }).click();
		await page.getByRole("button", { name: "Reset sandbox" }).last().click();
		await expectSuccessMessage(page, "SCIM sandbox reset");
		expectNoTransientSCIMData(databasePath);
	});

	test("preflights the user graph before resetting the sandbox", async ({
		page,
	}) => {
		const signUpResponse = await page.request.post(
			`${baseURL}/api/auth/sign-up/email`,
			{
				data: {
					email: `scim-reset-preflight-${Date.now()}@example.com`,
					name: "SCIM Reset Preflight Operator",
					password: "correct-horse-battery-staple",
				},
			},
		);
		expect(signUpResponse.ok(), await signUpResponse.text()).toBe(true);

		await page.goto(`${baseURL}/dashboard/scim`);
		await provisionSelectedUser(page, "Maya Chen");
		const provisionedUserState = readMayaProvisioningState(databasePath);
		const externalAccountId = insertExternalAccount(
			databasePath,
			provisionedUserState.applicationUserId,
		);

		await page.getByRole("button", { name: "Reset sandbox" }).click();
		await page.getByRole("button", { name: "Reset sandbox" }).last().click();
		await expect(
			page
				.getByRole("alert")
				.getByText("non-demo authentication account", { exact: false }),
		).toBeVisible();
		const retainedUserState = readMayaProvisioningState(databasePath);
		expect(retainedUserState.scimResourceId).toBe(
			provisionedUserState.scimResourceId,
		);
		expect(retainedUserState.applicationUserId).toBe(
			provisionedUserState.applicationUserId,
		);

		deleteAccount(databasePath, externalAccountId);
		await page.getByRole("button", { name: "Reset sandbox" }).click();
		await page.getByRole("button", { name: "Reset sandbox" }).last().click();
		await expectSuccessMessage(page, "SCIM sandbox reset");
		expectNoTransientSCIMData(databasePath);
	});

	test("runs a real SCIM lifecycle from the authenticated demo UI", async ({
		page,
	}, testInfo) => {
		const browserAuthorizationHeaders: string[] = [];
		const browserConsoleErrors: string[] = [];
		const initialBrowserWorkspaceRequests: string[] = [];
		page.on("console", (message) => {
			if (message.type() !== "error") return;
			browserConsoleErrors.push(message.text());
		});
		page.on("request", (request) => {
			const authorization = request.headers().authorization;
			if (authorization) browserAuthorizationHeaders.push(authorization);
			if (
				request.method() === "GET" &&
				request.url() === `${baseURL}/api/scim-demo`
			) {
				initialBrowserWorkspaceRequests.push(request.url());
			}
		});

		const signUpResponse = await page.request.post(
			`${baseURL}/api/auth/sign-up/email`,
			{
				data: {
					email: `scim-demo-${Date.now()}@example.com`,
					name: "SCIM Demo Operator",
					password: "correct-horse-battery-staple",
				},
			},
		);
		expect(signUpResponse.ok(), await signUpResponse.text()).toBe(true);

		await page.goto(`${baseURL}/dashboard/scim`);
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: "Directory provisioning",
			}),
		).toBeVisible();
		await expect(
			page.getByText("Acme directory: Connected", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Showing 3 of 3 users", { exact: true }),
		).toBeVisible();
		const selectedMayaLink = page
			.getByRole("link", { name: /Maya Chen/ })
			.first();
		await expect(selectedMayaLink).toHaveAttribute("aria-current", "page");
		await expect(selectedMayaLink).not.toHaveAttribute("aria-pressed");
		expect(initialBrowserWorkspaceRequests).toEqual([]);
		await expect(page.locator("body")).not.toContainText(scimToken);
		let invalidActionResponseReturned = false;
		const demoActionURL = `${baseURL}/api/scim-demo`;
		await page.route(demoActionURL, async (route) => {
			if (
				!invalidActionResponseReturned &&
				route.request().method() === "POST"
			) {
				invalidActionResponseReturned = true;
				await route.fulfill({
					contentType: "application/json",
					status: 200,
					body: JSON.stringify({
						operations: [],
						workspace: {
							connection: { id: "demo-directory", status: "connected" },
							groups: [],
							users: [],
						},
					}),
				});
				return;
			}
			await route.continue();
		});
		await page.getByRole("button", { name: "Provision user" }).click();
		await expect(
			page
				.getByRole("alert")
				.getByText("The directory change returned an invalid response", {
					exact: false,
				}),
		).toBeVisible();
		await page.unroute(demoActionURL);

		await provisionSelectedUser(page, "Maya Chen");
		await page.getByRole("link", { name: "Activity", exact: true }).click();
		await expect(page.getByText("1 operation", { exact: true })).toBeVisible();
		await page.getByRole("link", { name: "Users", exact: true }).click();
		await assignSelectedUserToGroup(
			page,
			"Maya Chen",
			"Finance administrators",
		);
		await expect(
			page.locator("aside").getByText("billing-manager", { exact: true }),
		).toBeVisible();

		await page.getByRole("button", { name: "Deactivate" }).click();
		await expect(
			page.getByText("Deactivate application access", { exact: false }),
		).toBeVisible();
		await selectUser(page, "Julian Foster");
		await selectUser(page, "Maya Chen");
		await expect(
			page.getByText("Deactivate application access", { exact: false }),
		).toBeVisible();
		await page.getByRole("button", { name: "Apply change" }).click();
		await expectSuccessMessage(
			page,
			"Maya Chen was deactivated. Application access is disabled.",
		);
		await expect(
			page
				.getByLabel("Selected user details")
				.getByText("Inactive", { exact: true })
				.first(),
		).toBeVisible();
		await expect(
			page
				.locator("aside")
				.getByText("Finance administrators", { exact: true }),
		).toBeVisible();
		await page.getByRole("button", { name: "Reactivate" }).click();
		await page.getByRole("button", { name: "Apply change" }).click();
		await expectSuccessMessage(
			page,
			"Maya Chen was reactivated. Application access is active.",
		);
		await expect(
			page.locator("aside").getByText("billing-manager", { exact: true }),
		).toBeVisible();

		await page.getByRole("button", { name: "Update profile" }).click();
		await page
			.getByRole("textbox", { name: "Display name" })
			.fill("Maya A. Chen");
		await page.getByRole("button", { name: "Stage profile update" }).click();
		await page.getByRole("button", { name: "Update profile" }).click();
		await expect(
			page.getByRole("textbox", { name: "Display name" }),
		).toHaveValue("Maya A. Chen");
		await page.getByRole("button", { name: "Cancel" }).click();
		await page.getByRole("button", { name: "Apply change" }).click();
		await expect(
			page.getByRole("heading", { level: 2, name: "Maya A. Chen" }),
		).toBeVisible();

		await selectUser(page, "Julian Foster");
		await provisionSelectedUser(page, "Julian Foster");
		await assignSelectedUserToGroup(page, "Julian Foster", "Developers");
		await selectUser(page, "Priya Shah");
		await provisionSelectedUser(page, "Priya Shah");
		await assignSelectedUserToGroup(page, "Priya Shah", "Finance analysts");
		expectProvisionedUserCount(databasePath, 3);

		await selectUser(page, "Maya A. Chen");
		const userStateBeforeDelete = readMayaProvisioningState(databasePath);
		await page.getByRole("button", { name: "Delete SCIM resource" }).click();
		await page.getByRole("button", { name: "Delete resource" }).click();
		await expectSuccessMessage(
			page,
			"Maya A. Chen’s SCIM resource was deleted; the Better Auth user was retained",
		);
		await expect(
			page.getByText("Deleted", { exact: true }).last(),
		).toBeVisible();
		await expect(
			page
				.locator("aside")
				.getByText(userStateBeforeDelete.applicationUserId, { exact: true }),
		).toBeVisible();

		await page.getByRole("button", { name: "Reprovision user" }).click();
		await expectSuccessMessage(
			page,
			"Maya A. Chen was reprovisioned with the retained application user",
		);
		const userStateAfterReprovision = readMayaProvisioningState(databasePath);
		expect(userStateAfterReprovision.applicationUserId).toBe(
			userStateBeforeDelete.applicationUserId,
		);
		expect(userStateAfterReprovision.scimResourceId).not.toBe(
			userStateBeforeDelete.scimResourceId,
		);
		await assignSelectedUserToGroup(
			page,
			"Maya A. Chen",
			"Finance administrators",
		);
		await expect(
			page.locator("aside").getByText("billing-manager", { exact: true }),
		).toBeVisible();

		const userWorkspaceScreenshotPath = testInfo.outputPath(
			"scim-resource-user.png",
		);
		await page.screenshot({
			path: userWorkspaceScreenshotPath,
			fullPage: true,
		});
		await testInfo.attach("SCIM resource user", {
			path: userWorkspaceScreenshotPath,
			contentType: "image/png",
		});

		await page.getByRole("link", { name: "Groups", exact: true }).click();
		await expect(
			page.getByRole("heading", { level: 2, name: "Directory groups" }),
		).toBeVisible();
		await expect(page.getByText("Provisioned", { exact: true })).toHaveCount(3);
		await page.getByRole("link", { name: "Role mappings" }).click();
		await expect(
			page.getByText("Finance administrators", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("billing-manager", { exact: true }),
		).toBeVisible();
		await page.getByRole("link", { name: "Activity", exact: true }).click();
		await expect(
			page.getByRole("heading", { level: 2, name: "SCIM activity" }),
		).toBeVisible();
		await expect(page.getByText("POST", { exact: true }).first()).toBeVisible();
		await expect(
			page.getByText("PATCH", { exact: true }).first(),
		).toBeVisible();

		const screenshotPath = testInfo.outputPath("scim-resource-workspace.png");
		await page.screenshot({ path: screenshotPath, fullPage: true });
		await testInfo.attach("SCIM resource workspace", {
			path: screenshotPath,
			contentType: "image/png",
		});
		await page.getByRole("button", { name: "Reset sandbox" }).click();
		await page.getByRole("button", { name: "Reset sandbox" }).last().click();
		await expectSuccessMessage(page, "SCIM sandbox reset");
		await page.getByRole("link", { name: "Users", exact: true }).click();
		await expect(
			page.getByText("Showing 3 of 3 users", { exact: true }),
		).toBeVisible();
		expectNoTransientSCIMData(databasePath);

		expect(browserAuthorizationHeaders).not.toContain(`Bearer ${scimToken}`);
		expect(browserConsoleErrors).toEqual([]);
		await expect(page.locator("body")).not.toContainText(scimToken);
		await expect(
			page.locator(
				"[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay",
			),
		).toHaveCount(0);
	});

	test("links a provisioned employee through the real SSO browser flow", async ({
		browser,
	}, testInfo) => {
		const adminContext = await browser.newContext();
		const employeeContext = await browser.newContext();
		const adminPage = await adminContext.newPage();
		const employeePage = await employeeContext.newPage();
		const browserRequests: Array<{
			hasAuthorization: boolean;
			leakedOIDCClientSecret: boolean;
			leakedOIDCSigningPrivateKey: boolean;
			leakedSCIMToken: boolean;
			method: string;
			pathname: string;
		}> = [];
		const browserResponses: Array<{
			leakedOIDCClientSecret: boolean;
			leakedOIDCSigningPrivateKey: boolean;
			leakedSCIMToken: boolean;
			pathname: string;
		}> = [];
		const browserResponseInspections: Promise<void>[] = [];
		const browserConsoleErrors: string[] = [];
		for (const page of [adminPage, employeePage]) {
			page.on("request", (request) => {
				const requestEvidence = JSON.stringify({
					headers: request.headers(),
					postData: request.postData(),
					url: request.url(),
				});
				browserRequests.push({
					hasAuthorization: Boolean(request.headers().authorization),
					leakedOIDCClientSecret: requestEvidence.includes(oidcClientSecret),
					leakedOIDCSigningPrivateKey: requestEvidence.includes(
						oidcSigningPrivateKeyMaterial,
					),
					leakedSCIMToken: requestEvidence.includes(scimToken),
					method: request.method(),
					pathname: new URL(request.url()).pathname,
				});
			});
			page.on("response", (response) => {
				const url = new URL(response.url());
				if (url.origin !== baseURL) return;
				if (response.status() >= 300 && response.status() < 400) return;
				const contentType = response.headers()["content-type"] ?? "";
				if (
					!contentType.startsWith("text/") &&
					!contentType.includes("json") &&
					!contentType.includes("javascript")
				) {
					return;
				}
				const inspection = response
					.body()
					.then((body) => {
						const responseEvidence = new TextDecoder().decode(body);
						browserResponses.push({
							leakedOIDCClientSecret:
								responseEvidence.includes(oidcClientSecret),
							leakedOIDCSigningPrivateKey: responseEvidence.includes(
								oidcSigningPrivateKeyMaterial,
							),
							leakedSCIMToken: responseEvidence.includes(scimToken),
							pathname: url.pathname,
						});
					})
					.catch(() => {
						// Chromium does not retain every streamed or canceled response body.
					});
				browserResponseInspections.push(inspection);
			});
			page.on("console", (message) => {
				if (message.type() === "error") {
					browserConsoleErrors.push(message.text());
				}
			});
		}

		try {
			const signUpResponse = await adminContext.request.post(
				`${baseURL}/api/auth/sign-up/email`,
				{
					data: {
						email: `scim-sso-operator-${Date.now()}@example.com`,
						name: "SCIM SSO Operator",
						password: "correct-horse-battery-staple",
					},
				},
			);
			expect(signUpResponse.ok(), await signUpResponse.text()).toBe(true);

			await adminPage.goto(`${baseURL}/dashboard/scim`);
			await expect(
				adminPage.getByRole("heading", {
					level: 1,
					name: "Directory provisioning",
				}),
			).toBeVisible();
			await adminPage.getByRole("button", { name: "Reset sandbox" }).click();
			await adminPage
				.getByRole("button", { name: "Reset sandbox" })
				.last()
				.click();
			await expectSuccessMessage(adminPage, "SCIM sandbox reset");
			expectNoTransientSCIMData(databasePath);

			const serverOutputStart = output.length;
			await selectUser(adminPage, "Maya Chen");
			await provisionSelectedUser(adminPage, "Maya Chen");
			const provisionedUserState = readMayaProvisioningState(databasePath);
			expect(provisionedUserState).toMatchObject({
				applicationEmail: provisionedUserState.userName,
				applicationName: provisionedUserState.displayName,
				applicationRole: null,
			});
			const adminInspector = adminPage.locator("aside");
			await expect(
				adminInspector.getByText(provisionedUserState.applicationUserId, {
					exact: true,
				}),
			).toBeVisible();
			await expect(
				adminInspector.getByText("Not linked", { exact: true }),
			).toBeVisible();
			await expect(
				adminInspector.getByText("No active session", { exact: true }),
			).toBeVisible();
			const employeeURL = await getMayaEmployeeURL(adminPage);
			await selectUser(adminPage, "Julian Foster");
			await provisionSelectedUser(adminPage, "Julian Foster");
			await selectUser(adminPage, "Maya Chen");
			const employeePortalURL = new URL(employeeURL);
			expect(provisionedUserState.externalId).toBe(
				`scim-demo:${employeePortalURL.searchParams.get("workspace")}:maya-chen`,
			);
			await expect
				.poll(() =>
					output.slice(serverOutputStart).includes("/api/auth/scim/v2/Users"),
				)
				.toBe(true);

			await employeePage.goto(employeeURL);
			await employeePage
				.getByRole("button", { name: "Continue with Acme SSO" })
				.click();
			await selectIdentityProviderAccount(
				employeePage,
				"Julian Foster",
				"Julian",
				async () => {
					const identityProviderPickerScreenshotPath = testInfo.outputPath(
						"scim-demo-identity-provider-picker.png",
					);
					await employeePage.screenshot({
						fullPage: true,
						path: identityProviderPickerScreenshotPath,
					});
					await testInfo.attach("SCIM demo identity provider picker", {
						contentType: "image/png",
						path: identityProviderPickerScreenshotPath,
					});
				},
			);
			await expect(
				employeePage.getByRole("heading", {
					name: "Switch employee account",
				}),
			).toBeVisible();
			await expect(
				employeePage.getByText(/signed in as Julian Foster/i),
			).toBeVisible();
			await employeePage
				.getByRole("button", { name: "Sign out to switch account" })
				.click();
			await expect(
				employeePage.getByRole("button", { name: "Continue with Acme SSO" }),
			).toBeVisible();

			await beginMayaSSOSignIn(employeePage, employeeURL);
			await expect(
				employeePage.getByRole("heading", { name: "You’re signed in" }),
			).toBeVisible();
			await expect(
				employeePage.getByText(provisionedUserState.applicationName, {
					exact: true,
				}),
			).toBeVisible();
			await expect(
				employeePage.getByText(provisionedUserState.applicationEmail, {
					exact: true,
				}),
			).toBeVisible();
			await expect(
				employeePage.getByText(provisionedUserState.applicationUserId, {
					exact: true,
				}),
			).toBeVisible();
			const employeeSignedInScreenshotPath = testInfo.outputPath(
				"scim-demo-employee-signed-in.png",
			);
			await employeePage.screenshot({
				fullPage: true,
				path: employeeSignedInScreenshotPath,
			});
			await testInfo.attach("SCIM demo employee signed in", {
				contentType: "image/png",
				path: employeeSignedInScreenshotPath,
			});
			const firstSession = await getEmployeeSession(employeeContext, baseURL);
			expect(firstSession?.user).toEqual({
				id: provisionedUserState.applicationUserId,
				email: provisionedUserState.applicationEmail,
				name: provisionedUserState.applicationName,
			});
			const authenticationLink = readMayaAuthenticationLink(
				databasePath,
				provisionedUserState.applicationUserId,
				`${baseURL}/api/scim-demo/idp`,
				provisionedUserState.externalId,
			);
			expect(authenticationLink).toMatchObject({
				issuer: `${baseURL}/api/scim-demo/idp`,
				providerAccountId: provisionedUserState.externalId,
				providerId: SCIM_DEMO_SSO_PROVIDER_ID,
				userId: provisionedUserState.applicationUserId,
			});
			expect(
				readApplicationAuthenticationCounts(
					databasePath,
					provisionedUserState.applicationUserId,
				),
			).toEqual({ users: 1, accounts: 1, sessions: 1 });
			await adminPage.reload();
			await selectUser(adminPage, "Maya Chen");
			await expect(
				adminPage.locator("aside").getByText("Linked", { exact: true }),
			).toBeVisible();
			await expect(
				adminPage.locator("aside").getByText("Active session", { exact: true }),
			).toBeVisible();
			const adminLinkedAccountScreenshotPath = testInfo.outputPath(
				"scim-demo-admin-linked-identity.png",
			);
			await adminPage.screenshot({
				fullPage: true,
				path: adminLinkedAccountScreenshotPath,
			});
			await testInfo.attach("SCIM demo linked identity", {
				contentType: "image/png",
				path: adminLinkedAccountScreenshotPath,
			});

			const employeeControlPlane = await employeeContext.request.get(
				`${baseURL}/api/scim-demo`,
			);
			expect(employeeControlPlane.status()).toBe(403);
			const employeeControlPlaneMutation = await employeeContext.request.post(
				`${baseURL}/api/scim-demo`,
				{
					headers: { origin: baseURL },
					data: { type: "reset-sandbox" },
				},
			);
			expect(employeeControlPlaneMutation.status()).toBe(403);
			expect(readMayaProvisioningState(databasePath)).toMatchObject({
				applicationUserId: provisionedUserState.applicationUserId,
				scimResourceId: provisionedUserState.scimResourceId,
			});
			await employeePage.goto(`${baseURL}/dashboard/scim`);
			await expect(employeePage).toHaveURL(`${baseURL}/dashboard`);
			await expect(
				employeePage.getByRole("heading", {
					name: "Directory provisioning",
				}),
			).not.toBeVisible();
			await employeePage.goto(employeeURL);
			await expect(
				employeePage.getByRole("heading", { name: "You’re signed in" }),
			).toBeVisible();

			await expect
				.poll(() =>
					output.slice(serverOutputStart).includes("/api/scim-demo/idp/token"),
				)
				.toBe(true);
			expect(
				browserRequests.some(
					(request) =>
						request.method === "POST" &&
						request.pathname === "/api/auth/sign-in/sso",
				),
			).toBe(true);
			expect(
				browserRequests.some(
					(request) => request.pathname === "/api/scim-demo/idp/authorize",
				),
			).toBe(true);
			expect(
				browserRequests.some(
					(request) =>
						request.pathname ===
						`/api/auth/sso/callback/${SCIM_DEMO_SSO_PROVIDER_ID}`,
				),
			).toBe(true);

			await employeePage.getByRole("button", { name: "Sign out" }).click();
			await expect(
				employeePage.getByRole("button", { name: "Continue with Acme SSO" }),
			).toBeVisible();
			await beginMayaSSOSignIn(employeePage, employeeURL);
			await expect(
				employeePage.getByRole("heading", { name: "You’re signed in" }),
			).toBeVisible();
			const repeatSession = await getEmployeeSession(employeeContext, baseURL);
			expect(repeatSession?.user.id).toBe(
				provisionedUserState.applicationUserId,
			);
			expect(
				readMayaAuthenticationLink(
					databasePath,
					provisionedUserState.applicationUserId,
					`${baseURL}/api/scim-demo/idp`,
					provisionedUserState.externalId,
				),
			).toEqual(authenticationLink);
			expect(
				readApplicationAuthenticationCounts(
					databasePath,
					provisionedUserState.applicationUserId,
				),
			).toEqual({ users: 1, accounts: 1, sessions: 1 });

			await adminPage.reload();
			await selectUser(adminPage, "Maya Chen");
			await assignSelectedUserToGroup(
				adminPage,
				"Maya Chen",
				"Finance administrators",
			);
			await employeePage.reload();
			await expect(
				employeePage.getByText("billing-manager", { exact: true }),
			).toBeVisible();
			expect(readMayaProvisioningState(databasePath).applicationRole).toBe(
				"billing-manager",
			);

			await adminPage.getByRole("button", { name: "Deactivate" }).click();
			await adminPage.getByRole("button", { name: "Apply change" }).click();
			await expectSuccessMessage(
				adminPage,
				"Maya Chen was deactivated. Application access is disabled.",
			);
			await expect
				.poll(
					async () =>
						(await getEmployeeSession(employeeContext, baseURL))?.user.id ??
						null,
				)
				.toBeNull();
			expect(
				readApplicationAuthenticationCounts(
					databasePath,
					provisionedUserState.applicationUserId,
				),
			).toEqual({ users: 1, accounts: 1, sessions: 0 });
			await employeePage.goto(employeeURL);
			await expect(
				employeePage.getByRole("heading", { name: "Account inactive" }),
			).toBeVisible();
			await attemptMayaSSOSignInOverHTTP(
				employeeContext,
				employeePage,
				baseURL,
				employeeURL,
				provisionedUserState.applicationEmail,
			);
			await expect(
				employeePage.getByRole("heading", { name: "Account inactive" }),
			).toBeVisible();
			expect(await getEmployeeSession(employeeContext, baseURL)).toBeNull();
			expect(
				readMayaAuthenticationLink(
					databasePath,
					provisionedUserState.applicationUserId,
					`${baseURL}/api/scim-demo/idp`,
					provisionedUserState.externalId,
				),
			).toEqual(authenticationLink);

			await adminPage.getByRole("button", { name: "Reactivate" }).click();
			await adminPage.getByRole("button", { name: "Apply change" }).click();
			await expectSuccessMessage(
				adminPage,
				"Maya Chen was reactivated. Application access is active.",
			);
			await beginMayaSSOSignIn(employeePage, employeeURL);
			await expect(
				employeePage.getByRole("heading", { name: "You’re signed in" }),
			).toBeVisible();
			const reactivatedSession = await getEmployeeSession(
				employeeContext,
				baseURL,
			);
			expect(reactivatedSession?.user.id).toBe(
				provisionedUserState.applicationUserId,
			);
			expect(
				readMayaAuthenticationLink(
					databasePath,
					provisionedUserState.applicationUserId,
					`${baseURL}/api/scim-demo/idp`,
					provisionedUserState.externalId,
				),
			).toEqual(authenticationLink);

			await adminPage
				.getByRole("button", { name: "Delete SCIM resource" })
				.click();
			await adminPage.getByRole("button", { name: "Delete resource" }).click();
			await expectSuccessMessage(
				adminPage,
				"Maya Chen’s SCIM resource was deleted; the Better Auth user was retained",
			);
			await expect(
				adminPage.getByText("Deleted", { exact: true }).last(),
			).toBeVisible();
			await expect(
				adminPage.getByRole("link", { name: "Preview in this session" }),
			).toBeVisible();
			await expect
				.poll(
					async () =>
						(await getEmployeeSession(employeeContext, baseURL))?.user.id ??
						null,
				)
				.toBeNull();
			await employeePage.goto(employeeURL);
			await expect(
				employeePage.getByRole("heading", { name: "Access not available" }),
			).toBeVisible();
			await attemptMayaSSOSignInOverHTTP(
				employeeContext,
				employeePage,
				baseURL,
				employeeURL,
				provisionedUserState.applicationEmail,
			);
			await expect(
				employeePage.getByRole("heading", { name: "Access not available" }),
			).toBeVisible();
			expect(
				readApplicationAuthenticationCounts(
					databasePath,
					provisionedUserState.applicationUserId,
				),
			).toEqual({ users: 1, accounts: 1, sessions: 0 });

			await adminPage.getByRole("button", { name: "Reprovision user" }).click();
			await expectSuccessMessage(
				adminPage,
				"Maya Chen was reprovisioned with the retained application user",
			);
			const reprovisionedUserState = readMayaProvisioningState(databasePath);
			expect(reprovisionedUserState.applicationUserId).toBe(
				provisionedUserState.applicationUserId,
			);
			expect(reprovisionedUserState.externalId).toBe(
				provisionedUserState.externalId,
			);
			expect(reprovisionedUserState.scimResourceId).not.toBe(
				provisionedUserState.scimResourceId,
			);
			expect(
				readMayaAuthenticationLink(
					databasePath,
					provisionedUserState.applicationUserId,
					`${baseURL}/api/scim-demo/idp`,
					provisionedUserState.externalId,
				),
			).toEqual(authenticationLink);
			await beginMayaSSOSignIn(employeePage, employeeURL);
			await expect(
				employeePage.getByRole("heading", { name: "You’re signed in" }),
			).toBeVisible();
			expect(
				(await getEmployeeSession(employeeContext, baseURL))?.user.id,
			).toBe(provisionedUserState.applicationUserId);

			await adminPage.getByRole("button", { name: "Reset sandbox" }).click();
			await adminPage
				.getByRole("button", { name: "Reset sandbox" })
				.last()
				.click();
			await expectSuccessMessage(adminPage, "SCIM sandbox reset");
			expectNoTransientSCIMData(databasePath);
			expect(
				readApplicationAuthenticationCounts(
					databasePath,
					provisionedUserState.applicationUserId,
				),
			).toEqual({ users: 0, accounts: 0, sessions: 0 });
			expect(await getEmployeeSession(employeeContext, baseURL)).toBeNull();

			expect(
				browserRequests.every(
					(request) =>
						!request.leakedOIDCClientSecret &&
						!request.leakedOIDCSigningPrivateKey &&
						!request.leakedSCIMToken,
				),
			).toBe(true);
			await Promise.all(browserResponseInspections);
			expect(
				browserResponses.filter(
					(response) =>
						response.leakedOIDCClientSecret ||
						response.leakedOIDCSigningPrivateKey ||
						response.leakedSCIMToken,
				),
			).toEqual([]);
			expect(browserRequests.some((request) => request.hasAuthorization)).toBe(
				false,
			);
			const renderedPageEvidence = [
				(await adminPage.locator("body").textContent()) ?? "",
				(await employeePage.locator("body").textContent()) ?? "",
			].join("\n");
			expect(
				[scimToken, oidcClientSecret, oidcSigningPrivateKeyMaterial].some(
					(secret) => renderedPageEvidence.includes(secret),
				),
			).toBe(false);
			expect(
				await findClientAssetSecretExposures(
					join(demoDirectory, ".next/dev/static"),
					[
						{ label: "SCIM token", value: scimToken },
						{ label: "OIDC client secret", value: oidcClientSecret },
						{
							label: "OIDC signing private key",
							value: oidcSigningPrivateKeyMaterial,
						},
					],
				),
			).toEqual([]);
			expect(browserConsoleErrors).toEqual([]);
		} finally {
			await adminContext.request
				.post(`${baseURL}/api/scim-demo`, {
					headers: { origin: baseURL },
					data: { type: "reset-sandbox" },
				})
				.catch(() => undefined);
			await Promise.all([adminContext.close(), employeeContext.close()]);
		}
	});

	test("isolates catalog resources between authenticated operators", async ({
		browser,
	}) => {
		const firstContext = await browser.newContext();
		const secondContext = await browser.newContext();
		try {
			for (const [index, context] of [firstContext, secondContext].entries()) {
				const response = await context.request.post(
					`${baseURL}/api/auth/sign-up/email`,
					{
						data: {
							email: `scim-isolation-${index}-${Date.now()}@example.com`,
							name: `SCIM Isolation Operator ${index + 1}`,
							password: "correct-horse-battery-staple",
						},
					},
				);
				expect(response.ok(), await response.text()).toBe(true);
				const provision = await context.request.post(
					`${baseURL}/api/scim-demo`,
					{
						headers: { origin: baseURL },
						data: { type: "provision-user", userKey: "maya-chen" },
					},
				);
				expect(provision.ok(), await provision.text()).toBe(true);
				const workspace = await context.request.get(`${baseURL}/api/scim-demo`);
				expect(workspace.ok(), await workspace.text()).toBe(true);
				expect(await workspace.json()).toMatchObject({
					users: expect.arrayContaining([
						expect.objectContaining({
							key: "maya-chen",
							lifecycle: "active",
						}),
					]),
				});
			}

			expectProvisionedUserCount(databasePath, 2);
			const firstReset = await firstContext.request.post(
				`${baseURL}/api/scim-demo`,
				{
					headers: { origin: baseURL },
					data: { type: "reset-sandbox" },
				},
			);
			expect(firstReset.ok(), await firstReset.text()).toBe(true);
			expectProvisionedUserCount(databasePath, 1);
			const firstWorkspace = await firstContext.request.get(
				`${baseURL}/api/scim-demo`,
			);
			expect(firstWorkspace.ok(), await firstWorkspace.text()).toBe(true);
			expect(await firstWorkspace.json()).toMatchObject({
				users: expect.arrayContaining([
					expect.objectContaining({
						key: "maya-chen",
						lifecycle: "not-provisioned",
					}),
				]),
			});

			const secondWorkspace = await secondContext.request.get(
				`${baseURL}/api/scim-demo`,
			);
			expect(secondWorkspace.ok(), await secondWorkspace.text()).toBe(true);
			expect(await secondWorkspace.json()).toMatchObject({
				users: expect.arrayContaining([
					expect.objectContaining({
						key: "maya-chen",
						lifecycle: "active",
					}),
				]),
			});

			const secondReset = await secondContext.request.post(
				`${baseURL}/api/scim-demo`,
				{
					headers: { origin: baseURL },
					data: { type: "reset-sandbox" },
				},
			);
			expect(secondReset.ok(), await secondReset.text()).toBe(true);
			expectNoTransientSCIMData(databasePath);
		} finally {
			await Promise.all([firstContext.close(), secondContext.close()]);
		}
	});

	test("does not send the SCIM credential to a forwarded host", async ({
		request,
	}) => {
		const signUpResponse = await request.post(
			`${baseURL}/api/auth/sign-up/email`,
			{
				data: {
					email: `scim-demo-security-${Date.now()}@example.com`,
					name: "SCIM Demo Security Operator",
					password: "correct-horse-battery-staple",
				},
			},
		);
		expect(signUpResponse.ok(), await signUpResponse.text()).toBe(true);

		const forwardedAuthorizationHeaders: string[] = [];
		const forwardedHost = createServer((incomingRequest, response) => {
			const authorization = incomingRequest.headers.authorization;
			if (authorization) forwardedAuthorizationHeaders.push(authorization);
			response.writeHead(404, { "content-type": "application/scim+json" });
			response.end(
				JSON.stringify({
					schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
					status: "404",
				}),
			);
		});

		try {
			const forwardedPort = await new Promise<number>((resolvePort, reject) => {
				forwardedHost.once("error", reject);
				forwardedHost.listen(0, "127.0.0.1", () => {
					const address = forwardedHost.address();
					if (address && typeof address === "object") {
						resolvePort(address.port);
						return;
					}
					reject(new Error("Could not start the forwarded-host server"));
				});
			});
			const forwardedOrigin = `http://127.0.0.1:${forwardedPort}`;

			const crossOriginResponse = await request.post(
				`${baseURL}/api/scim-demo`,
				{
					headers: {
						origin: forwardedOrigin,
						"x-forwarded-host": `127.0.0.1:${forwardedPort}`,
						"x-forwarded-proto": "http",
					},
					data: { type: "reset-sandbox" },
				},
			);
			expect(crossOriginResponse.status()).toBe(403);
			expect(forwardedAuthorizationHeaders).toEqual([]);

			const sameOriginResponse = await request.post(
				`${baseURL}/api/scim-demo`,
				{
					headers: {
						origin: baseURL,
						"x-forwarded-host": `127.0.0.1:${forwardedPort}`,
						"x-forwarded-proto": "http",
					},
					data: { type: "reset-sandbox" },
				},
			);

			expect(sameOriginResponse.status()).toBe(200);
			expect(await sameOriginResponse.text()).not.toContain(scimToken);
			expect(forwardedAuthorizationHeaders).toEqual([]);
			expectNoTransientSCIMData(databasePath);
		} finally {
			await new Promise<void>((resolveClose, reject) => {
				forwardedHost.close((error) =>
					error ? reject(error) : resolveClose(),
				);
			});
		}
	});
});
