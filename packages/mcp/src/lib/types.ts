export type Framework =
	| "next-app-router"
	| "next-pages-router"
	| "sveltekit"
	| "astro"
	| "remix"
	| "nuxt"
	| "solid-start"
	| "hono"
	| "express"
	| "fastify"
	| "elysia"
	| "tanstack-start"
	| "expo";

export type Database = "postgres" | "mysql" | "sqlite" | "mongodb";

export type ORM = "prisma" | "drizzle" | "none";

export type Feature =
	| "email-password"
	| "magic-link"
	| "phone-number"
	| "passkey"
	| "anonymous"
	| "google"
	| "github"
	| "apple"
	| "discord"
	| "twitter"
	| "facebook"
	| "microsoft"
	| "linkedin"
	| "2fa"
	| "captcha"
	| "organization"
	| "admin"
	| "username"
	| "multi-session"
	| "api-key"
	| "bearer"
	| "jwt";

export interface ExistingSetup {
	authConfig?: string;
	authClientConfig?: string;
	envVars?: string[];
}

export interface SetupAuthInput {
	framework: Framework;
	database: Database;
	orm?: ORM;
	features?: Feature[];
	typescript?: boolean;
	srcDir?: boolean;
	authPath?: string;
	apiPath?: string;
	existingSetup?: ExistingSetup;
}

export type FileAction = "create" | "update" | "no_change";

export type ChangeType =
	| "add_import"
	| "add_to_config"
	| "add_plugin"
	| "replace";

export type EnvVarStatus = "new" | "existing";

export interface FileChange {
	type: ChangeType;
	location?: string;
	content: string;
	description: string;
}

export interface OutputFile {
	path: string;
	description: string;
	action: FileAction;
	content?: string;
	changes?: FileChange[];
}

export interface EnvVar {
	name: string;
	description: string;
	required: boolean;
	status?: EnvVarStatus;
	defaultValue?: string;
	howToGet?: string;
	example?: string;
}

export interface Command {
	command: string;
	description: string;
	when?: string;
}

export interface DocLink {
	title: string;
	url: string;
}

export interface DetectedConfig {
	framework?: string;
	database?: string;
	orm?: string;
	features: string[];
}

export interface SetupAuthOutput {
	mode: "create" | "update";
	files: OutputFile[];
	envVars: EnvVar[];
	commands: Command[];
	detected?: DetectedConfig;
	nextSteps: string[];
	warnings?: string[];
	docs: DocLink[];
}

export interface SetupAuthError {
	error: {
		code: string;
		message: string;
		suggestion?: string;
	};
}

export interface FrameworkConfig {
	name: string;
	defaultSrcDir: boolean;
	defaultAuthPath: string;
	defaultApiPath: string;
	clientImport: string;
	handlerImport: string;
	handlerFunction: string;
	apiRouteTemplate: (authPath: string) => string;
	hooksTemplate?: (authPath: string) => string;
	defaultPort: number;
}

export interface DatabaseConfig {
	provider: string;
	envVarName: string;
	connectionStringExample: string;
}

export interface ORMConfig {
	adapterImport: string;
	adapterSetup: (dbProvider: string) => string;
	schemaCommand?: string;
	pushCommand: string;
}

export interface PluginConfig {
	serverImport: string;
	clientImport?: string;
	serverPlugin: (options?: Record<string, unknown>) => string;
	clientPlugin?: () => string;
	envVars?: EnvVar[];
	requiresPrimaryAuth?: boolean;
}
