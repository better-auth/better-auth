import type { IncomingMessage } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { generateDpopKeyPair } from "@better-auth/core/oauth2/dpop-client";
import type { JWK } from "jose";
import {
	calculateJwkThumbprint,
	decodeJwt,
	decodeProtectedHeader,
	exportJWK,
} from "jose";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { genericOAuth } from ".";
import type { GenericOAuthConfig } from "./types";

interface RecordedRequest {
	path: string;
	headers: IncomingMessage["headers"];
	body: URLSearchParams;
}

const NONCE = "server-nonce-1";

/**
 * Authorization server that requires DPoP (RFC 9449). A proof without the
 * current nonce gets `use_dpop_nonce`, and tokens are issued as `DPoP`.
 */
async function startAuthorizationServer() {
	const requests: RecordedRequest[] = [];
	const settings = { tokenType: "DPoP", advertisePar: false };

	const server = createServer(async (req, res) => {
		const chunks: Buffer[] = [];
		for await (const chunk of req) chunks.push(chunk as Buffer);
		const path = new URL(req.url ?? "/", url).pathname;
		const body = new URLSearchParams(Buffer.concat(chunks).toString());
		requests.push({ path, headers: req.headers, body });

		const json = (status: number, payload: object) => {
			res.statusCode = status;
			res.setHeader("content-type", "application/json");
			res.setHeader("DPoP-Nonce", NONCE);
			res.end(JSON.stringify(payload));
		};
		const proof = req.headers.dpop;
		const proofNonce =
			typeof proof === "string" ? decodeJwt(proof).nonce : undefined;

		if (path === "/.well-known/openid-configuration") {
			return json(200, {
				issuer: url,
				authorization_endpoint: `${url}/authorize`,
				token_endpoint: `${url}/token`,
				userinfo_endpoint: `${url}/userinfo`,
				dpop_signing_alg_values_supported: ["ES256"],
				...(settings.advertisePar && {
					pushed_authorization_request_endpoint: `${url}/par`,
					require_pushed_authorization_requests: true,
				}),
			});
		}
		if (path === "/par") {
			return json(201, { request_uri: "urn:example:pushed", expires_in: 60 });
		}
		if (path === "/token") {
			if (proofNonce !== NONCE) {
				return json(400, { error: "use_dpop_nonce" });
			}
			return json(200, {
				access_token: "dpop-access-token",
				refresh_token: "dpop-refresh-token",
				token_type: settings.tokenType,
				expires_in: 3600,
			});
		}
		if (path === "/userinfo") {
			return json(200, {
				id: "dpop-user",
				email: "dpop-user@example.com",
				name: "DPoP User",
				email_verified: true,
			});
		}
		res.statusCode = 404;
		res.end();
	});
	await new Promise<void>((resolve) => server.listen(0, resolve));
	const url = `http://localhost:${(server.address() as AddressInfo).port}`;
	return {
		url,
		requests,
		settings,
		at: (path: string) => requests.filter((r) => r.path === path),
		close: () =>
			new Promise<void>((resolve, reject) =>
				server.close((err) => (err ? reject(err) : resolve())),
			),
	};
}

