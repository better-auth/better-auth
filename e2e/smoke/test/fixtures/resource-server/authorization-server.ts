import { createServer } from "node:http";
import { getMigrations } from "better-auth/db/migration";
import { toNodeHandler } from "better-auth/node";
import { createAuth, readEnv, ready } from "./auth.ts";

const env = readEnv();
const auth = createAuth(env);
const { runMigrations } = await getMigrations(auth.options);
await runMigrations();

const signUp = await auth.api.signUpEmail({
	body: {
		email: "alice@example.com",
		password: "smoke-test-password-1",
		name: "Alice",
	},
	returnHeaders: true,
});
const cookie = signUp.headers.get("set-cookie") ?? "";
const client = await auth.api.adminCreateOAuthClient({
	headers: new Headers({ cookie }),
	body: {
		redirect_uris: ["https://client.example.test/callback"],
		token_endpoint_auth_method: "client_secret_post",
		grant_types: ["authorization_code", "refresh_token", "client_credentials"],
		client_credentials_scopes: ["read:data"],
		skip_consent: true,
	},
});

createServer(toNodeHandler(auth.handler)).listen(env.port, () =>
	ready({
		cookie,
		clientId: client.client_id,
		clientSecret: client.client_secret ?? "",
	}),
);
