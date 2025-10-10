import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTelemetry } from "./index";
import type { TelemetryEvent } from "./types";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(async () => ({ status: 200 })),
}));

vi.mock("./project-id", () => ({
	getProjectId: vi.fn(async () => "anon-123"),
}));

vi.mock("./detectors/detect-runtime", () => ({
	detectRuntime: vi.fn(() => ({ name: "node", version: "test" })),
	detectEnvironment: vi.fn(() => "test"),
}));

vi.mock("./detectors/detect-database", () => ({
	detectDatabase: vi.fn(async () => ({ name: "postgresql", version: "1.0.0" })),
}));

vi.mock("./detectors/detect-framework", () => ({
	detectFramework: vi.fn(async () => ({ name: "next", version: "15.0.0" })),
}));

vi.mock("./detectors/detect-system-info", () => ({
	detectSystemInfo: vi.fn(() => ({
		systemPlatform: "darwin",
		systemRelease: "24.6.0",
		systemArchitecture: "arm64",
		cpuCount: 8,
		cpuModel: "Apple M3",
		cpuSpeed: 3200,
		memory: 16 * 1024 * 1024 * 1024,
		isDocker: false,
		isTTY: true,
		isWSL: false,
		isCI: false,
	})),
	isCI: vi.fn(() => false),
}));

vi.mock("./detectors/detect-project-info", () => ({
	detectPackageManager: vi.fn(() => ({ name: "pnpm", version: "9.0.0" })),
}));

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	process.env.BETTER_AUTH_TELEMETRY = "";
	process.env.BETTER_AUTH_TELEMETRY_DEBUG = "";
});

