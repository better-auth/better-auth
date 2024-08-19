import {
	createEndpointCreator,
	createMiddleware,
	createMiddlewareCreator,
	Endpoint,
	EndpointResponse,
} from "better-call";
import { BetterAuthOptions } from "../types/options";
import { AuthContext } from "../init";
import { getMigrations } from "../db/migrations/get-migrations";
import { migrateAll } from "../db/migrations";

export const optionsMiddleware = createMiddleware(async (ctx) => {
	/**
	 * This will be passed on the instance of
	 * the context. Used to infer the type
	 * here.
	 */
	return {} as AuthContext;
});

export const createAuthMiddleware = createMiddlewareCreator({
	use: [optionsMiddleware],
});

export const createAuthEndpoint = createEndpointCreator({
	use: [
		optionsMiddleware,
		createAuthMiddleware(async (ctx) => {
			if (
				"autoMigrate" in ctx.context?.options.database &&
				ctx.context.options.database.autoMigrate
			) {
				const { noMigration } = await getMigrations(ctx.context.options, false);
				if (noMigration) {
					return;
				}
				await migrateAll(ctx.context.options, {
					cli: false,
				});
			}
		}),
	],
});

export type AuthEndpoint = Endpoint<
	(ctx: {
		options: BetterAuthOptions;
		body: any;
		query: any;
	}) => Promise<EndpointResponse>
>;

export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
