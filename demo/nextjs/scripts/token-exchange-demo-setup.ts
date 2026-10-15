/**
 * Registers the MCP server's confidential token exchange client.
 * Run after migrations, with the demo's env:
 * `node --experimental-strip-types scripts/token-exchange-demo-setup.ts`
 * Prints `{"client_id":"…","client_secret":"…"}` as the only stdout line.
 */
import { randomUUID } from "node:crypto";
import { TOKEN_EXCHANGE_GRANT_TYPE } from "@better-auth/oauth-provider";

// stdout carries only the credentials line; anything auth logs goes to stderr.
console.log = console.error;
console.info = console.error;

const { auth } = await import("../lib/auth.ts");
const { getTokenExchangeDemoAPIURL } = await import(
	"../lib/token-exchange-demo.ts"
);

const baseURL = process.env.BETTER_AUTH_URL;
if (!baseURL) throw new Error("BETTER_AUTH_URL is required");

// adminCreateOAuthClient needs a session; the client is owned by a fresh
// service user. shortcut: one new user per run, reuse one if runs pile up.
const signUp = await auth.api.signUpEmail({
	body: {
		name: "Token exchange demo MCP server",
		email: `token-exchange-demo-${randomUUID()}@example.com`,
		password: randomUUID(),
	},
	returnHeaders: true,
});
const cookie = signUp.headers
	.getSetCookie()
	.map((setCookie) => setCookie.split(";")[0])
	.join("; ");

const client = await auth.api.adminCreateOAuthClient({
	headers: new Headers({ cookie }),
	body: {
		client_name: "Token exchange demo MCP server",
		grant_types: [TOKEN_EXCHANGE_GRANT_TYPE],
		token_endpoint_auth_method: "client_secret_basic",
		skip_consent: true,
		scope: "openid profile email offline_access read:organization",
		resources: [`${baseURL}/api/mcp`, getTokenExchangeDemoAPIURL()],
	},
});
if (!client.client_secret) {
	throw new Error("The token exchange client was created without a secret");
}

process.stdout.write(
	`${JSON.stringify({
		client_id: client.client_id,
		client_secret: client.client_secret,
	})}\n`,
);
