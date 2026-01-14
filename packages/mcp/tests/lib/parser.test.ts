import { describe, expect, it } from "vitest";
import { computeFeatureDiff, parseExistingSetup } from "../../src/lib/parser";

describe("parseExistingSetup", () => {
	describe("database detection", () => {
		it("should detect postgres from postgresql provider", () => {
			const result = parseExistingSetup({
				authConfig: `export const auth = betterAuth({
          database: {
            provider: "postgresql",
            url: process.env.DATABASE_URL,
          }
        })`,
			});

			expect(result.database).toBe("postgres");
		});

		it("should detect postgres from pg provider", () => {
			const result = parseExistingSetup({
				authConfig: `export const auth = betterAuth({
          database: drizzleAdapter(db, {
            provider: "pg",
          })
        })`,
			});

			expect(result.database).toBe("postgres");
		});

		it("should detect mysql", () => {
			const result = parseExistingSetup({
				authConfig: `database: { provider: "mysql" }`,
			});

			expect(result.database).toBe("mysql");
		});

		it("should detect sqlite", () => {
			const result = parseExistingSetup({
				authConfig: `database: { provider: "sqlite" }`,
			});

			expect(result.database).toBe("sqlite");
		});

		it("should detect mongodb", () => {
			const result = parseExistingSetup({
				authConfig: `database: { provider: "mongodb" }`,
			});

			expect(result.database).toBe("mongodb");
		});

		it("should return undefined for unknown database", () => {
			const result = parseExistingSetup({
				authConfig: `export const auth = betterAuth({})`,
			});

			expect(result.database).toBeUndefined();
		});
	});

	describe("ORM detection", () => {
		it("should detect Prisma adapter", () => {
			const result = parseExistingSetup({
				authConfig: `database: prismaAdapter(prisma, { provider: "postgresql" })`,
			});

			expect(result.orm).toBe("prisma");
		});

		it("should detect Drizzle adapter", () => {
			const result = parseExistingSetup({
				authConfig: `database: drizzleAdapter(db, { provider: "pg" })`,
			});

			expect(result.orm).toBe("drizzle");
		});

		it("should detect no ORM (direct config)", () => {
			const result = parseExistingSetup({
				authConfig: `database: {
          provider: "pg",
          url: process.env.DATABASE_URL
        }`,
			});

			expect(result.orm).toBe("none");
		});
	});

	describe("feature detection", () => {
		it("should detect email-password", () => {
			const result = parseExistingSetup({
				authConfig: `emailAndPassword: {
          enabled: true,
        }`,
			});

			expect(result.features).toContain("email-password");
		});

		it("should detect Google provider", () => {
			const result = parseExistingSetup({
				authConfig: `socialProviders: {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }
        }`,
			});

			expect(result.features).toContain("google");
		});

		it("should detect GitHub provider", () => {
			const result = parseExistingSetup({
				authConfig: `socialProviders: {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID,
          }
        }`,
			});

			expect(result.features).toContain("github");
		});

		it("should detect multiple social providers", () => {
			const result = parseExistingSetup({
				authConfig: `socialProviders: {
          google: { clientId: "..." },
          github: { clientId: "..." },
          discord: { clientId: "..." },
        }`,
			});

			expect(result.features).toContain("google");
			expect(result.features).toContain("github");
			expect(result.features).toContain("discord");
		});

		it("should detect twoFactor plugin", () => {
			const result = parseExistingSetup({
				authConfig: `plugins: [twoFactor()]`,
			});

			expect(result.features).toContain("2fa");
		});

		it("should detect organization plugin", () => {
			const result = parseExistingSetup({
				authConfig: `plugins: [organization()]`,
			});

			expect(result.features).toContain("organization");
		});

		it("should detect admin plugin", () => {
			const result = parseExistingSetup({
				authConfig: `plugins: [admin()]`,
			});

			expect(result.features).toContain("admin");
		});

		it("should detect magicLink plugin", () => {
			const result = parseExistingSetup({
				authConfig: `plugins: [magicLink({ sendMagicLink: async () => {} })]`,
			});

			expect(result.features).toContain("magic-link");
		});

		it("should detect passkey plugin", () => {
			const result = parseExistingSetup({
				authConfig: `plugins: [passkey()]`,
			});

			expect(result.features).toContain("passkey");
		});

		it("should detect multiple plugins", () => {
			const result = parseExistingSetup({
				authConfig: `plugins: [
          twoFactor(),
          organization(),
          passkey(),
        ]`,
			});

			expect(result.features).toContain("2fa");
			expect(result.features).toContain("organization");
			expect(result.features).toContain("passkey");
		});

		it("should detect apiKey plugin", () => {
			const result = parseExistingSetup({
				authConfig: `plugins: [apiKey()]`,
			});

			expect(result.features).toContain("api-key");
		});

		it("should detect bearer plugin", () => {
			const result = parseExistingSetup({
				authConfig: `plugins: [bearer()]`,
			});

			expect(result.features).toContain("bearer");
		});

		it("should detect jwt plugin", () => {
			const result = parseExistingSetup({
				authConfig: `plugins: [jwt()]`,
			});

			expect(result.features).toContain("jwt");
		});

		it("should detect phoneNumber plugin", () => {
			const result = parseExistingSetup({
				authConfig: `plugins: [phoneNumber({ sendOTP: async () => {} })]`,
			});

			expect(result.features).toContain("phone-number");
		});

		it("should detect anonymous plugin", () => {
			const result = parseExistingSetup({
				authConfig: `plugins: [anonymous()]`,
			});

			expect(result.features).toContain("anonymous");
		});

		it("should detect captcha plugin", () => {
			const result = parseExistingSetup({
				authConfig: `plugins: [captcha({ provider: "cloudflare-turnstile" })]`,
			});

			expect(result.features).toContain("captcha");
		});

		it("should return empty features for minimal config", () => {
			const result = parseExistingSetup({
				authConfig: `export const auth = betterAuth({
          database: { provider: "pg", url: process.env.DATABASE_URL }
        })`,
			});

			expect(result.features).toEqual([]);
		});
	});

	describe("complex config parsing", () => {
		it("should parse a full config with multiple features", () => {
			const result = parseExistingSetup({
				authConfig: `
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor, organization } from "better-auth/plugins";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  plugins: [
    twoFactor(),
    organization(),
  ],
});
        `,
			});

			expect(result.database).toBe("postgres");
			expect(result.orm).toBe("prisma");
			expect(result.features).toContain("email-password");
			expect(result.features).toContain("google");
			expect(result.features).toContain("2fa");
			expect(result.features).toContain("organization");
		});
	});
});

describe("computeFeatureDiff", () => {
	it("should return all requested features when none exist", () => {
		const result = computeFeatureDiff([], ["google", "github", "2fa"]);

		expect(result.toAdd).toEqual(["google", "github", "2fa"]);
		expect(result.existing).toEqual([]);
	});

	it("should return only new features when some exist", () => {
		const result = computeFeatureDiff(
			["google", "email-password"],
			["google", "github", "2fa"],
		);

		expect(result.toAdd).toEqual(["github", "2fa"]);
		expect(result.existing).toEqual(["google"]);
	});

	it("should return empty toAdd when all features exist", () => {
		const result = computeFeatureDiff(
			["google", "github", "2fa"],
			["google", "github"],
		);

		expect(result.toAdd).toEqual([]);
		expect(result.existing).toEqual(["google", "github"]);
	});

	it("should handle empty requested features", () => {
		const result = computeFeatureDiff(["google", "github"], []);

		expect(result.toAdd).toEqual([]);
		expect(result.existing).toEqual([]);
	});
});
