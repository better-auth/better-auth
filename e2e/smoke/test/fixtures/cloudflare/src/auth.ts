import { env } from "cloudflare:workers";
import type { BetterAuthOptions } from "@better-auth/core";
import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins/jwt";
import type { Dialect } from "kysely";
import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";

function withoutSchemaIntrospection(dialect: Dialect): Dialect {
	const rejectIntrospection = async (): Promise<never> => {
		throw new Error("D1_ERROR: not authorized: SQLITE_AUTH");
	};
	return {
		createAdapter: () => dialect.createAdapter(),
		createDriver: () => dialect.createDriver(),
		createIntrospector: () => ({
			getMetadata: rejectIntrospection,
			getSchemas: async () => [],
			getTables: rejectIntrospection,
		}),
		createQueryCompiler: () => dialect.createQueryCompiler(),
	};
}

function createAuth(
	database: NonNullable<BetterAuthOptions["database"]>,
	basePath = "/api/auth",
) {
	return betterAuth({
		baseURL: "http://localhost:4000",
		basePath,
		database,
		emailAndPassword: {
			enabled: true,
		},
		logger: {
			level: "debug",
		},
		plugins: [jwt(), sso()],
	});
}

export const auth = createAuth(env.DB);
const restrictedD1 = new Kysely<unknown>({
	dialect: withoutSchemaIntrospection(new D1Dialect({ database: env.DB })),
});
export const restrictedD1Auth = createAuth(
	{ db: restrictedD1, type: "sqlite" },
	"/_test/restricted-d1-auth",
);
