import { DatabaseSync } from "node:sqlite";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins/jwt";

/**
 * The auth config both apps import, as a monorepo shares it between the
 * authorization server and its API. `baseURL` is only an origin and
 * `basePath` is left at its default, so the auth endpoints live under
 * `/api/auth` without either option saying so.
 */
export function createAuth(env: {
	authOrigin: string;
	resource: string;
	dbPath: string;
}) {
	return betterAuth({
		baseURL: env.authOrigin,
		secret: "smoke-test-secret-that-is-long-enough-for-validation",
		database: new DatabaseSync(env.dbPath),
		emailAndPassword: { enabled: true },
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid", "profile", "email", "offline_access", "read:data"],
				resources: [env.resource],
				enforcePerClientResources: false,
				// Lets the seeded user register the test client.
				clientPrivileges: () => true,
			}),
		],
	});
}

export function readEnv() {
	const value = (name: string) => {
		const v = process.env[name];
		if (!v) throw new Error(`missing ${name}`);
		return v;
	};
	return {
		authOrigin: value("AUTH_ORIGIN"),
		resource: value("RESOURCE"),
		dbPath: value("DB_PATH"),
		port: Number(value("PORT")),
	};
}

/** Tells the spawning test the app is up, with any data it needs. */
export function ready(data: Record<string, string> = {}) {
	process.stdout.write(`${JSON.stringify({ ready: true, ...data })}\n`);
}
