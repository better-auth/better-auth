import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";

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
	const port = await new Promise<number>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address && typeof address === "object") {
				resolve(address.port);
				return;
			}
			reject(new Error("Could not reserve a port for the Next.js demo"));
		});
	});
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
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
		await new Promise((resolve) => setTimeout(resolve, 250));
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
				`${table} should not retain demo workflow rows`,
			).toBe(0);
		}
		expect(
			readCount(
				database,
				'SELECT COUNT(*) AS count FROM "user" WHERE "name" = \'Ada Lovelace\'',
			),
			"the application user created by the demo should be removed",
		).toBe(0);
	} finally {
		database.close();
	}
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
		const migrationExitCode = await new Promise<number | null>((resolve) => {
			migration.once("exit", resolve);
		});
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
		const response = await request.post(`${baseURL}/api/scim-demo/run`, {
			headers: { origin: baseURL },
		});

		expect(response.status()).toBe(401);
		expect(await response.json()).toEqual({ error: "Authentication required" });
		expectNoTransientSCIMData(databasePath);
	});

	test("runs a real SCIM lifecycle from the authenticated demo UI", async ({
		page,
	}, testInfo) => {
		const browserAuthorizationHeaders: string[] = [];
		page.on("request", (request) => {
			const authorization = request.headers().authorization;
			if (authorization) browserAuthorizationHeaders.push(authorization);
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
			page.getByRole("heading", { level: 1, name: "SCIM provisioning" }),
		).toBeVisible();
		await expect(
			page.getByText("demo-directory", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Stored on server", { exact: true }),
		).toBeVisible();
		await expect(page.locator("body")).not.toContainText(scimToken);

		const workflowResponsePromise = page.waitForResponse(
			(response) =>
				response.url() === `${baseURL}/api/scim-demo/run` &&
				response.request().method() === "POST",
		);
		await page.getByRole("button", { name: "Run workflow" }).click();
		const workflowResponse = await workflowResponsePromise;
		expect(workflowResponse.status()).toBe(200);
		expect(workflowResponse.headers()["content-type"]).toContain(
			"application/x-ndjson",
		);

		await expect(
			page.getByText("SCIM workflow passed", { exact: true }),
		).toBeVisible({
			timeout: 30_000,
		});
		await expect(
			page
				.getByRole("list", { name: "SCIM workflow checkpoints" })
				.getByRole("listitem"),
		).toHaveCount(10);
		await expect(
			page.getByText("Custom role billing-manager applied"),
		).toBeVisible();
		await expect(
			page.getByText("Membership retained; application access disabled"),
		).toBeVisible();
		await expect(
			page.getByText("Membership retained; custom role restored"),
		).toBeVisible();
		await expect(
			page.getByText("Same application user restored with a new SCIM resource"),
		).toBeVisible();
		await expect(
			page.getByText("Temporary demo records removed"),
		).toBeVisible();
		expectNoTransientSCIMData(databasePath);

		const secondWorkflowResponsePromise = page.waitForResponse(
			(response) =>
				response.url() === `${baseURL}/api/scim-demo/run` &&
				response.request().method() === "POST",
		);
		await page.getByRole("button", { name: "Run workflow" }).click();
		const secondWorkflowResponse = await secondWorkflowResponsePromise;
		expect(secondWorkflowResponse.status()).toBe(200);
		await expect(
			page.getByText("SCIM workflow passed", { exact: true }),
		).toBeVisible({ timeout: 30_000 });
		expectNoTransientSCIMData(databasePath);

		expect(browserAuthorizationHeaders).not.toContain(`Bearer ${scimToken}`);
		await expect(page.locator("body")).not.toContainText(scimToken);

		await page.evaluate(() => window.scrollTo({ top: 0 }));
		const screenshotPath = testInfo.outputPath("scim-demo-workflow.png");
		await page.screenshot({ path: screenshotPath, fullPage: true });
		await testInfo.attach("SCIM demo workflow", {
			path: screenshotPath,
			contentType: "image/png",
		});
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
			const forwardedPort = await new Promise<number>((resolve, reject) => {
				forwardedHost.once("error", reject);
				forwardedHost.listen(0, "127.0.0.1", () => {
					const address = forwardedHost.address();
					if (address && typeof address === "object") {
						resolve(address.port);
						return;
					}
					reject(new Error("Could not start the forwarded-host server"));
				});
			});
			const forwardedOrigin = `http://127.0.0.1:${forwardedPort}`;

			const crossOriginResponse = await request.post(
				`${baseURL}/api/scim-demo/run`,
				{
					headers: {
						origin: forwardedOrigin,
						"x-forwarded-host": `127.0.0.1:${forwardedPort}`,
						"x-forwarded-proto": "http",
					},
				},
			);
			expect(crossOriginResponse.status()).toBe(403);
			expect(forwardedAuthorizationHeaders).toEqual([]);

			const sameOriginResponse = await request.post(
				`${baseURL}/api/scim-demo/run`,
				{
					headers: {
						origin: baseURL,
						"x-forwarded-host": `127.0.0.1:${forwardedPort}`,
						"x-forwarded-proto": "http",
					},
				},
			);

			expect(sameOriginResponse.status()).toBe(200);
			const responseBody = await sameOriginResponse.text();
			expect(responseBody).toContain('"type":"complete"');
			expect(responseBody).not.toContain(scimToken);
			expect(forwardedAuthorizationHeaders).toEqual([]);
			expectNoTransientSCIMData(databasePath);
		} finally {
			await new Promise<void>((resolve, reject) => {
				forwardedHost.close((error) => (error ? reject(error) : resolve()));
			});
		}
	});
});
