import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { getSCIMDemoCompletedOperations } from "../../../../demo/nextjs/lib/scim-demo-service.ts";

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

function readCount(database: DatabaseSync, query: string) {
	const row = database.prepare(query).get();
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

function readMayaIdentity(databasePath: string) {
	const database = new DatabaseSync(databasePath, { readOnly: true });
	try {
		const row = database
			.prepare(
				`SELECT "id" AS "scimResourceId", "userId" AS "applicationUserId", "externalId"
				 FROM "scimUser"
				 WHERE "userName" LIKE 'maya.chen+%@acme.example'`,
			)
			.get();
		if (
			typeof row?.scimResourceId !== "string" ||
			typeof row.applicationUserId !== "string" ||
			typeof row.externalId !== "string"
		) {
			throw new Error("Maya Chen's SCIM identity was not found");
		}
		return {
			scimResourceId: row.scimResourceId,
			applicationUserId: row.applicationUserId,
			externalId: row.externalId,
		};
	} finally {
		database.close();
	}
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

function createDeferred() {
	let resolve = () => {};
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

async function selectUser(page: Page, name: string) {
	await page
		.getByRole("button", { name: new RegExp(name) })
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
	await page.getByRole("button", { name: "Apply directory change" }).click();
	await expectSuccessMessage(page, `${name}’s groups were synchronized`);
}

test.describe("Next.js SCIM demo", () => {
	test.describe.configure({ mode: "serial" });
	test.setTimeout(120_000);

	let baseURL = "";
	let demoProcess: ChildProcessWithoutNullStreams | undefined;
	let temporaryDirectory = "";
	let databasePath = "";
	let output = "";
	const scimToken = "e2e-scim-token-that-must-stay-on-the-server";

	test.beforeAll(async () => {
		temporaryDirectory = await mkdtemp(
			join(tmpdir(), "better-auth-scim-demo-"),
		);
		const port = await getAvailablePort();
		baseURL = `http://127.0.0.1:${port}`;
		databasePath = join(temporaryDirectory, "demo.sqlite");
		const environment = {
			...process.env,
			BETTER_AUTH_SECRET:
				"better-auth-scim-demo-e2e-secret-at-least-thirty-two-characters",
			BETTER_AUTH_URL: baseURL,
			DEMO_SQLITE_PATH: databasePath,
			NO_COLOR: "1",
			SCIM_DEMO_ENABLED: "true",
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
				env: environment,
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
		let startupError: Error | undefined;
		demoProcess.once("error", (error) => {
			startupError = error;
		});
		await waitForDemo(
			baseURL,
			demoProcess,
			() => output,
			() => startupError,
		);
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
		const accessResponse = await request.get(
			`${baseURL}/api/scim-demo/access/maya-chen`,
		);
		expect(accessResponse.status()).toBe(401);
		expect(await accessResponse.json()).toEqual({
			error: "Authentication required",
		});
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
		const identity = readMayaIdentity(databasePath);
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
		await page.getByRole("button", { name: "Apply directory change" }).click();

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
		const identity = readMayaIdentity(databasePath);
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

	test("runs a real SCIM lifecycle from the authenticated demo UI", async ({
		page,
	}, testInfo) => {
		const browserAuthorizationHeaders: string[] = [];
		const browserConsoleErrors: string[] = [];
		const expectedAccessDenialMessages: string[] = [];
		const expectedAccessDenialResponses: string[] = [];
		const initialBrowserWorkspaceRequests: string[] = [];
		page.on("console", (message) => {
			if (message.type() !== "error") return;
			if (
				message.text() ===
				"Failed to load resource: the server responded with a status of 403 (Forbidden)"
			) {
				expectedAccessDenialMessages.push(message.text());
				return;
			}
			browserConsoleErrors.push(message.text());
		});
		page.on("response", (response) => {
			if (
				response.status() === 403 &&
				response.url() === `${baseURL}/api/scim-demo/access/maya-chen`
			) {
				expectedAccessDenialResponses.push(response.url());
			}
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
				name: "Resource-first operations",
			}),
		).toBeVisible();
		await expect(
			page.getByText("Acme directory: Connected", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Showing 3 of 3 users", { exact: true }),
		).toBeVisible();
		const selectedMayaButton = page
			.getByRole("button", { name: /Maya Chen/ })
			.first();
		await expect(selectedMayaButton).toHaveAttribute("aria-current", "true");
		await expect(selectedMayaButton).not.toHaveAttribute("aria-pressed");
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
		await page
			.locator("aside")
			.getByRole("button", { name: "Check application access" })
			.click();
		await expect(
			page.locator("aside").getByText("Authorized", { exact: true }),
		).toBeVisible();
		const activeAccess = await page.request.get(
			`${baseURL}/api/scim-demo/access/maya-chen`,
		);
		expect(activeAccess.status()).toBe(200);
		expect(await activeAccess.json()).toMatchObject({
			allowed: true,
			role: "billing-manager",
			userKey: "maya-chen",
		});
		const delayedAccessURL = `${baseURL}/api/scim-demo/access/maya-chen`;
		const accessRequestStarted = createDeferred();
		const releaseAccessRequest = createDeferred();
		await page.route(delayedAccessURL, async (route) => {
			accessRequestStarted.resolve();
			await releaseAccessRequest.promise;
			await route.continue();
		});
		await page
			.locator("aside")
			.getByRole("button", { name: "Check application access" })
			.click();
		await accessRequestStarted.promise;
		await selectUser(page, "Julian Foster");
		const delayedAccessResponse = page.waitForResponse(delayedAccessURL);
		releaseAccessRequest.resolve();
		expect((await delayedAccessResponse).status()).toBe(200);
		await expect(
			page.locator("aside").getByText("Authorized", { exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByText("The application authorized this user", { exact: true }),
		).toHaveCount(0);
		await page.unroute(delayedAccessURL);
		await selectUser(page, "Maya Chen");

		await page.getByRole("button", { name: "Deactivate" }).click();
		await expect(
			page.getByText("Deactivate application access", { exact: false }),
		).toBeVisible();
		await selectUser(page, "Julian Foster");
		await selectUser(page, "Maya Chen");
		await expect(
			page.getByText("Deactivate application access", { exact: false }),
		).toBeVisible();
		await page.getByRole("button", { name: "Apply directory change" }).click();
		await expectSuccessMessage(
			page,
			"Maya Chen was deactivated. Application access is disabled.",
		);
		await expect(
			page.locator("aside").getByText("Disabled", { exact: true }),
		).toBeVisible();
		await expect(
			page
				.locator("aside")
				.getByText("Finance administrators", { exact: true }),
		).toBeVisible();
		await page
			.locator("aside")
			.getByRole("button", { name: "Check application access" })
			.click();
		await expect(
			page.locator("aside").getByText("Denied", { exact: true }),
		).toBeVisible();
		const inactiveAccess = await page.request.get(
			`${baseURL}/api/scim-demo/access/maya-chen`,
		);
		expect(inactiveAccess.status()).toBe(403);
		expect(await inactiveAccess.json()).toMatchObject({
			allowed: false,
			role: null,
			userKey: "maya-chen",
		});

		await page.getByRole("button", { name: "Reactivate" }).click();
		await page.getByRole("button", { name: "Apply directory change" }).click();
		await expectSuccessMessage(
			page,
			"Maya Chen was reactivated. Application access is active.",
		);
		await expect(
			page.locator("aside").getByText("billing-manager", { exact: true }),
		).toBeVisible();
		const restoredAccess = await page.request.get(
			`${baseURL}/api/scim-demo/access/maya-chen`,
		);
		expect(restoredAccess.status()).toBe(200);
		expect(await restoredAccess.json()).toMatchObject({
			allowed: true,
			role: "billing-manager",
		});

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
		await page.getByRole("button", { name: "Apply directory change" }).click();
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
		const identityBeforeDelete = readMayaIdentity(databasePath);
		await page.getByRole("button", { name: "Delete SCIM resource" }).click();
		await page.getByRole("button", { name: "Delete resource" }).click();
		await expect(
			page.getByText("Deleted", { exact: true }).last(),
		).toBeVisible();
		await expect(
			page
				.locator("aside")
				.getByText(identityBeforeDelete.applicationUserId, { exact: true }),
		).toBeVisible();

		await page.getByRole("button", { name: "Reprovision user" }).click();
		await expectSuccessMessage(
			page,
			"Maya A. Chen was reprovisioned with the retained application identity",
		);
		const identityAfterReprovision = readMayaIdentity(databasePath);
		expect(identityAfterReprovision.applicationUserId).toBe(
			identityBeforeDelete.applicationUserId,
		);
		expect(identityAfterReprovision.scimResourceId).not.toBe(
			identityBeforeDelete.scimResourceId,
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
		expect(expectedAccessDenialMessages).toHaveLength(1);
		expect(expectedAccessDenialResponses).toEqual([
			`${baseURL}/api/scim-demo/access/maya-chen`,
		]);
		await expect(page.locator("body")).not.toContainText(scimToken);
		await expect(
			page.locator(
				"[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay",
			),
		).toHaveCount(0);
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
				const access = await context.request.get(
					`${baseURL}/api/scim-demo/access/maya-chen`,
				);
				expect(access.status()).toBe(200);
				expect(await access.json()).toMatchObject({ allowed: true });
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
			const firstAccessAfterReset = await firstContext.request.get(
				`${baseURL}/api/scim-demo/access/maya-chen`,
			);
			expect(firstAccessAfterReset.status()).toBe(404);
			const secondAccessAfterFirstReset = await secondContext.request.get(
				`${baseURL}/api/scim-demo/access/maya-chen`,
			);
			expect(secondAccessAfterFirstReset.status()).toBe(200);

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
