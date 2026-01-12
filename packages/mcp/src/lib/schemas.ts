import { z } from "zod";

export const FrameworkEnum = z.enum([
	"next-app-router",
	"next-pages-router",
	"sveltekit",
	"astro",
	"remix",
	"nuxt",
	"solid-start",
	"hono",
	"express",
	"fastify",
	"elysia",
	"tanstack-start",
	"expo",
]);

export const DatabaseEnum = z.enum(["postgres", "mysql", "sqlite", "mongodb"]);

export const ORMEnum = z.enum(["prisma", "drizzle", "none"]);

export const FeatureEnum = z.enum([
	"email-password",
	"magic-link",
	"phone-number",
	"passkey",
	"anonymous",
	"google",
	"github",
	"apple",
	"discord",
	"twitter",
	"facebook",
	"microsoft",
	"linkedin",
	"2fa",
	"captcha",
	"organization",
	"admin",
	"username",
	"multi-session",
	"api-key",
	"bearer",
	"jwt",
]);

export const ExistingSetupSchema = z.object({
	authConfig: z
		.string()
		.optional()
		.describe("Contents of existing auth.ts file"),
	authClientConfig: z
		.string()
		.optional()
		.describe("Contents of existing auth-client.ts file"),
	envVars: z
		.array(z.string())
		.optional()
		.describe("List of existing environment variable names"),
});
