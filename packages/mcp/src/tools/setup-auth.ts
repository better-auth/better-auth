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
		`Generate complete Better Auth authentication setup for a project. 
USE THIS TOOL when user asks to:
- "Set up Better Auth", "configure Better Auth", "integrate Better Auth", "use Better Auth"
- "Set up auth", "add authentication", "add login", "implement auth", "create auth", "build authentication"
- "I need authentication", "help me with auth", "help me add login", "make login work"
- "Add auth to my Next.js app", "auth for SvelteKit", "authentication for Remix/Nuxt/Astro"
- "Set up auth with PostgreSQL/MySQL/SQLite", "configure auth with Prisma/Drizzle"
- "Add Google/GitHub/Apple/Discord/Twitter/Facebook/Microsoft/LinkedIn login"
- "Add social login", "add OAuth providers", "add SSO"
- "Set up 2FA", "add two-factor authentication", "enable MFA", "add TOTP"
- "Add passkeys", "passwordless authentication", "add magic links", "email verification"
- "Add organization support", "enable multi-tenancy", "team management", "workspaces"
- "Add API key authentication", "bearer tokens", "JWT auth"
- "Add user management", "handle sessions", "session management"
- "Add admin panel", "admin authentication"
- "Add username login", "phone number auth"

Returns all files, environment variables, and commands needed. One tool call = complete auth setup.`,
		{
			framework: FrameworkEnum.describe("The web framework being used"),
			database: DatabaseEnum.describe("The database type"),
			orm: ORMEnum.optional()
				.default("none")
				.describe("ORM being used (affects adapter config)"),
			features: z
				.array(FeatureEnum)
				.optional()
				.default(["email-password"])
				.describe(
					"Auth features to enable (e.g., 'email-password', 'google', '2fa')",
				),
			typescript: z
				.boolean()
				.optional()
				.default(true)
				.describe("Generate TypeScript or JavaScript"),
			srcDir: z
				.boolean()
				.optional()
				.default(false)
				.describe("Use src/ directory structure"),
			authPath: z
				.string()
				.optional()
				.describe("Where to create auth files (default: 'lib/auth')"),
			apiPath: z
				.string()
				.optional()
				.describe("API route path (auto-detected based on framework)"),
			existingSetup: ExistingSetupSchema.optional().describe(
				"Existing auth configuration for incremental updates. Pass current auth.ts and auth-client.ts contents to add new features without overwriting.",
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
