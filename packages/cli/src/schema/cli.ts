import { z } from "zod";

export const BetterAuthConfigSchema = z.object({
	config: z.optional(
		z.object({
			path: z.string(),
		}),
	),
	tsConfig: z.optional(
		z.object({
			path: z.string(),
		}),
	),
	database: z
		.enum([
			"sqlite",
			"mysql",
			"postgres",
			"mssql",
			"drizzle:pg",
			"drizzle:mysql",
			"drizzle:sqlite",
			"prisma:pg",
			"prisma:mysql",
			"prisma:sqlite",
			"mongodb",
		])
		.optional(),
	skipDb: z.boolean().optional(),
	skipPlugins: z.boolean().optional(),
	packageManager: z.enum(["bun", "pnpm", "yarn", "npm"]).optional(),
	env: z.record(z.string()).optional(),
	plugins: z
		.array(
			z.enum([
				"two-factor",
				"magic-link",
				"passkey",
				"oidc",
				"username",
				"anonymous",
				"phone-number",
				"email-otp",
				"generic-oauth",
				"one-tap",
				"api-key",
				"admin",
				"organization",
				"sso",
				"bearer",
				"multi-session",
				"oauth-proxy",
				"open-api",
				"jwt",
				"next-cookies",
			]),
		)
		.optional(),
	framework: z
		.enum(["vanilla", "react", "vue", "svelte", "solid", "nextjs"])
		.optional(),
	appName: z.string().optional(),
});

export type BetterAuthConfig = z.infer<typeof BetterAuthConfigSchema>;
