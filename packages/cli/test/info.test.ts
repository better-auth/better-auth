import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cliPath } from "./utils";

const execAsync = promisify(exec);

let tmpDir = ".";

describe("info command", () => {
	beforeEach(async () => {
		const tmp = path.join(
			process.cwd(),
			"node_modules",
			".cache",
			"info_test-",
		);
		await fs.mkdir(path.join(tmp, "node_modules", ".cache"), {
			recursive: true,
		});
		tmpDir = await fs.mkdtemp(tmp);

		// Mock console methods to avoid noise in test output
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true });
		vi.restoreAllMocks();
	});

	it("should display system information without auth config", async () => {
		// Create a minimal package.json
		await fs.writeFile(
			path.join(tmpDir, "package.json"),
			JSON.stringify({
				name: "test-project",
				version: "1.0.0",
				dependencies: {
					"better-auth": "^1.0.0",
				},
			}),
		);
		const { stdout } = await execAsync(`node ${cliPath} info --json`, {
			cwd: tmpDir,
		});

		const output = JSON.parse(stdout);

		// Check system information
		expect(output.system).toHaveProperty("platform");
		expect(output.system).toHaveProperty("arch");
		expect(output.system).toHaveProperty("cpuCount");
		expect(output.system).toHaveProperty("totalMemory");

		// Check node information
		expect(output.node).toHaveProperty("version");
		expect(output.node).toHaveProperty("env");

		// Check package manager
		expect(output.packageManager).toHaveProperty("name");
		expect(output.packageManager).toHaveProperty("version");

		// Better Auth config should have an error since no auth file exists
		expect(output.betterAuth).toHaveProperty("version");
		expect(output.betterAuth.config).toBeNull();
	});

	it("should load and sanitize auth configuration", async () => {
		// Create package.json with dependencies
		await fs.writeFile(
			path.join(tmpDir, "package.json"),
			JSON.stringify({
				name: "test-project",
				version: "1.0.0",
				dependencies: {
					"better-auth": "^1.0.0",
					next: "^14.0.0",
					react: "^18.0.0",
				},
			}),
		);

		// Create auth.ts with sensitive data - using in-memory database to avoid adapter errors
		await fs.writeFile(
			path.join(tmpDir, "auth.ts"),
			`import { betterAuth } from "better-auth";

			export const auth = betterAuth({
				secret: "super-secret-key-123",
				baseURL: "https://example.com",
				emailAndPassword: {
					enabled: true,
				},
				socialProviders: {
					github: {
						clientId: "github-client-id",
						clientSecret: "github-client-secret"
					},
					google: {
						clientId: "google-client-id",
						clientSecret: "google-client-secret"
					}
				}
			})`,
		);

		const { stdout } = await execAsync(`node ${cliPath} info --json`, {
			cwd: tmpDir,
		});

		const output = JSON.parse(stdout);

		// Check that sensitive data is redacted
		expect(output.betterAuth.config).toBeDefined();
		expect(output.betterAuth.config.secret).toBe("[REDACTED]");

		// Check social providers are sanitized
		expect(output.betterAuth.config.socialProviders).toBeDefined();
		expect(output.betterAuth.config.socialProviders.github.clientId).toBe(
			"[REDACTED]",
		);
		expect(output.betterAuth.config.socialProviders.github.clientSecret).toBe(
			"[REDACTED]",
		);
		expect(output.betterAuth.config.socialProviders.google.clientId).toBe(
			"[REDACTED]",
		);
		expect(output.betterAuth.config.socialProviders.google.clientSecret).toBe(
			"[REDACTED]",
		);

		// Check non-sensitive data is preserved
		expect(output.betterAuth.config.emailAndPassword).toEqual({
			enabled: true,
		});
		expect(output.betterAuth.config.baseURL).toBe("https://example.com");
	});

	it("should detect installed frameworks", async () => {
		// Create package.json with various frameworks
		await fs.writeFile(
			path.join(tmpDir, "package.json"),
			JSON.stringify({
				name: "test-project",
				version: "1.0.0",
				dependencies: {
					"better-auth": "^1.0.0",
					next: "^14.0.0",
					react: "^18.0.0",
				},
				devDependencies: {
					"@sveltejs/kit": "^2.0.0",
					svelte: "^4.0.0",
				},
			}),
		);

		const { stdout } = await execAsync(`node ${cliPath} info --json`, {
			cwd: tmpDir,
		});

		const output = JSON.parse(stdout);

		// Check frameworks are detected
		expect(output.frameworks).toContainEqual({
			name: "next",
			version: "^14.0.0",
		});
		expect(output.frameworks).toContainEqual({
			name: "react",
			version: "^18.0.0",
		});
		expect(output.frameworks).toContainEqual({
			name: "@sveltejs/kit",
			version: "^2.0.0",
		});
		expect(output.frameworks).toContainEqual({
			name: "svelte",
			version: "^4.0.0",
		});
	});

	it("should detect database clients", async () => {
		// Create package.json with database clients
		await fs.writeFile(
			path.join(tmpDir, "package.json"),
			JSON.stringify({
				name: "test-project",
				version: "1.0.0",
				dependencies: {
					"better-auth": "^1.0.0",
					"@prisma/client": "^5.0.0",
					kysely: "^0.26.0",
				},
				devDependencies: {
					"drizzle-orm": "^0.29.0",
					"better-sqlite3": "^9.0.0",
				},
			}),
		);

		const { stdout } = await execAsync(`node ${cliPath} info --json`, {
			cwd: tmpDir,
		});

		const output = JSON.parse(stdout);

		// Check database clients are detected
		expect(output.databases).toContainEqual({
			name: "@prisma/client",
			version: "^5.0.0",
		});
		expect(output.databases).toContainEqual({
			name: "kysely",
			version: "^0.26.0",
		});
		expect(output.databases).toContainEqual({
			name: "drizzle",
			version: "^0.29.0",
		});
		expect(output.databases).toContainEqual({
			name: "better-sqlite3",
			version: "^9.0.0",
		});
	});

	it("should support custom config path", async () => {
		// Create package.json
		await fs.writeFile(
			path.join(tmpDir, "package.json"),
			JSON.stringify({
				name: "test-project",
				version: "1.0.0",
				dependencies: {
					"better-auth": "^1.0.0",
				},
			}),
		);

		// Create custom directory for auth config
		const customPath = path.join(tmpDir, "config");
		await fs.mkdir(customPath, { recursive: true });

		// Create auth config in custom location
		await fs.writeFile(
			path.join(customPath, "auth.config.ts"),
			`import { betterAuth } from "better-auth";

			export const auth = betterAuth({
				secret: "my-secret",
				appName: "Custom Config App",
				emailAndPassword: {
					enabled: true,
				}
			})`,
		);

		const { stdout } = await execAsync(
			`node ${cliPath} info --config config/auth.config.ts --json`,
			{ cwd: tmpDir },
		);

		const output = JSON.parse(stdout);

		// Check that custom config was loaded
		expect(output.betterAuth.config).toBeDefined();
		expect(output.betterAuth.config.appName).toBe("Custom Config App");
		expect(output.betterAuth.config.secret).toBe("[REDACTED]");
		expect(output.betterAuth.config.emailAndPassword).toEqual({
			enabled: true,
		});
	});

	it("should sanitize plugin configurations", async () => {
		// Create package.json
		await fs.writeFile(
			path.join(tmpDir, "package.json"),
			JSON.stringify({
				name: "test-project",
				version: "1.0.0",
				dependencies: {
					"better-auth": "^1.0.0",
				},
			}),
		);

		// Create auth.ts with plugins
		await fs.writeFile(
			path.join(tmpDir, "auth.ts"),
			`import { betterAuth } from "better-auth";
			import { twoFactor, organization } from "better-auth/plugins";

			export const auth = betterAuth({
				plugins: [
					twoFactor({
						otpOptions: {
							secret: "otp-secret-key"
						}
					}),
					organization({
						apiKey: "org-api-key",
						webhookSecret: "webhook-secret"
					})
				]
			})`,
		);

		const { stdout } = await execAsync(`node ${cliPath} info --json`, {
			cwd: tmpDir,
		});

		const output = JSON.parse(stdout);

		// Check that plugin configs are sanitized
		expect(output.betterAuth.config.plugins).toBeDefined();
		expect(Array.isArray(output.betterAuth.config.plugins)).toBe(true);

		// Plugin sensitive data should be redacted
		const plugins = output.betterAuth.config.plugins;
		plugins.forEach((plugin: any) => {
			if (plugin.config) {
				// Check that sensitive keys are redacted
				const configStr = JSON.stringify(plugin.config);
				expect(configStr).toContain("[REDACTED]");
			}
		});
	});

	it("should handle missing package.json gracefully", async () => {
		// Don't create package.json
		const { stdout } = await execAsync(`node ${cliPath} info --json`, {
			cwd: tmpDir,
		});

		const output = JSON.parse(stdout);

		// Should still return system info
		expect(output.system).toBeDefined();
		expect(output.node).toBeDefined();
		expect(output.packageManager).toBeDefined();

		// Frameworks and databases should be null
		expect(output.frameworks).toBeNull();
		expect(output.databases).toBeNull();
	});
}, 20000);
