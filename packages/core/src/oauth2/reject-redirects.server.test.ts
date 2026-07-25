import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clientCredentialsToken } from "./client-credentials-token";
import { refreshAccessToken } from "./refresh-access-token";
import {
	validateAuthorizationCode,
	validateToken,
} from "./validate-authorization-code";

/**
 * Drives the real network stack (undici / betterFetch / jose) against a real
 * loopback server that 302-redirects to an "internal" endpoint. Proves the
 * control behaviorally: the request is rejected AND the redirect target is never
 * connected to. A mocked fetch cannot prove the second part, because there is no
 * real second request to observe.
 */
describe("server-side OAuth fetches never follow a redirect to an internal host", () => {
	let server: Server;
	let baseUrl: string;
	let internalHit = false;
	let signedToken: string;

	beforeAll(async () => {
		const { publicKey, privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const publicJWK = await exportJWK(publicKey);
		publicJWK.kid = "test-key";
		publicJWK.alg = "RS256";
		signedToken = await new SignJWT({ sub: "user" })
			.setProtectedHeader({ alg: "RS256", kid: "test-key" })
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(privateKey);

		server = createServer((req, res) => {
			const path = (req.url ?? "/").split("?")[0];
			if (path === "/redirecting-token" || path === "/redirecting-jwks") {
				const target =
					path === "/redirecting-jwks" ? "/internal-jwks" : "/internal-token";
				res.writeHead(302, { location: `${baseUrl}${target}` });
				res.end();
				return;
			}
			if (path === "/internal-token") {
				internalHit = true;
				res.writeHead(200, { "content-type": "application/json" });
				res.end(
					JSON.stringify({
						access_token: "leaked-internal-token",
						token_type: "Bearer",
					}),
				);
				return;
			}
			if (path === "/internal-jwks") {
				internalHit = true;
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({ keys: [publicJWK] }));
				return;
			}
			res.writeHead(404);
			res.end();
		});

		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		const { port } = server.address() as AddressInfo;
		baseUrl = `http://127.0.0.1:${port}`;
	});

	afterAll(async () => {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});

	beforeEach(() => {
		internalHit = false;
	});

	it("sanity: a client that follows redirects does reach the internal endpoint", async () => {
		const response = await fetch(`${baseUrl}/redirecting-token`, {
			redirect: "follow",
		});
		await response.text();
		expect(internalHit).toBe(true);
	});

	it("validateAuthorizationCode rejects the redirect and never connects to the internal host", async () => {
		await expect(
			validateAuthorizationCode({
				code: "auth-code",
				redirectURI: `${baseUrl}/callback`,
				options: { clientId: "client", clientSecret: "secret" },
				tokenEndpoint: `${baseUrl}/redirecting-token`,
			}),
		).rejects.toThrow(/refuse redirects to prevent SSRF/);
		expect(internalHit).toBe(false);
	});

	it("refreshAccessToken rejects the redirect and never connects to the internal host", async () => {
		await expect(
			refreshAccessToken({
				refreshToken: "refresh-token",
				options: { clientId: "client", clientSecret: "secret" },
				tokenEndpoint: `${baseUrl}/redirecting-token`,
			}),
		).rejects.toThrow(/refuse redirects to prevent SSRF/);
		expect(internalHit).toBe(false);
	});

	it("clientCredentialsToken rejects the redirect and never connects to the internal host", async () => {
		await expect(
			clientCredentialsToken({
				options: { clientId: "client", clientSecret: "secret" },
				tokenEndpoint: `${baseUrl}/redirecting-token`,
				scope: "openid",
			}),
		).rejects.toThrow(/refuse redirects to prevent SSRF/);
		expect(internalHit).toBe(false);
	});

	it("validateToken (JWKS) rejects the redirect and never connects to the internal host", async () => {
		await expect(
			validateToken(signedToken, `${baseUrl}/redirecting-jwks`),
		).rejects.toThrow(/refuse redirects to prevent SSRF/);
		expect(internalHit).toBe(false);
	});
});