describe("generic-oauth DPoP", async () => {
	const authorizationServer = await startAuthorizationServer();
	const keyPair = await generateDpopKeyPair();
	const thumbprint = await calculateJwkThumbprint(
		(await exportJWK(keyPair.publicKey)) as JWK,
	);

	afterEach(() => {
		authorizationServer.requests.length = 0;
		Object.assign(authorizationServer.settings, {
			tokenType: "DPoP",
			advertisePar: false,
		});
	});
	afterAll(async () => {
		await authorizationServer.close();
	});

	async function createInstance(config: Partial<GenericOAuthConfig> = {}) {
		return getTestInstance(
			{
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "dpop",
								discoveryUrl: `${authorizationServer.url}/.well-known/openid-configuration`,
								clientId: "dpop-client",
								clientSecret: "dpop-secret",
								dpop: { keyPair },
								...config,
							},
						],
					}),
				],
			},
			{ disableTestUser: true },
		);
	}

	async function signIn(instance: Awaited<ReturnType<typeof createInstance>>) {
		const headers = new Headers();
		const res = await instance.client.signIn.social({
			provider: "dpop",
			callbackURL: "/dashboard",
			fetchOptions: { onSuccess: instance.cookieSetter(headers) },
		});
		const authorizationURL = new URL(res.data!.url!);
		const callback = await instance.auth.handler(
			new Request(
				`http://localhost:3000/api/auth/callback/dpop?code=dpop-code&state=${authorizationURL.searchParams.get("state")}`,
				{ headers },
			),
		);
		return { authorizationURL, callback };
	}

	function expectProof(
		request: RecordedRequest | undefined,
		method: string,
		path: string,
	) {
		const proof = request?.headers.dpop;
		expect(proof).toEqual(expect.any(String));
		const header = decodeProtectedHeader(proof as string);
		expect(header.typ).toBe("dpop+jwt");
		const claims = decodeJwt(proof as string);
		expect(claims.htm).toBe(method);
		expect(claims.htu).toBe(`${authorizationServer.url}${path}`);
		return { header, claims };
	}

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-10
	 */
	it("binds the authorization code to the key with dpop_jkt", async () => {
		const instance = await createInstance();
		const { authorizationURL } = await signIn(instance);

		expect(authorizationURL.searchParams.get("dpop_jkt")).toBe(thumbprint);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-8
	 */
	it("sends a DPoP proof to the token endpoint and retries once with the server nonce", async () => {
		const instance = await createInstance();
		const { callback } = await signIn(instance);

		expect(callback.status).toBe(302);
		expect(callback.headers.get("location")).toBe("/dashboard");
		const [first, retry] = authorizationServer.at("/token");
		expect(authorizationServer.at("/token")).toHaveLength(2);
		expect(expectProof(first, "POST", "/token").claims.nonce).toBeUndefined();
		expect(expectProof(retry, "POST", "/token").claims.nonce).toBe(NONCE);
		expect(retry!.body.get("code")).toBe("dpop-code");
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-7.1
	 */
	it("calls userinfo with the DPoP scheme and a proof bound to the access token", async () => {
		const instance = await createInstance();
		await signIn(instance);

		const [userinfo] = authorizationServer.at("/userinfo");
		expect(userinfo?.headers.authorization).toBe("DPoP dpop-access-token");
		expect(expectProof(userinfo, "GET", "/userinfo").claims.ath).toEqual(
			expect.any(String),
		);
	});

	it("calls userinfo with the Bearer scheme when the provider issues a Bearer token", async () => {
		authorizationServer.settings.tokenType = "Bearer";
		const instance = await createInstance();
		const { callback } = await signIn(instance);

		expect(callback.headers.get("location")).toBe("/dashboard");
		const [userinfo] = authorizationServer.at("/userinfo");
		expect(userinfo?.headers.authorization).toBe("Bearer dpop-access-token");
	});

	it("sends a DPoP proof with the refresh token request", async () => {
		const instance = await createInstance();
		await signIn(instance);
		authorizationServer.requests.length = 0;

		const provider = (await instance.auth.$context).socialProviders.find(
			(p) => p.id === "dpop",
		);
		const tokens = await provider!.refreshAccessToken!("dpop-refresh-token");

		expect(tokens.tokenType).toBe("DPoP");
		const [refresh] = authorizationServer.at("/token");
		expect(refresh!.body.get("grant_type")).toBe("refresh_token");
		// The nonce from the sign-in is reused, so no retry is needed.
		expect(expectProof(refresh, "POST", "/token").claims.nonce).toBe(NONCE);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-10.1
	 */
	it("sends a DPoP proof and dpop_jkt with a pushed authorization request", async () => {
		authorizationServer.settings.advertisePar = true;
		const instance = await createInstance();
		const { authorizationURL } = await signIn(instance);

		expect(authorizationURL.searchParams.get("request_uri")).toBe(
			"urn:example:pushed",
		);
		const [pushed] = authorizationServer.at("/par");
		const { header } = expectProof(pushed, "POST", "/par");
		expect(await calculateJwkThumbprint(header.jwk as JWK)).toBe(thumbprint);
		expect(pushed!.body.get("dpop_jkt")).toBe(thumbprint);
	});

	it("sends no DPoP proof without the dpop option", async () => {
		authorizationServer.settings.tokenType = "Bearer";
		const instance = await createInstance({ dpop: undefined });
		const { authorizationURL } = await signIn(instance);

		expect(authorizationURL.searchParams.has("dpop_jkt")).toBe(false);
		const [token] = authorizationServer.at("/token");
		expect(token?.headers.dpop).toBeUndefined();
	});
});
