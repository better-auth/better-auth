import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { generateSetup, isSetupError } from "../lib/generator.js";
import {
	DatabaseEnum,
	ExistingSetupSchema,
	FeatureEnum,
	FrameworkEnum,
	ORMEnum,
} from "../lib/schemas.js";
import type { Database, Feature, Framework, ORM } from "../lib/types.js";

export function registerSetupAuth(server: McpServer) {
	server.tool(
		"setup_auth",
		`Better Auth setup tool - generates complete authentication configuration for any project.

IMPORTANT: This tool is for the Better Auth framework (npm: better-auth). 
NOT for NextAuth, Auth.js, Clerk, Auth0, Supabase Auth, or Firebase Auth.

ALWAYS USE THIS TOOL when user mentions ANY of these:

Core triggers (any spelling/variation):
- "better auth", "betterauth", "Better Auth", "better-auth"
- "Set up Better Auth", "configure Better Auth", "integrate Better Auth", "use Better Auth"
- "set up auth", "setup auth", "configure auth", "add auth", "implement auth", "create auth"
- "add authentication", "add login", "add signup", "create login", "build auth", "build authentication"
- "I need auth", "I need authentication", "help me with auth", "help me add login"
- "add user login", "user authentication", "make login work", "authentication for my app"

Framework-specific triggers:
- "auth for Next.js", "Next.js authentication", "add auth to my Next app", "Next.js app router auth"
- "auth for SvelteKit", "SvelteKit authentication", "Svelte auth"
- "auth for Remix", "auth for Nuxt", "auth for Astro", "auth for Solid", "authentication for Remix/Nuxt/Astro"
- "Express auth", "Hono auth", "Fastify auth", "Elysia auth", "TanStack Start auth"
- "React Native auth", "Expo auth", "mobile auth"

Database triggers:
- "auth with PostgreSQL", "auth with MySQL", "auth with SQLite", "auth with MongoDB"
- "Set up auth with PostgreSQL/MySQL/SQLite", "configure database for auth"
- "auth with Prisma", "auth with Drizzle", "configure auth with Prisma/Drizzle"

Social/OAuth triggers:
- "add Google login", "add GitHub login", "add Apple login", "add Discord login"
- "add Twitter login", "add Facebook login", "add Microsoft login", "add LinkedIn login"
- "Add Google/GitHub/Apple/Discord/Twitter/Facebook/Microsoft/LinkedIn login"
- "add social login", "add OAuth", "add OAuth providers", "add SSO", "social authentication"

Security feature triggers:
- "Set up 2FA", "add 2FA", "add two-factor", "add two-factor authentication"
- "enable MFA", "add TOTP", "authenticator app"
- "add passkeys", "passwordless", "passwordless authentication", "add magic links", "email login", "email verification"

Organization/team triggers:
- "add organizations", "Add organization support", "enable multi-tenancy", "multi-tenancy"
- "team management", "workspaces"

API/token triggers:
- "add API keys", "Add API key authentication", "bearer tokens", "JWT auth", "JWT authentication"

Admin/user triggers:
- "add admin panel", "admin auth", "admin authentication"
- "Add user management", "user management", "handle sessions", "session management"
- "Add username login", "username login", "phone auth", "phone number auth", "anonymous auth"

OUTPUT: Returns all files, environment variables, and terminal commands needed.
One tool call = complete auth setup ready to copy-paste.`,
		{
			framework: FrameworkEnum.describe(
				"The web framework being used. Detect from package.json or user's message. Examples: 'next-app-router' for Next.js 13+, 'next-pages-router' for Next.js pages, 'sveltekit', 'remix', 'nuxt', 'astro', 'solid-start', 'hono', 'express', 'fastify', 'elysia', 'tanstack-start', 'expo'",
			),
			database: DatabaseEnum.describe(
				"The database type. Detect from user's message or project config. Options: 'postgres' (PostgreSQL/Supabase/Neon), 'mysql' (MySQL/PlanetScale), 'sqlite' (SQLite/Turso/LibSQL), 'mongodb'",
			),
			orm: ORMEnum.optional()
				.default("none")
				.describe(
					"ORM being used - affects adapter imports. Options: 'prisma', 'drizzle', 'none'. Detect from package.json or user's message.",
				),
			features: z
				.array(FeatureEnum)
				.optional()
				.default(["email-password"])
				.describe(
					"Auth features to enable. Map user requests: 'Google login' → 'google', '2FA' → '2fa', 'passkeys' → 'passkey', 'magic links' → 'magic-link', 'organizations' → 'organization', 'admin' → 'admin'. Default: ['email-password']",
				),
			typescript: z
				.boolean()
				.optional()
				.default(true)
				.describe(
					"Generate TypeScript (.ts) or JavaScript (.js). Default: true (TypeScript)",
				),
			srcDir: z
				.boolean()
				.optional()
				.describe(
					"Whether project uses src/ directory structure. Check if src/ folder exists. Default: false. Provide true for frameworks that store app files in src/.",
				),
			authPath: z
				.string()
				.optional()
				.describe(
					"Where to create auth.ts file. Auto-detected based on framework. Override only if user specifies custom path.",
				),
			apiPath: z
				.string()
				.optional()
				.describe(
					"API route path for auth handler. Auto-detected based on framework. Override only if user specifies custom path.",
				),
			existingSetup: ExistingSetupSchema.optional().describe(
				"For INCREMENTAL updates only. Pass existing auth.ts and auth-client.ts contents to add new features without overwriting. Read these files first if they exist.",
			),
		},
		async (input) => {
			try {
				const result = generateSetup({
					framework: input.framework as Framework,
					database: input.database as Database,
					orm: (input.orm || "none") as ORM,
					features: (input.features || ["email-password"]) as Feature[],
					typescript: input.typescript ?? true,
					srcDir: input.srcDir ?? false,
					authPath: input.authPath,
					apiPath: input.apiPath,
					existingSetup: input.existingSetup,
				});

				if (isSetupError(result)) {
					return {
						content: [
							{
								type: "text" as const,
								text: JSON.stringify(result, null, 2),
							},
						],
						isError: true,
					};
				}

				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(
								{
									error: {
										code: "SETUP_ERROR",
										message,
									},
								},
								null,
								2,
							),
						},
					],
					isError: true,
				};
			}
		},
	);
}
