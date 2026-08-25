import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { MigratedPublished16Database } from "../published-1-6-migration";
import { prepareMigratedPublished16Database } from "../published-1-6-migration";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const demoDirectory = resolve(process.cwd(), "../../demo/nextjs");
const demoAuthSecret =
	"better-auth-scim-demo-e2e-secret-at-least-thirty-two-characters";

interface NextDemoRuntime {
	baseURL: string;
	databasePath: string;
	process: ChildProcessWithoutNullStreams;
	readOutput: () => string;
	temporaryDirectory: string;
}

interface NextDemoRuntimeOptions {
	accountIdentityStrategy?: "issuer" | "provider-id";
	prepareDatabase?: (databasePath: string) => Promise<void>;
}

async function getAvailablePort(): Promise<number> {
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

async function stopProcess(
	child: ChildProcessWithoutNullStreams | undefined,
): Promise<void> {
	if (!child?.pid || child.exitCode !== null) return;
	const { terminate } = await import("@better-auth-test/test-utils/playwright");
	await terminate(child.pid);
}

async function startNextDemoRuntime(
	options: NextDemoRuntimeOptions = {},
): Promise<NextDemoRuntime> {
	const temporaryDirectory = await mkdtemp(
		join(tmpdir(), "better-auth-scim-managed-demo-"),
	);
	const port = await getAvailablePort();
	const baseURL = `http://127.0.0.1:${port}`;
	const databasePath = join(temporaryDirectory, "demo.sqlite");
	try {
		await options.prepareDatabase?.(databasePath);
	} catch (error) {
		await rm(temporaryDirectory, { force: true, recursive: true });
		throw error;
	}
	const environment: NodeJS.ProcessEnv = {
		...process.env,
		BETTER_AUTH_SECRET: demoAuthSecret,
		BETTER_AUTH_URL: baseURL,
		DEMO_ACCOUNT_IDENTITY_STRATEGY: options.accountIdentityStrategy,
		DEMO_SQLITE_PATH: databasePath,
		NO_COLOR: "1",
		SCIM_DEMO_CREDENTIAL_PEPPER:
			"e2e-scim-managed-catalog-secret-at-least-thirty-two-characters",
		SCIM_DEMO_ENABLED: "true",
		SCIM_DEMO_OIDC_CLIENT_SECRET:
			"e2e-scim-demo-oidc-client-secret-at-least-thirty-two-characters",
		SCIM_DEMO_OIDC_SIGNING_PRIVATE_KEY: undefined,
	};
	let output = "";
	let demoProcess: ChildProcessWithoutNullStreams | undefined;
	try {
		const migration = spawn(
			"node",
			[
				"--experimental-strip-types",
				"--input-type=module",
				"--eval",
				[
					'import { getMigrations } from "better-auth/db/migration";',
					'const { auth } = await import("./lib/auth.ts");',
					"const { runMigrations } = await getMigrations(auth.options);",
					"await runMigrations();",
				].join("\n"),
			],
			{ cwd: demoDirectory, env: environment, stdio: "pipe" },
		);
		migration.stdout.on("data", (chunk) => {
			output += chunk.toString();
		});
		migration.stderr.on("data", (chunk) => {
			output += chunk.toString();
		});
		const migrationExitCode = await new Promise<number | null>(
			(resolveExit, reject) => {
				migration.once("error", reject);
				migration.once("exit", resolveExit);
			},
		);
		if (migrationExitCode !== 0) {
			throw new Error(`Next.js demo migration failed:\n${output}`);
		}

		demoProcess = spawn(
			"pnpm",
			["dev", "--hostname", "127.0.0.1", "--port", String(port)],
			{
				cwd: demoDirectory,
				detached: true,
				env: environment,
				stdio: "pipe",
			},
		);
		demoProcess.stdout.on("data", (chunk) => {
			output += chunk.toString();
		});
		demoProcess.stderr.on("data", (chunk) => {
			output += chunk.toString();
		});
		const deadline = Date.now() + 60_000;
		while (Date.now() < deadline) {
			if (demoProcess.exitCode !== null) {
				throw new Error(`Next.js demo exited before startup:\n${output}`);
			}
			try {
				const response = await fetch(`${baseURL}/sign-in`, {
					signal: AbortSignal.timeout(1_000),
				});
				if (response.ok) {
					return {
						baseURL,
						databasePath,
						process: demoProcess,
						readOutput: () => output,
						temporaryDirectory,
					};
				}
			} catch {
				// The development server has not bound its port yet.
			}
			await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
		}
		throw new Error(`Next.js demo did not start:\n${output}`);
	} catch (error) {
		await stopProcess(demoProcess);
		await rm(temporaryDirectory, { recursive: true, force: true });
		throw error;
	}
}

async function signUp(
	context: BrowserContext,
	baseURL: string,
	input: { email: string; name: string },
): Promise<void> {
	const response = await context.request.post(
		`${baseURL}/api/auth/sign-up/email`,
		{
			data: {
				...input,
				password: "correct-horse-battery-staple",
			},
		},
	);
	expect(response.ok(), await response.text()).toBe(true);
}

async function signIn(
	context: BrowserContext,
	baseURL: string,
	email: string,
): Promise<void> {
	const response = await context.request.post(
		`${baseURL}/api/auth/sign-in/email`,
		{
			data: {
				email,
				password: "correct-horse-battery-staple",
			},
		},
	);
	expect(response.ok(), await response.text()).toBe(true);
}

async function createOrganization(
	request: APIRequestContext,
	baseURL: string,
	name: string,
): Promise<string> {
	const response = await request.post(
		`${baseURL}/api/auth/organization/create`,
		{
			headers: { origin: baseURL },
			data: {
				name,
				slug: `${name.toLowerCase().replaceAll(" ", "-")}-${Date.now()}`,
			},
		},
	);
	const body: unknown = await response.json();
	expect(response.ok(), JSON.stringify(body)).toBe(true);
	if (
		typeof body !== "object" ||
		body === null ||
		!("id" in body) ||
		typeof body.id !== "string"
	) {
		throw new Error("Organization create did not return an ID");
	}
	return body.id;
}

function managementURL(baseURL: string, organizationId: string): string {
	return `${baseURL}/api/scim-demo/organizations/${organizationId}/connections`;
}

async function createEmployeeLink(
	request: APIRequestContext,
	baseURL: string,
	organizationId: string,
	scimUserId: string,
): Promise<string> {
	const response = await request.post(
		`${managementURL(baseURL, organizationId)}/employee-links`,
		{
			headers: { origin: baseURL },
			data: { organizationId, scimUserId },
		},
	);
	expect(response.status(), await response.text()).toBe(201);
	const body: unknown = await response.json();
	if (
		typeof body !== "object" ||
		body === null ||
		!("url" in body) ||
		typeof body.url !== "string"
	) {
		throw new Error("Employee link response did not return a URL");
	}
	return body.url;
}

async function readIssuedCredential(response: {
	json(): Promise<unknown>;
}): Promise<{ id: string; token: string }> {
	const body: unknown = await response.json();
	if (
		typeof body !== "object" ||
		body === null ||
		!("issuedCredential" in body) ||
		typeof body.issuedCredential !== "object" ||
		body.issuedCredential === null ||
		!("id" in body.issuedCredential) ||
		typeof body.issuedCredential.id !== "string" ||
		!("token" in body.issuedCredential) ||
		typeof body.issuedCredential.token !== "string"
	) {
		throw new Error("SCIM management response did not issue a credential");
	}
	return {
		id: body.issuedCredential.id,
		token: body.issuedCredential.token,
	};
}

async function scimRequest(
	request: APIRequestContext,
	baseURL: string,
	token: string,
	input: {
		method: "GET" | "POST" | "PATCH";
		path: string;
		data?: unknown;
	},
) {
	return await request.fetch(`${baseURL}/api/auth/scim/v2${input.path}`, {
		method: input.method,
		headers: {
			accept: "application/scim+json",
			authorization: `Bearer ${token}`,
			"content-type": "application/scim+json",
		},
		...(input.data === undefined ? {} : { data: input.data }),
	});
}

function readResourceId(value: unknown): string {
	if (
		typeof value !== "object" ||
		value === null ||
		!("id" in value) ||
		typeof value.id !== "string"
	) {
		throw new Error("SCIM response did not contain a resource ID");
	}
	return value.id;
}

function readCatalogSnapshot(
	databasePath: string,
	provisioningDomainId: string,
) {
	const database = new DatabaseSync(databasePath, { readOnly: true });
	try {
		const row = database
			.prepare(
				`SELECT
					c."id" AS "connectionRecordId",
					c."connectionId",
					c."status" AS "connectionStatus",
					k."credentialId",
					k."tokenDigest",
					k."hashVersion",
					k."activeSlotKey",
					k."status" AS "credentialStatus",
					k."lastUsedAt"
				 FROM "scimManagedConnection" c
				 JOIN "scimManagedCredential" k
				   ON k."connectionRecordId" = c."id"
				 WHERE c."provisioningDomainId" = ?
				 ORDER BY k."createdAt" ASC`,
			)
			.all(provisioningDomainId);
		return row;
	} finally {
		database.close();
	}
}

function readDatabaseSecuritySnapshot(databasePath: string): {
	tableNames: string[];
	serializedRows: string;
} {
	const database = new DatabaseSync(databasePath, { readOnly: true });
	try {
		const tableNames = database
			.prepare(
				`SELECT "name"
				 FROM "sqlite_master"
				 WHERE "type" = 'table' AND "name" NOT LIKE 'sqlite_%'
				 ORDER BY "name" ASC`,
			)
			.all()
			.map((row) => String(row.name));
		const rowsByTable = tableNames.map((tableName) => {
			const quotedName = tableName.replaceAll('"', '""');
			return [
				tableName,
				database.prepare(`SELECT * FROM "${quotedName}"`).all(),
			];
		});
		return {
			tableNames,
			serializedRows: JSON.stringify(rowsByTable, (_key, value) =>
				typeof value === "bigint" ? value.toString() : value,
			),
		};
	} finally {
		database.close();
	}
}

async function completeEmployeeSignIn(page: Page): Promise<void> {
	await expect(
		page.getByRole("heading", { name: "Sign in to Acme" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Continue with Acme SSO" }).click();
	await expect(
		page.getByRole("heading", { name: "Sign in with Acme Identity" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Continue as Maya" }).click();
	try {
		await expect(
			page.getByRole("heading", { name: "You’re signed in" }),
		).toBeVisible();
	} catch (error) {
		throw new Error(
			`Employee SSO did not complete at ${page.url()}:\n${await page.locator("body").innerText()}`,
			{ cause: error },
		);
	}
}

test.describe.configure({ mode: "serial" });

test.describe("Next.js managed SCIM catalog demo", () => {
	test.describe.configure({ mode: "serial" });
	test.setTimeout(120_000);

	let runtime: NextDemoRuntime;

	test.beforeAll(async () => {
		runtime = await startNextDemoRuntime();
	});

	test.afterAll(async () => {
		await stopProcess(runtime?.process);
		if (runtime) {
			await rm(runtime.temporaryDirectory, {
				recursive: true,
				force: true,
			});
		}
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10411
	 */
	test("creates, provisions, rotates, revokes, isolates, audits, and decommissions through the real UI and SCIM endpoint", async ({
		browser,
		page,
	}) => {
		const ownerEmail = `managed-scim-owner-${Date.now()}@example.com`;
		await signUp(page.context(), runtime.baseURL, {
			email: ownerEmail,
			name: "Managed SCIM Owner",
		});
		const organizationId = await createOrganization(
			page.request,
			runtime.baseURL,
			"Managed SCIM Acme",
		);
		const provisioningDomainId = `scim-demo-org:${organizationId}`;

		await page.goto(`${runtime.baseURL}/dashboard/scim`);
		await expect(
			page.getByRole("heading", { name: "Directory provisioning" }),
		).toBeVisible();
		const createResponsePromise = page.waitForResponse(
			(response) =>
				response.url() === managementURL(runtime.baseURL, organizationId) &&
				response.request().method() === "POST",
		);
		await page.getByRole("button", { name: "Create SCIM connection" }).click();
		const createResponse = await createResponsePromise;
		expect(
			createResponse.status(),
			`${await createResponse.text()}\n${runtime.readOutput()}`,
		).toBe(201);
		const original = await readIssuedCredential(createResponse);
		expect(original.token).toMatch(
			new RegExp(`^${original.id}\\.[A-Za-z0-9_-]+$`),
		);
		await expect(
			page.getByRole("heading", { name: "Workforce SSO provider" }),
		).toBeVisible();
		await expect(page.locator("#scim-issued-token")).toHaveValue(
			original.token,
		);
		await page.reload();
		await expect(page.locator("#scim-issued-token")).toHaveCount(0);
		await expect(
			page.getByRole("heading", { name: "Workforce SSO provider" }),
		).toBeVisible();

		const anonymousContext = await browser.newContext();
		try {
			const unauthenticated = await anonymousContext.request.get(
				managementURL(runtime.baseURL, organizationId),
			);
			expect(unauthenticated.status()).toBe(401);
		} finally {
			await anonymousContext.close();
		}
		const crossOriginMutation = await page.request.post(
			managementURL(runtime.baseURL, organizationId),
			{
				headers: { origin: "https://attacker.invalid" },
				data: { organizationId },
			},
		);
		expect(crossOriginMutation.status()).toBe(403);

		const initialRows = readCatalogSnapshot(
			runtime.databasePath,
			provisioningDomainId,
		);
		expect(initialRows).toHaveLength(1);
		expect(initialRows[0]).toMatchObject({
			connectionStatus: "active",
			credentialId: original.id,
			credentialStatus: "active",
			hashVersion: "v1",
		});
		expect(String(initialRows[0]?.tokenDigest)).not.toContain(original.token);
		expect(String(initialRows[0]?.activeSlotKey)).toContain(":active:0");
		expect(
			readDatabaseSecuritySnapshot(runtime.databasePath).tableNames.filter(
				(tableName) => /^scimDemo/i.test(tableName),
			),
		).toEqual([]);
		const idpContext = await browser.newContext();

		const userCreate = await scimRequest(
			idpContext.request,
			runtime.baseURL,
			original.token,
			{
				method: "POST",
				path: "/Users",
				data: {
					schemas: [USER_SCHEMA],
					externalId: "entra:acme:maya",
					userName: "maya@acme.example",
					displayName: "Maya Chen",
					name: { givenName: "Maya", familyName: "Chen" },
					emails: [
						{
							value: "maya@acme.example",
							type: "work",
							primary: true,
						},
					],
					active: "True",
				},
			},
		);
		expect(userCreate.status(), await userCreate.text()).toBe(201);
		const userId = readResourceId(await userCreate.json());
		const groupCreate = await scimRequest(
			idpContext.request,
			runtime.baseURL,
			original.token,
			{
				method: "POST",
				path: "/Groups",
				data: {
					schemas: [GROUP_SCHEMA],
					externalId: "okta:acme:finance",
					displayName: "Finance",
					members: [{ value: userId }],
				},
			},
		);
		expect(groupCreate.status(), await groupCreate.text()).toBe(201);
		const groupId = readResourceId(await groupCreate.json());
		const groupUpdate = await scimRequest(
			idpContext.request,
			runtime.baseURL,
			original.token,
			{
				method: "PATCH",
				path: `/Groups/${groupId}`,
				data: {
					schemas: [PATCH_SCHEMA],
					Operations: [
						{ op: "Replace", path: "displayName", value: "Finance Admins" },
					],
				},
			},
		);
		expect(groupUpdate.status(), await groupUpdate.text()).toBe(200);
		const userDeactivate = await scimRequest(
			idpContext.request,
			runtime.baseURL,
			original.token,
			{
				method: "PATCH",
				path: `/Users/${userId}`,
				data: {
					schemas: [PATCH_SCHEMA],
					Operations: [{ op: "Replace", path: "active", value: "False" }],
				},
			},
		);
		expect(userDeactivate.status(), await userDeactivate.text()).toBe(200);
		const deactivatedUser = await scimRequest(
			idpContext.request,
			runtime.baseURL,
			original.token,
			{ method: "GET", path: `/Users/${userId}` },
		);
		expect(deactivatedUser.status()).toBe(200);
		expect((await deactivatedUser.json()) as { active: boolean }).toMatchObject(
			{ active: false },
		);

		const firstRead = await scimRequest(
			idpContext.request,
			runtime.baseURL,
			original.token,
			{ method: "GET", path: "/Users" },
		);
		expect(firstRead.status()).toBe(200);
		const lastUsedAfterFirstRead = readCatalogSnapshot(
			runtime.databasePath,
			provisioningDomainId,
		)[0]?.lastUsedAt;
		const secondRead = await scimRequest(
			idpContext.request,
			runtime.baseURL,
			original.token,
			{ method: "GET", path: "/Users" },
		);
		expect(secondRead.status()).toBe(200);
		expect(
			readCatalogSnapshot(runtime.databasePath, provisioningDomainId)[0]
				?.lastUsedAt,
		).toBe(lastUsedAfterFirstRead);

		await page.reload();
		await expect(
			page.getByRole("heading", { name: "Users (1)" }),
		).toBeVisible();
		await expect(
			page.getByText("Finance Admins", { exact: true }),
		).toBeVisible();

		const rotateResponsePromise = page.waitForResponse(
			(response) =>
				response.url() ===
					`${managementURL(runtime.baseURL, organizationId)}/rotate` &&
				response.request().method() === "POST",
		);
		await page.getByRole("button", { name: "Rotate credential" }).click();
		const rotateResponse = await rotateResponsePromise;
		expect(rotateResponse.status()).toBe(201);
		const rotated = await readIssuedCredential(rotateResponse);
		expect(rotated.token).not.toBe(original.token);
		expect(
			(
				await scimRequest(idpContext.request, runtime.baseURL, original.token, {
					method: "GET",
					path: "/Users",
				})
			).status(),
		).toBe(200);
		expect(
			(
				await scimRequest(idpContext.request, runtime.baseURL, rotated.token, {
					method: "GET",
					path: "/Users",
				})
			).status(),
		).toBe(200);

		const revokeResponsePromise = page.waitForResponse(
			(response) =>
				response.url() ===
					`${managementURL(
						runtime.baseURL,
						organizationId,
					)}/credentials/${original.id}/revoke` &&
				response.request().method() === "POST",
		);
		await page
			.getByRole("button", { name: `Revoke credential ${original.id}` })
			.click();
		expect((await revokeResponsePromise).status()).toBe(200);
		expect(
			(
				await scimRequest(idpContext.request, runtime.baseURL, original.token, {
					method: "GET",
					path: "/Users",
				})
			).status(),
		).toBe(401);
		expect(
			(
				await scimRequest(idpContext.request, runtime.baseURL, rotated.token, {
					method: "GET",
					path: "/Users",
				})
			).status(),
		).toBe(200);
		await expect(page.getByTestId("scim-event-history")).toContainText(
			"credential.rotated",
		);
		await expect(page.getByTestId("scim-event-history")).toContainText(
			"credential.revoked",
		);

		const tenantBContext = await browser.newContext();
		try {
			await signUp(tenantBContext, runtime.baseURL, {
				email: `managed-scim-tenant-b-${Date.now()}@example.com`,
				name: "Managed SCIM Tenant B",
			});
			const tenantBOrganizationId = await createOrganization(
				tenantBContext.request,
				runtime.baseURL,
				"Managed SCIM Tenant B",
			);
			const tenantBCreate = await tenantBContext.request.post(
				managementURL(runtime.baseURL, tenantBOrganizationId),
				{
					headers: { origin: runtime.baseURL },
					data: { organizationId: tenantBOrganizationId },
				},
			);
			expect(tenantBCreate.status()).toBe(201);
			const tenantB = await readIssuedCredential(tenantBCreate);
			const tenantBUsers = await scimRequest(
				tenantBContext.request,
				runtime.baseURL,
				tenantB.token,
				{ method: "GET", path: "/Users" },
			);
			expect(tenantBUsers.status()).toBe(200);
			expect(await tenantBUsers.json()).toMatchObject({ totalResults: 0 });
			expect(
				(
					await page.request.get(
						managementURL(runtime.baseURL, tenantBOrganizationId),
					)
				).status(),
			).toBe(403);
		} finally {
			await tenantBContext.close();
		}

		const decommissionResponsePromise = page.waitForResponse(
			(response) =>
				response.url() ===
					`${managementURL(runtime.baseURL, organizationId)}/decommission` &&
				response.request().method() === "POST",
		);
		await page.getByRole("button", { name: "Decommission connection" }).click();
		await page
			.getByRole("button", { name: "Decommission permanently" })
			.click();
		expect((await decommissionResponsePromise).status()).toBe(200);
		await expect(
			page.getByText("Connection permanently decommissioned"),
		).toBeVisible();
		expect(
			(
				await scimRequest(idpContext.request, runtime.baseURL, rotated.token, {
					method: "GET",
					path: "/Users",
				})
			).status(),
		).toBe(401);

		const finalRows = readCatalogSnapshot(
			runtime.databasePath,
			provisioningDomainId,
		);
		expect(finalRows).toHaveLength(2);
		expect(
			finalRows.every((row) => row.connectionStatus === "decommissioned"),
		).toBe(true);
		expect(
			finalRows.every(
				(row) =>
					row.credentialStatus === "revoked" ||
					row.credentialStatus === "decommissioned",
			),
		).toBe(true);
		const finalManagementResponse = await page.request.get(
			managementURL(runtime.baseURL, organizationId),
		);
		expect(finalManagementResponse.status()).toBe(200);
		const finalManagementBody: unknown = await finalManagementResponse.json();
		const finalManagementJSON = JSON.stringify(finalManagementBody);
		expect(finalManagementJSON).not.toContain(original.token);
		expect(finalManagementJSON).not.toContain(rotated.token);
		expect(finalManagementJSON).not.toContain("issuedCredential");
		if (
			typeof finalManagementBody !== "object" ||
			finalManagementBody === null ||
			!("events" in finalManagementBody) ||
			!Array.isArray(finalManagementBody.events)
		) {
			throw new Error("Final SCIM management response omitted event history");
		}
		const eventJSON = JSON.stringify(finalManagementBody.events);
		expect(eventJSON).toContain("connection.decommissioned");
		expect(eventJSON).not.toContain(original.token);
		expect(eventJSON).not.toContain(rotated.token);
		const databaseSecurity = readDatabaseSecuritySnapshot(runtime.databasePath);
		expect(
			databaseSecurity.tableNames.filter((tableName) =>
				/^scimDemo/i.test(tableName),
			),
		).toEqual([]);
		expect(databaseSecurity.serializedRows).not.toContain(original.token);
		expect(databaseSecurity.serializedRows).not.toContain(rotated.token);
		await idpContext.close();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10411
	 */
	test("retains the Entra Recipe v2 and SSO identity proof on framework-managed credentials", async ({
		browser,
		page,
	}) => {
		await signUp(page.context(), runtime.baseURL, {
			email: `managed-recipe-owner-${Date.now()}@example.com`,
			name: "Managed Recipe Owner",
		});
		const organizationId = await createOrganization(
			page.request,
			runtime.baseURL,
			"Managed Entra Recipe",
		);
		const provisioningDomainId = `scim-demo-org:${organizationId}`;
		await page.goto(`${runtime.baseURL}/dashboard/scim`);
		const createResponsePromise = page.waitForResponse(
			(response) =>
				response.url() === managementURL(runtime.baseURL, organizationId) &&
				response.request().method() === "POST",
		);
		await page.getByRole("button", { name: "Create SCIM connection" }).click();
		expect((await createResponsePromise).status()).toBe(201);

		const observedRequests: Array<{
			body: unknown;
			method: string;
			pathname: string;
			search: string;
		}> = [];
		page.on("request", (request) => {
			const url = new URL(request.url());
			if (!url.pathname.startsWith("/api/auth/scim/v2")) return;
			let body: unknown = null;
			try {
				body = request.postDataJSON();
			} catch {
				// Reads do not carry a JSON body.
			}
			observedRequests.push({
				body,
				method: request.method(),
				pathname: url.pathname,
				search: url.search,
			});
		});

		await page.getByRole("button", { name: "Run local recipe" }).click();
		await expect(
			page.getByRole("heading", { name: "Recipe complete" }),
		).toBeVisible();
		await expect(
			page
				.getByTestId("entra-local-recipe-steps")
				.locator('[data-step-status="passed"]'),
		).toHaveCount(10);
		await expect(
			page.getByRole("heading", { name: "Users (2)" }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Groups (1)" }),
		).toBeVisible();

		const groupLookup = observedRequests.find((request) => {
			if (request.method !== "GET" || !request.pathname.endsWith("/Groups")) {
				return false;
			}
			return (
				new URLSearchParams(request.search).get("filter") ===
				'displayName eq "Finance administrators"'
			);
		});
		const legacyGroupCreate = observedRequests.find((request) => {
			if (request.method !== "POST" || !request.pathname.endsWith("/Groups")) {
				return false;
			}
			if (typeof request.body !== "object" || request.body === null) {
				return false;
			}
			if (
				!("schemas" in request.body) ||
				!Array.isArray(request.body.schemas)
			) {
				return false;
			}
			return request.body.schemas.includes(
				"http://schemas.microsoft.com/2006/11/ResourceManagement/ADSCIM/2.0/Group",
			);
		});
		const enterprisePatch = observedRequests.find((request) => {
			if (request.method !== "PATCH" || !request.pathname.includes("/Users/")) {
				return false;
			}
			return JSON.stringify(request.body).includes(
				"urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department",
			);
		});
		const stringBooleanPatch = observedRequests.find((request) => {
			if (request.method !== "PATCH" || !request.pathname.includes("/Users/")) {
				return false;
			}
			return JSON.stringify(request.body).includes('"value":"False"');
		});

		expect(groupLookup).toBeDefined();
		expect(legacyGroupCreate).toBeDefined();
		expect(enterprisePatch).toBeDefined();
		expect(JSON.stringify(enterprisePatch?.body)).toContain('"path":"manager"');
		expect(stringBooleanPatch).toBeDefined();

		const database = new DatabaseSync(runtime.databasePath, {
			readOnly: true,
		});
		let maya: Record<string, unknown> = {};
		try {
			const users = database
				.prepare(
					`SELECT "id", "userId", "externalId", "active", "serializedAttributes"
					 FROM "scimUser"
					 WHERE "provisioningDomainId" = ?
					 ORDER BY "userName" ASC`,
				)
				.all(provisioningDomainId);
			const groups = database
				.prepare(
					`SELECT "displayName"
					 FROM "scimGroup"
					 WHERE "provisioningDomainId" = ?`,
				)
				.all(provisioningDomainId);
			expect(users).toHaveLength(2);
			expect(groups).toEqual([
				expect.objectContaining({ displayName: "Finance administrators" }),
			]);
			expect(users).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ active: 1 }),
					expect.objectContaining({ active: 0 }),
				]),
			);
			const julian = users.find((user) =>
				String(user.serializedAttributes).includes("Senior Finance Analyst"),
			);
			expect(String(julian?.serializedAttributes)).toContain(
				"Financial Planning",
			);
			expect(String(julian?.serializedAttributes)).toContain("manager");
			maya =
				users.find(
					(user) =>
						typeof user.externalId === "string" &&
						String(user.serializedAttributes).includes("Finance Director"),
				) ?? {};
			expect(maya.id).toEqual(expect.any(String));
			expect(
				database
					.prepare(
						`SELECT COUNT(*) AS "count"
						 FROM "account"
						 WHERE "providerId" = 'scim-demo-sso'`,
					)
					.get(),
			).toEqual({ count: 0 });
		} finally {
			database.close();
		}

		const employeeLinkURL = await createEmployeeLink(
			page.request,
			runtime.baseURL,
			organizationId,
			String(maya.id),
		);
		const employeeContext = await browser.newContext();
		try {
			const employeePage = await employeeContext.newPage();
			await employeePage.goto(employeeLinkURL);
			await completeEmployeeSignIn(employeePage);
		} finally {
			await employeeContext.close();
		}

		const accountDatabase = new DatabaseSync(runtime.databasePath, {
			readOnly: true,
		});
		try {
			const accounts = accountDatabase
				.prepare(
					`SELECT "issuer", "providerId", "accountId", "userId"
					 FROM "account"
					 WHERE "providerId" = 'scim-demo-sso'`,
				)
				.all();
			expect(accounts).toEqual([
				{
					issuer: `${runtime.baseURL}/api/scim-demo/idp`,
					providerId: "scim-demo-sso",
					accountId: maya.externalId,
					userId: maya.userId,
				},
			]);
			expect(
				accountDatabase
					.prepare(
						`SELECT COUNT(*) AS "count"
						 FROM "user"
						 WHERE "id" = ?`,
					)
					.get(maya.userId),
			).toEqual({ count: 1 });
		} finally {
			accountDatabase.close();
		}
	});
});

test.describe("Next.js SCIM and SSO demo on a migrated published 1.6 database", () => {
	test.describe.configure({ mode: "serial" });
	test.setTimeout(180_000);

	let migration: MigratedPublished16Database | undefined;
	let runtime: NextDemoRuntime | undefined;

	test.beforeAll(async () => {
		runtime = await startNextDemoRuntime({
			accountIdentityStrategy: "provider-id",
			prepareDatabase: async (databasePath) => {
				migration = await prepareMigratedPublished16Database(
					databasePath,
					demoAuthSecret,
				);
			},
		});
	});

	test.afterAll(async () => {
		await stopProcess(runtime?.process);
		if (runtime) {
			await rm(runtime.temporaryDirectory, {
				recursive: true,
				force: true,
			});
		}
	});

	test("runs the real SCIM lifecycle and repeated OIDC SSO sign-in without re-keying migrated identities", async ({
		browser,
		page,
	}) => {
		if (!runtime || !migration) {
			throw new Error("The migrated Next.js demo runtime was not prepared");
		}

		await signIn(
			page.context(),
			runtime.baseURL,
			"administrator@migration.example.com",
		);
		const organizationId = await createOrganization(
			page.request,
			runtime.baseURL,
			"Migrated SCIM Demo",
		);
		const provisioningDomainId = `scim-demo-org:${organizationId}`;

		await page.goto(`${runtime.baseURL}/dashboard/scim`);
		const createResponsePromise = page.waitForResponse(
			(response) =>
				response.url() === managementURL(runtime.baseURL, organizationId) &&
				response.request().method() === "POST",
		);
		await page.getByRole("button", { name: "Create SCIM connection" }).click();
		const createResponse = await createResponsePromise;
		expect(createResponse.status()).toBe(201);
		const originalCredential = await readIssuedCredential(createResponse);

		await page.getByRole("button", { name: "Run local recipe" }).click();
		await expect(
			page.getByRole("heading", { name: "Recipe complete" }),
		).toBeVisible();
		await expect(
			page
				.getByTestId("entra-local-recipe-steps")
				.locator('[data-step-status="passed"]'),
		).toHaveCount(10);
		await expect(
			page.getByRole("heading", { name: "Users (2)" }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Groups (1)" }),
		).toBeVisible();

		const database = new DatabaseSync(runtime.databasePath, {
			readOnly: true,
		});
		let demoEmployee: {
			externalId: string;
			id: string;
			userId: string;
		};
		try {
			const employee = database
				.prepare(
					`SELECT "id", "userId", "externalId"
					 FROM "scimUser"
					 WHERE "provisioningDomainId" = ?
					   AND "serializedAttributes" LIKE '%Finance Director%'`,
				)
				.get(provisioningDomainId);
			if (
				typeof employee?.id !== "string" ||
				typeof employee.userId !== "string" ||
				typeof employee.externalId !== "string"
			) {
				throw new Error("The migrated demo did not provision its SSO employee");
			}
			demoEmployee = {
				externalId: employee.externalId,
				id: employee.id,
				userId: employee.userId,
			};
			expect(
				database
					.prepare(
						`SELECT COUNT(*) AS "count"
						 FROM "account"
						 WHERE "providerId" = 'scim-demo-sso'`,
					)
					.get(),
			).toEqual({ count: 0 });
		} finally {
			database.close();
		}

		for (let signInAttempt = 0; signInAttempt < 2; signInAttempt += 1) {
			const employeeLink = await createEmployeeLink(
				page.request,
				runtime.baseURL,
				organizationId,
				demoEmployee.id,
			);
			const employeeContext = await browser.newContext();
			try {
				const employeePage = await employeeContext.newPage();
				await employeePage.goto(employeeLink);
				await completeEmployeeSignIn(employeePage);
			} finally {
				await employeeContext.close();
			}
		}

		const migratedDatabase = new DatabaseSync(runtime.databasePath, {
			readOnly: true,
		});
		try {
			const accounts = migratedDatabase
				.prepare(
					`SELECT "issuer", "providerId", "accountId", "userId"
					 FROM "account"
					 WHERE "providerId" IN (
					   'credential',
					   'scim-demo-sso',
					   'workforce-scim',
					   'workforce-sso'
					 )
					 ORDER BY "providerId", "accountId"`,
				)
				.all();
			expect(accounts).toEqual([
				expect.objectContaining({
					issuer: "local:credential",
					providerId: "credential",
					userId: migration.source.administratorUserId,
				}),
				{
					issuer: "local:oauth:scim-demo-sso",
					providerId: "scim-demo-sso",
					accountId: demoEmployee.externalId,
					userId: demoEmployee.userId,
				},
				{
					issuer: "local:oauth:workforce-sso",
					providerId: "workforce-sso",
					accountId: migration.source.directorySubject,
					userId: migration.verified.ssoUserId,
				},
			]);
			expect(
				migratedDatabase
					.prepare(
						`SELECT "userId"
						 FROM "scimUser"
						 WHERE "id" = ?`,
					)
					.get(migration.verified.reprovisionedSCIMUserId),
			).toEqual({ userId: migration.verified.scimUserId });
		} finally {
			migratedDatabase.close();
		}

		const rotateResponsePromise = page.waitForResponse(
			(response) =>
				response.url() ===
					`${managementURL(runtime.baseURL, organizationId)}/rotate` &&
				response.request().method() === "POST",
		);
		await page.getByRole("button", { name: "Rotate credential" }).click();
		const rotateResponse = await rotateResponsePromise;
		expect(rotateResponse.status()).toBe(201);
		const rotatedCredential = await readIssuedCredential(rotateResponse);
		expect(rotatedCredential.token).not.toBe(originalCredential.token);

		const revokeResponsePromise = page.waitForResponse(
			(response) =>
				response.url() ===
					`${managementURL(
						runtime.baseURL,
						organizationId,
					)}/credentials/${originalCredential.id}/revoke` &&
				response.request().method() === "POST",
		);
		await page
			.getByRole("button", {
				name: `Revoke credential ${originalCredential.id}`,
			})
			.click();
		expect((await revokeResponsePromise).status()).toBe(200);
		expect(
			(
				await scimRequest(
					page.request,
					runtime.baseURL,
					originalCredential.token,
					{ method: "GET", path: "/Users" },
				)
			).status(),
		).toBe(401);
		expect(
			(
				await scimRequest(
					page.request,
					runtime.baseURL,
					rotatedCredential.token,
					{ method: "GET", path: "/Users" },
				)
			).status(),
		).toBe(200);

		const decommissionResponsePromise = page.waitForResponse(
			(response) =>
				response.url() ===
					`${managementURL(runtime.baseURL, organizationId)}/decommission` &&
				response.request().method() === "POST",
		);
		await page.getByRole("button", { name: "Decommission connection" }).click();
		await page
			.getByRole("button", { name: "Decommission permanently" })
			.click();
		expect((await decommissionResponsePromise).status()).toBe(200);
		await expect(
			page.getByText("Connection permanently decommissioned"),
		).toBeVisible();
	});
});
