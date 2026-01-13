import { describe, expect, it } from "vitest";
import { generateSetup, isSetupError } from "./generator";
import type { SetupAuthOutput } from "./types";

describe("generateSetup", () => {
	describe("basic setup generation", () => {
		it("should generate Next.js app router setup with postgres", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				features: ["email-password"],
			});

			expect(isSetupError(result)).toBe(false);
			const output = result as SetupAuthOutput;

			expect(output.mode).toBe("create");
			expect(output.files).toHaveLength(3);
			expect(output.files[0].path).toBe("lib/auth.ts");
			expect(output.files[1].path).toBe("lib/auth-client.ts");
			expect(output.files[2].path).toBe("app/api/auth/[...all]/route.ts");
		});

		it("should generate SvelteKit setup with srcDir", () => {
			const result = generateSetup({
				framework: "sveltekit",
				database: "postgres",
				features: ["email-password"],
			});

			expect(isSetupError(result)).toBe(false);
			const output = result as SetupAuthOutput;

			expect(output.files.some((f) => f.path.startsWith("src/"))).toBe(true);
			expect(output.files.some((f) => f.path.includes("hooks.server.ts"))).toBe(
				true,
			);
		});

		it("should respect srcDir option when false", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				srcDir: false,
			});

			expect(isSetupError(result)).toBe(false);
			const output = result as SetupAuthOutput;

			expect(output.files[0].path).toBe("lib/auth.ts");
		});

		it("should respect srcDir option when true", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				srcDir: true,
			});

			expect(isSetupError(result)).toBe(false);
			const output = result as SetupAuthOutput;

			expect(output.files[0].path).toBe("src/lib/auth.ts");
		});
	});

	describe("database configuration", () => {
		it("should generate correct config for postgres", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
			});

			const output = result as SetupAuthOutput;
			const authFile = output.files.find((f) => f.path.endsWith("auth.ts"));
			expect(authFile?.content).toContain('provider: "pg"');
		});

		it("should generate correct config for mysql", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "mysql",
			});

			const output = result as SetupAuthOutput;
			const authFile = output.files.find((f) => f.path.endsWith("auth.ts"));
			expect(authFile?.content).toContain('provider: "mysql"');
		});

		it("should generate correct config for sqlite", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "sqlite",
			});

			const output = result as SetupAuthOutput;
			const authFile = output.files.find((f) => f.path.endsWith("auth.ts"));
			expect(authFile?.content).toContain('provider: "sqlite"');
		});

		it("should include DATABASE_URL env var", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
			});

			const output = result as SetupAuthOutput;
			expect(output.envVars.some((e) => e.name === "DATABASE_URL")).toBe(true);
		});
	});

	describe("ORM configuration", () => {
		it("should generate Prisma adapter config", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				orm: "prisma",
			});

			const output = result as SetupAuthOutput;
			const authFile = output.files.find((f) => f.path.endsWith("auth.ts"));
			expect(authFile?.content).toContain("prismaAdapter");
			expect(authFile?.content).toContain("PrismaClient");
		});

		it("should generate Drizzle adapter config", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				orm: "drizzle",
			});

			const output = result as SetupAuthOutput;
			const authFile = output.files.find((f) => f.path.endsWith("auth.ts"));
			expect(authFile?.content).toContain("drizzleAdapter");
		});

		it("should generate direct database config when no ORM", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				orm: "none",
			});

			const output = result as SetupAuthOutput;
			const authFile = output.files.find((f) => f.path.endsWith("auth.ts"));
			expect(authFile?.content).toContain("process.env.DATABASE_URL");
			expect(authFile?.content).not.toContain("prismaAdapter");
			expect(authFile?.content).not.toContain("drizzleAdapter");
		});
	});

	describe("social providers", () => {
		it("should add Google provider config", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				features: ["google"],
			});

			const output = result as SetupAuthOutput;
			const authFile = output.files.find((f) => f.path.endsWith("auth.ts"));
			expect(authFile?.content).toContain("socialProviders");
			expect(authFile?.content).toContain("google:");
			expect(authFile?.content).toContain("GOOGLE_CLIENT_ID");
		});

		it("should add multiple social providers", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				features: ["google", "github", "discord"],
			});

			const output = result as SetupAuthOutput;
			const authFile = output.files.find((f) => f.path.endsWith("auth.ts"));
			expect(authFile?.content).toContain("google:");
			expect(authFile?.content).toContain("github:");
			expect(authFile?.content).toContain("discord:");
		});

		it("should include env vars for social providers", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				features: ["google"],
			});

			const output = result as SetupAuthOutput;
			expect(output.envVars.some((e) => e.name === "GOOGLE_CLIENT_ID")).toBe(
				true,
			);
			expect(output.envVars.some((e) => e.name === "GOOGLE_CLIENT_SECRET")).toBe(
				true,
			);
		});
	});

	describe("plugins", () => {
		it("should add 2FA plugin", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				features: ["2fa"],
			});

			const output = result as SetupAuthOutput;
			const authFile = output.files.find((f) => f.path.endsWith("auth.ts"));
			const clientFile = output.files.find((f) =>
				f.path.endsWith("auth-client.ts"),
			);

			expect(authFile?.content).toContain("twoFactor");
			expect(clientFile?.content).toContain("twoFactorClient");
		});

		it("should add organization plugin", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				features: ["organization"],
			});

			const output = result as SetupAuthOutput;
			const authFile = output.files.find((f) => f.path.endsWith("auth.ts"));
			expect(authFile?.content).toContain("organization()");
		});

		it("should add magic-link plugin with sendMagicLink stub", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				features: ["magic-link"],
			});

			const output = result as SetupAuthOutput;
			const authFile = output.files.find((f) => f.path.endsWith("auth.ts"));
			expect(authFile?.content).toContain("magicLink");
			expect(authFile?.content).toContain("sendMagicLink");
		});

		it("should add passkey plugin", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				features: ["passkey"],
			});

			const output = result as SetupAuthOutput;
			const authFile = output.files.find((f) => f.path.endsWith("auth.ts"));
			expect(authFile?.content).toContain("passkey()");
		});
	});

	describe("email and password", () => {
		it("should enable email and password by default", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
			});

			const output = result as SetupAuthOutput;
			const authFile = output.files.find((f) => f.path.endsWith("auth.ts"));
			expect(authFile?.content).toContain("emailAndPassword");
			expect(authFile?.content).toContain("enabled: true");
		});

		it("should enable email and password when explicitly requested", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				features: ["email-password"],
			});

			const output = result as SetupAuthOutput;
			const authFile = output.files.find((f) => f.path.endsWith("auth.ts"));
			expect(authFile?.content).toContain("emailAndPassword");
		});
	});

	describe("env vars", () => {
		it("should always include BETTER_AUTH_SECRET", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
			});

			const output = result as SetupAuthOutput;
			expect(output.envVars.some((e) => e.name === "BETTER_AUTH_SECRET")).toBe(
				true,
			);
		});
	});

	describe("commands", () => {
		it("should include install command", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
			});

			const output = result as SetupAuthOutput;
			expect(output.commands.some((c) => c.command.includes("better-auth"))).toBe(
				true,
			);
		});

		it("should include migration command for no ORM", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				orm: "none",
			});

			const output = result as SetupAuthOutput;
			expect(
				output.commands.some((c) => c.command.includes("@better-auth/cli migrate")),
			).toBe(true);
		});

		it("should include Prisma commands when using Prisma", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				orm: "prisma",
			});

			const output = result as SetupAuthOutput;
			expect(output.commands.some((c) => c.command.includes("prisma"))).toBe(
				true,
			);
		});
	});

	describe("documentation links", () => {
		it("should include basic docs", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
			});

			const output = result as SetupAuthOutput;
			expect(output.docs.some((d) => d.url.includes("better-auth.com"))).toBe(
				true,
			);
		});

		it("should include social sign-on docs when using social providers", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				features: ["google"],
			});

			const output = result as SetupAuthOutput;
			expect(output.docs.some((d) => d.url.includes("social-sign-on"))).toBe(
				true,
			);
		});

		it("should include 2FA docs when using 2FA", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				features: ["2fa"],
			});

			const output = result as SetupAuthOutput;
			expect(output.docs.some((d) => d.url.includes("two-factor"))).toBe(true);
		});
	});

	describe("TypeScript/JavaScript", () => {
		it("should generate .ts files by default", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
			});

			const output = result as SetupAuthOutput;
			expect(output.files.every((f) => f.path.endsWith(".ts"))).toBe(true);
		});

		it("should generate .js files when typescript is false", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
				typescript: false,
			});

			const output = result as SetupAuthOutput;
			expect(output.files.every((f) => f.path.endsWith(".js"))).toBe(true);
		});
	});

	describe("framework-specific behavior", () => {
		it("should generate API route for Next.js app router", () => {
			const result = generateSetup({
				framework: "next-app-router",
				database: "postgres",
			});

			const output = result as SetupAuthOutput;
			expect(
				output.files.some((f) => f.path.includes("[...all]/route.ts")),
			).toBe(true);
		});

		it("should generate hooks.server.ts for SvelteKit", () => {
			const result = generateSetup({
				framework: "sveltekit",
				database: "postgres",
			});

			const output = result as SetupAuthOutput;
			expect(output.files.some((f) => f.path.includes("hooks.server.ts"))).toBe(
				true,
			);
		});

		it("should use correct client import for different frameworks", () => {
			const nextResult = generateSetup({
				framework: "next-app-router",
				database: "postgres",
			});
			const svelteResult = generateSetup({
				framework: "sveltekit",
				database: "postgres",
			});

			const nextOutput = nextResult as SetupAuthOutput;
			const svelteOutput = svelteResult as SetupAuthOutput;

			const nextClient = nextOutput.files.find((f) =>
				f.path.endsWith("auth-client.ts"),
			);
			const svelteClient = svelteOutput.files.find((f) =>
				f.path.endsWith("auth-client.ts"),
			);

			expect(nextClient?.content).toContain("better-auth/react");
			expect(svelteClient?.content).toContain("better-auth/svelte");
		});
	});
});

describe("isSetupError", () => {
	it("should return true for error results", () => {
		const error = { error: { code: "TEST", message: "test" } };
		expect(isSetupError(error)).toBe(true);
	});

	it("should return false for success results", () => {
		const success = {
			mode: "create" as const,
			files: [],
			envVars: [],
			commands: [],
			nextSteps: [],
			docs: [],
		};
		expect(isSetupError(success)).toBe(false);
	});
});
