import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { after, before, describe, it } from "node:test";
import * as oauth from "oauth4webapi";

/**
 * Two separate apps share one auth config whose `baseURL` is only an origin:
 * an authorization server, and an API that verifies its tokens with
 * `oauthProviderResourceClient(auth)` and no explicit `issuer`, `jwksUrl`,
 * or `introspectUrl`. An independent OAuth client discovers the authorization
 * server from the API, gets tokens, and calls the API with them.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc9728
 */
const fixtures = join(import.meta.dirname, "fixtures", "resource-server");
const redirectUri = "https://client.example.test/callback";

async function freePort() {
	const server = createServer().listen(0);
	await new Promise((resolve) => server.once("listening", resolve));
	const address = server.address();
	server.close();
	assert.ok(address && typeof address === "object");
	return address.port;
}

const children: ChildProcess[] = [];

/** Starts a fixture app and resolves with the data it prints once ready. */
function startApp(file: string, env: Record<string, string>) {
	const child = spawn(process.execPath, [join(fixtures, file)], {
		env: { ...process.env, ...env },
		stdio: ["ignore", "pipe", "inherit"],
	});
	children.push(child);
	return new Promise<Record<string, string>>((resolve, reject) => {
		child.once("exit", (code) => reject(new Error(`${file} exited: ${code}`)));
		createInterface({ input: child.stdout! }).on("line", (line) => {
			try {
				const message = JSON.parse(line) as Record<string, string>;
				if (message.ready) resolve(message);
			} catch {
				// Not the ready line.
			}
		});
	});
}

describe("resource server defaults with an origin-only baseURL", () => {
	const dir = mkdtempSync(join(tmpdir(), "ba-resource-server-"));
	let authOrigin: string;
	let resource: string;
	let seed: Record<string, string>;
	let client: oauth.Client;
	let clientAuth: oauth.ClientAuth;
	const options = { [oauth.allowInsecureRequests]: true };

	before(async () => {
		const [authPort, resourcePort] = [await freePort(), await freePort()];
		authOrigin = `http://localhost:${authPort}`;
		resource = `http://localhost:${resourcePort}`;
		const env = {
			AUTH_ORIGIN: authOrigin,
			RESOURCE: resource,
			DB_PATH: join(dir, "auth.db"),
		};
		seed = await startApp("authorization-server.ts", {
			...env,
			PORT: String(authPort),
		});
		await startApp("resource-server.ts", {
			...env,
			PORT: String(resourcePort),
		});
		client = { client_id: seed.clientId! };
		clientAuth = oauth.ClientSecretPost(seed.clientSecret!);
	});

	after(() => {
		for (const child of children) child.kill();
		rmSync(dir, { recursive: true, force: true });
	});

	/** Discovers the authorization server the way a client configured with its issuer does. */
	async function authorizationServer() {
		const issuer = new URL(`${authOrigin}/api/auth`);
		return oauth.processDiscoveryResponse(
			issuer,
			await oauth.discoveryRequest(issuer, { ...options, algorithm: "oauth2" }),
		);
	}

	it("names the authorization server that issues its tokens", async () => {
		const challenge = await oauth
			.protectedResourceRequest(
				"not-a-token",
				"GET",
				new URL(`${resource}/bearer`),
				undefined,
				undefined,
				options,
			)
			.then(
				() => assert.fail("the API should reject an invalid token"),
				(error: unknown) => {
					assert.ok(error instanceof oauth.WWWAuthenticateChallengeError);
					return error.cause[0];
				},
			);
		assert.equal(
			challenge?.parameters.resource_metadata,
			`${resource}/.well-known/oauth-protected-resource`,
		);

		const resourceServer = await oauth.processResourceDiscoveryResponse(
			new URL(resource),
			await oauth.resourceDiscoveryRequest(new URL(resource), options),
		);
		const issuer = resourceServer.authorization_servers?.[0];
		assert.ok(issuer, "the API should name its authorization server");
		// Rejects metadata whose `issuer` differs from the advertised one.
		const as = await oauth.processDiscoveryResponse(
			new URL(issuer),
			await oauth.discoveryRequest(new URL(issuer), {
				...options,
				algorithm: "oauth2",
			}),
		);
		assert.equal(as.issuer, `${authOrigin}/api/auth`);
	});

	async function clientCredentialsToken(as: oauth.AuthorizationServer) {
		const tokens = await oauth.processClientCredentialsResponse(
			as,
			client,
			await oauth.clientCredentialsGrantRequest(
				as,
				client,
				clientAuth,
				new URLSearchParams({ scope: "read:data", resource }),
				options,
			),
		);
		return tokens.access_token;
	}

	async function callApi(
		path: string,
		accessToken: string,
		requestOptions: oauth.ProtectedResourceRequestOptions = options,
		headers?: Headers,
	) {
		const response = await oauth.protectedResourceRequest(
			accessToken,
			"GET",
			new URL(`${resource}${path}`),
			headers,
			undefined,
			requestOptions,
		);
		assert.equal(response.status, 200, await response.clone().text());
		return (await response.json()) as Record<string, unknown>;
	}

	it("accepts a client credentials token", async () => {
		const as = await authorizationServer();
		const payload = await callApi("/bearer", await clientCredentialsToken(as));
		assert.equal(payload.iss, as.issuer);
		assert.equal(payload.client_id, client.client_id);
		assert.deepEqual(payload.aud, resource);
	});

	it("accepts a DPoP-bound user token from the authorization code flow", async () => {
		const as = await authorizationServer();
		const DPoP = oauth.DPoP(client, await oauth.generateKeyPair("ES256"));
		const codeVerifier = oauth.generateRandomCodeVerifier();
		const state = oauth.generateRandomState();
		const authorizationUrl = new URL(as.authorization_endpoint!);
		authorizationUrl.search = new URLSearchParams({
			client_id: client.client_id,
			response_type: "code",
			redirect_uri: redirectUri,
			scope: "openid read:data",
			resource,
			state,
			code_challenge: await oauth.calculatePKCECodeChallenge(codeVerifier),
			code_challenge_method: "S256",
		}).toString();
		// The signed-in user approves in the browser; the JSON response carries
		// the redirect a browser would follow.
		const authorize = await fetch(authorizationUrl, {
			headers: { cookie: seed.cookie!, accept: "application/json" },
			redirect: "manual",
		});
		const { url: callbackUrl } = (await authorize.json()) as { url: string };
		const tokens = await oauth.processAuthorizationCodeResponse(
			as,
			client,
			await oauth.authorizationCodeGrantRequest(
				as,
				client,
				clientAuth,
				oauth.validateAuthResponse(as, client, new URL(callbackUrl), state),
				redirectUri,
				codeVerifier,
				{ ...options, DPoP, additionalParameters: { resource } },
			),
		);
		assert.equal(tokens.token_type, "dpop");

		const payload = await callApi("/dpop", tokens.access_token, {
			...options,
			DPoP,
		});
		assert.equal(payload.iss, as.issuer);
		assert.equal(payload.sub, oauth.getValidatedIdTokenClaims(tokens)?.sub);
	});

	it("introspects a token at the default introspection endpoint", async () => {
		const as = await authorizationServer();
		const payload = await callApi(
			"/introspect",
			await clientCredentialsToken(as),
			options,
			new Headers({
				"x-client-id": client.client_id,
				"x-client-secret": seed.clientSecret!,
			}),
		);
		assert.equal(payload.active, true);
		assert.equal(payload.iss, as.issuer);
		assert.equal(payload.client_id, client.client_id);
	});
});