describe("telemetry", () => {
	it("publishes events when enabled", async () => {
		let event: TelemetryEvent | undefined;
		const track = vi.fn().mockImplementation(async (e) => {
			event = e;
		});
		await createTelemetry(
			{
				baseURL: "http://localhost.com", //this shouldn't be tracked
				appName: "test", //this shouldn't be tracked
				advanced: {
					cookiePrefix: "test", //this shouldn't be tracked - should set to true
					crossSubDomainCookies: {
						domain: ".test.com", //this shouldn't be tracked - should set to true
						enabled: true,
					},
				},
				telemetry: { enabled: true },
			},
			{ customTrack: track, skipTestCheck: true },
		);
		expect(event).toMatchObject({
			type: "init",
			payload: {
				config: {
					emailVerification: {
						sendVerificationEmail: false,
						sendOnSignUp: false,
						sendOnSignIn: false,
						autoSignInAfterVerification: false,
						expiresIn: undefined,
						onEmailVerification: false,
						afterEmailVerification: false,
					},
					emailAndPassword: {
						enabled: false,
						disableSignUp: false,
						requireEmailVerification: false,
						maxPasswordLength: undefined,
						minPasswordLength: undefined,
						sendResetPassword: false,
						resetPasswordTokenExpiresIn: undefined,
						onPasswordReset: false,
						password: { hash: false, verify: false },
						autoSignIn: false,
						revokeSessionsOnPasswordReset: false,
					},
					socialProviders: [],
					plugins: undefined,
					user: {
						modelName: undefined,
						fields: undefined,
						additionalFields: undefined,
						changeEmail: {
							enabled: undefined,
							sendChangeEmailVerification: false,
						},
					},
					verification: {
						modelName: undefined,
						disableCleanup: undefined,
						fields: undefined,
					},
					session: {
						modelName: undefined,
						additionalFields: undefined,
						cookieCache: { enabled: undefined, maxAge: undefined },
						disableSessionRefresh: undefined,
						expiresIn: undefined,
						fields: undefined,
						freshAge: undefined,
						preserveSessionInDatabase: undefined,
						storeSessionInDatabase: undefined,
						updateAge: undefined,
					},
					account: {
						modelName: undefined,
						fields: undefined,
						encryptOAuthTokens: undefined,
						updateAccountOnSignIn: undefined,
						accountLinking: {
							enabled: undefined,
							trustedProviders: undefined,
							updateUserInfoOnLink: undefined,
							allowUnlinkingAll: undefined,
						},
					},
					hooks: { after: false, before: false },
					secondaryStorage: false,
					advanced: {
						cookiePrefix: true,
						cookies: false,
						crossSubDomainCookies: {
							domain: true,
							enabled: true,
							additionalCookies: undefined,
						},
						database: {
							useNumberId: false,
							generateId: undefined,
							defaultFindManyLimit: undefined,
						},
						useSecureCookies: undefined,
						ipAddress: {
							disableIpTracking: undefined,
							ipAddressHeaders: undefined,
						},
						disableCSRFCheck: undefined,
						cookieAttributes: {
							expires: undefined,
							secure: undefined,
							sameSite: undefined,
							domain: false,
							path: undefined,
							httpOnly: undefined,
						},
					},
					trustedOrigins: undefined,
					rateLimit: {
						storage: undefined,
						modelName: undefined,
						window: undefined,
						customStorage: false,
						enabled: undefined,
						max: undefined,
					},
					onAPIError: {
						errorURL: undefined,
						onError: false,
						throw: undefined,
					},
					logger: { disabled: undefined, level: undefined, log: false },
					databaseHooks: {
						user: {
							create: {
								after: false,
								before: false,
							},
							update: {
								after: false,
								before: false,
							},
						},
						session: {
							create: {
								after: false,
								before: false,
							},
							update: {
								after: false,
								before: false,
							},
						},
						account: {
							create: {
								after: false,
								before: false,
							},
							update: {
								after: false,
								before: false,
							},
						},
						verification: {
							create: {
								after: false,
								before: false,
							},
							update: {
								after: false,
								before: false,
							},
						},
					},
				},
				runtime: { name: "node", version: "test" },
				database: { name: "postgresql", version: "1.0.0" },
				framework: { name: "next", version: "15.0.0" },
				environment: "test",
				systemInfo: {
					systemPlatform: "darwin",
					systemRelease: "24.6.0",
					systemArchitecture: "arm64",
					cpuCount: 8,
					cpuModel: "Apple M3",
					cpuSpeed: 3200,
					memory: 17179869184,
					isDocker: false,
					isTTY: true,
					isWSL: false,
					isCI: false,
				},
				packageManager: { name: "pnpm", version: "9.0.0" },
			},
			anonymousId: "anon-123",
		});
	});

	it("does not publish when disabled via env", async () => {
		process.env.BETTER_AUTH_TELEMETRY = "false";
		let event: TelemetryEvent | undefined;
		const track = vi.fn().mockImplementation(async (e) => {
			event = e;
		});
		await createTelemetry(
			{
				baseURL: "http://localhost",
			},
			{ customTrack: track, skipTestCheck: true },
		);
		expect(event).toBeUndefined();
		expect(track).not.toBeCalled();
	});

	it("does not publish when disabled via option", async () => {
		let event: TelemetryEvent | undefined;
		const track = vi.fn().mockImplementation(async (e) => {
			event = e;
		});
		await createTelemetry(
			{
				baseURL: "http://localhost",
				telemetry: { enabled: false },
			},
			{ customTrack: track, skipTestCheck: true },
		);
		expect(event).toBeUndefined();
		expect(track).not.toBeCalled();
	});

	it("shouldn't fail cause track isn't being reached", async () => {
		await expect(
			createTelemetry(
				{
					baseURL: "http://localhost",
					telemetry: { enabled: true },
				},
				{
					customTrack() {
						throw new Error("test");
					},
					skipTestCheck: true,
				},
			),
		).resolves.not.throw(Error);
	});

	it("initializes without Node built-ins in edge-like env (no process.cwd)", async () => {
		const originalProcess = globalThis.process;
		try {
			// Simulate an edge runtime where process exists minimally but has no cwd
			// so utils/package-json won't try to import fs/path
			(globalThis as any).process = { env: {} } as any;
			const track = vi.fn();
			await expect(
				createTelemetry(
					{ baseURL: "https://example.com", telemetry: { enabled: true } },
					{ customTrack: track, skipTestCheck: true },
				),
			).resolves.not.toThrow();
			// Should still attempt to publish init event
			expect(track).toHaveBeenCalled();
		} finally {
			// restore
			(globalThis as any).process = originalProcess as any;
		}
	});
});
