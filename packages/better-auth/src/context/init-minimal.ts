import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { BetterAuthError } from "@better-auth/core/error";
import { getBaseAdapter } from "../db/adapter-base";
import { createAuthContext } from "./base";

const initBase = async (
	adapter: DBAdapter<BetterAuthOptions>,
	options: BetterAuthOptions,
) => {
	// Without Kysely, we can't detect database type, so always return "unknown"
	const getDatabaseType = (_database: BetterAuthOptions["database"]) =>
		"unknown";

	// Use base context creation
	const ctx = await createAuthContext(adapter, options, getDatabaseType);

	// Add runMigrations that throws error (migrations require Kysely)
	ctx.runMigrations = async function () {
		throw new BetterAuthError(
			"Migrations are not supported in 'better-auth/minimal'. Please use 'better-auth' for migration support.",
		);
	};

	return ctx;
};

export const initMinimal = async (options: BetterAuthOptions) => {
	const adapter = await getBaseAdapter(options, async () => {
		throw new BetterAuthError(
			"Direct database connection requires Kysely. Please use `better-auth` instead of `better-auth/minimal`, or provide an adapter (drizzleAdapter, prismaAdapter, etc.)",
		);
	});
	return initBase(adapter, options);
};
