import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import type { AuthContext } from "@better-auth/core";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { genericOAuth } from "./index";

describe("genericOAuth discoveryHeaders for JWKS fetch", () => {
	it("forwards discoveryHeaders to same-origin JWKS fetch when endpoints are gated", async () => {
		const keyPair = await generateKeyPair("RS256");
		const publicJwk = await exportJWK(keyPair.publicKey);
		publicJwk.kid = "test-key-id";
		publicJwk.alg = "RS256";
		publicJwk.use = "sig";

		let jwksReceivedHeaders: IncomingHttpHeaders | undefined;

		const server = createServer((req, res) => {
			const url = new URL(req.url || "/", `http://${req.headers.host}`);
			res.setHeader("content-type", "application/json");

			if (url.pathname === "/.well-known/openid-configuration") {
				expect(req.headers["x-gated-header"]).toBe("secret-bypass-token");
				res.end(
					JSON.stringify({
						issuer: `http://${req.headers.host}`,
						authorization_endpoint: `http://${req.headers.host}/authorize`,
						token_endpoint: `http://${req.headers.host}/token`,
						userinfo_endpoint: `http://${req.headers.host}/userinfo`,
						jwks_uri: `http://${req.headers.host}/jwks.json`,
						id_token_signing_alg_values_supported: ["RS256"],
					}),
				);
				return;
			}

			if (url.pathname === "/jwks.json") {
				jwksReceivedHeaders = req.headers;
				if (req.headers["x-gated-header"] !== "secret-bypass-token") {
					res.statusCode = 401;
					res.end(
						JSON.stringify({ error: "Unauthorized: Missing gated header" }),
					);
					return;
				}
				res.end(JSON.stringify({ keys: [publicJwk] }));
				return;
			}

			res.statusCode = 404;
			res.end();
		});

		await new Promise<void>((resolve) => server.listen(0, resolve));
		const port = (server.address() as AddressInfo).port;
		const host = `localhost:${port}`;
		const issuer = `http://${host}`;

		try {
			const plugin = genericOAuth({
				config: [
					{
						providerId: "gated-provider",
						discoveryUrl: `${issuer}/.well-known/openid-configuration`,
						discoveryHeaders: {
							"x-gated-header": "secret-bypass-token",
						},
						clientId: "test-client-id",
						clientSecret: "test-client-secret",
					},
				],
			});

			const mockCtx = {
				logger: {
					error: vi.fn(),
					warn: vi.fn(),
					info: vi.fn(),
				},
				socialProviders: [],
			} as unknown as AuthContext;

			const result = await plugin.init(mockCtx);
			const provider = result.context?.socialProviders.find(
				(p) => p.id === "gated-provider",
			);
			expect(provider).toBeDefined();

			const idToken = await new SignJWT({
				sub: "user-123",
				email: "user@example.com",
				email_verified: true,
				name: "Gated User",
			})
				.setProtectedHeader({ alg: "RS256", kid: "test-key-id" })
				.setIssuer(issuer)
				.setAudience("test-client-id")
				.setIssuedAt()
				.setExpirationTime("2h")
				.sign(keyPair.privateKey);

			const userInfo = await provider?.getUserInfo({
				accessToken: "sample-access-token",
				idToken,
			});

			expect(userInfo).not.toBeNull();
			expect(userInfo?.data.id).toBe("user-123");
			expect(userInfo?.user.email).toBe("user@example.com");
			expect(jwksReceivedHeaders?.["x-gated-header"]).toBe(
				"secret-bypass-token",
			);
		} finally {
			await new Promise<void>((resolve, reject) =>
				server.close((err) => (err ? reject(err) : resolve())),
			);
		}
	});

	it("does not forward discoveryHeaders to third-party cross-origin JWKS uri", async () => {
		const keyPair = await generateKeyPair("RS256");
		const publicJwk = await exportJWK(keyPair.publicKey);
		publicJwk.kid = "test-cross-origin-key";
		publicJwk.alg = "RS256";
		publicJwk.use = "sig";

		let externalJwksHeaders: IncomingHttpHeaders | undefined;

		const externalServer = createServer((req, res) => {
			const url = new URL(req.url || "/", `http://${req.headers.host}`);
			res.setHeader("content-type", "application/json");

			if (url.pathname === "/external-jwks.json") {
				externalJwksHeaders = req.headers;
				res.end(JSON.stringify({ keys: [publicJwk] }));
				return;
			}

			res.statusCode = 404;
			res.end();
		});

		await new Promise<void>((resolve) => externalServer.listen(0, resolve));
		const externalPort = (externalServer.address() as AddressInfo).port;
		const externalOrigin = `http://localhost:${externalPort}`;

		const discoveryServer = createServer((req, res) => {
			const url = new URL(req.url || "/", `http://${req.headers.host}`);
			res.setHeader("content-type", "application/json");

			if (url.pathname === "/.well-known/openid-configuration") {
				res.end(
					JSON.stringify({
						issuer: `http://${req.headers.host}`,
						authorization_endpoint: `http://${req.headers.host}/authorize`,
						token_endpoint: `http://${req.headers.host}/token`,
						userinfo_endpoint: `http://${req.headers.host}/userinfo`,
						jwks_uri: `${externalOrigin}/external-jwks.json`,
						id_token_signing_alg_values_supported: ["RS256"],
					}),
				);
				return;
			}

			res.statusCode = 404;
			res.end();
		});

		await new Promise<void>((resolve) => discoveryServer.listen(0, resolve));
		const discoveryPort = (discoveryServer.address() as AddressInfo).port;
		const discoveryOrigin = `http://localhost:${discoveryPort}`;

		try {
			const plugin = genericOAuth({
				config: [
					{
						providerId: "cross-origin-provider",
						discoveryUrl: `${discoveryOrigin}/.well-known/openid-configuration`,
						discoveryHeaders: {
							"x-confidential-secret": "must-not-leak",
						},
						clientId: "test-client-id",
						clientSecret: "test-client-secret",
					},
				],
			});

			const mockCtx = {
				logger: {
					error: vi.fn(),
					warn: vi.fn(),
					info: vi.fn(),
				},
				socialProviders: [],
			} as unknown as AuthContext;

			const result = await plugin.init(mockCtx);
			const provider = result.context?.socialProviders.find(
				(p) => p.id === "cross-origin-provider",
			);
			expect(provider).toBeDefined();

			const idToken = await new SignJWT({
				sub: "user-cross",
				email: "cross@example.com",
				email_verified: true,
			})
				.setProtectedHeader({ alg: "RS256", kid: "test-cross-origin-key" })
				.setIssuer(discoveryOrigin)
				.setAudience("test-client-id")
				.setIssuedAt()
				.setExpirationTime("2h")
				.sign(keyPair.privateKey);

			const userInfo = await provider?.getUserInfo({
				accessToken: "sample-access-token",
				idToken,
			});

			expect(userInfo).not.toBeNull();
			expect(userInfo?.data.id).toBe("user-cross");
			expect(userInfo?.user.email).toBe("cross@example.com");
			expect(externalJwksHeaders?.["x-confidential-secret"]).toBeUndefined();
		} finally {
			await Promise.all([
				new Promise<void>((resolve, reject) =>
					externalServer.close((err) => (err ? reject(err) : resolve())),
				),
				new Promise<void>((resolve, reject) =>
					discoveryServer.close((err) => (err ? reject(err) : resolve())),
				),
			]);
		}
	});

	it("forwards discoveryHeaders when jwks_uri is a relative path", async () => {
		const keyPair = await generateKeyPair("RS256");
		const publicJwk = await exportJWK(keyPair.publicKey);
		publicJwk.kid = "test-rel-key";
		publicJwk.alg = "RS256";
		publicJwk.use = "sig";

		let jwksReceivedHeaders: IncomingHttpHeaders | undefined;

		const server = createServer((req, res) => {
			const url = new URL(req.url || "/", `http://${req.headers.host}`);
			res.setHeader("content-type", "application/json");

			if (url.pathname === "/auth/oidc/.well-known/openid-configuration") {
				res.end(
					JSON.stringify({
						issuer: `http://${req.headers.host}/auth/oidc`,
						authorization_endpoint: `http://${req.headers.host}/auth/oidc/authorize`,
						token_endpoint: `http://${req.headers.host}/auth/oidc/token`,
						userinfo_endpoint: `http://${req.headers.host}/auth/oidc/userinfo`,
						jwks_uri: "/auth/oidc/keys.json",
						id_token_signing_alg_values_supported: ["RS256"],
					}),
				);
				return;
			}

			if (url.pathname === "/auth/oidc/keys.json") {
				jwksReceivedHeaders = req.headers;
				res.end(JSON.stringify({ keys: [publicJwk] }));
				return;
			}

			res.statusCode = 404;
			res.end();
		});

		await new Promise<void>((resolve) => server.listen(0, resolve));
		const port = (server.address() as AddressInfo).port;
		const issuer = `http://localhost:${port}/auth/oidc`;

		try {
			const plugin = genericOAuth({
				config: [
					{
						providerId: "relative-jwks-provider",
						discoveryUrl: `${issuer}/.well-known/openid-configuration`,
						discoveryHeaders: {
							authorization: "Bearer service-token",
						},
						clientId: "test-client-id",
						clientSecret: "test-client-secret",
					},
				],
			});

			const mockCtx = {
				logger: {
					error: vi.fn(),
					warn: vi.fn(),
					info: vi.fn(),
				},
				socialProviders: [],
			} as unknown as AuthContext;

			const result = await plugin.init(mockCtx);
			const provider = result.context?.socialProviders.find(
				(p) => p.id === "relative-jwks-provider",
			);
			expect(provider).toBeDefined();

			const idToken = await new SignJWT({
				sub: "user-relative",
				email: "rel@example.com",
				email_verified: true,
			})
				.setProtectedHeader({ alg: "RS256", kid: "test-rel-key" })
				.setIssuer(issuer)
				.setAudience("test-client-id")
				.setIssuedAt()
				.setExpirationTime("2h")
				.sign(keyPair.privateKey);

			const userInfo = await provider?.getUserInfo({
				accessToken: "sample-access-token",
				idToken,
			});

			expect(userInfo).not.toBeNull();
			expect(userInfo?.data.id).toBe("user-relative");
			expect(userInfo?.user.email).toBe("rel@example.com");
			expect(jwksReceivedHeaders?.authorization).toBe("Bearer service-token");
		} finally {
			await new Promise<void>((resolve, reject) =>
				server.close((err) => (err ? reject(err) : resolve())),
			);
		}
	});

	it("operates normally when no discoveryHeaders are configured", async () => {
		const keyPair = await generateKeyPair("RS256");
		const publicJwk = await exportJWK(keyPair.publicKey);
		publicJwk.kid = "test-no-header-key";
		publicJwk.alg = "RS256";
		publicJwk.use = "sig";

		let jwksReceivedHeaders: IncomingHttpHeaders | undefined;

		const server = createServer((req, res) => {
			const url = new URL(req.url || "/", `http://${req.headers.host}`);
			res.setHeader("content-type", "application/json");

			if (url.pathname === "/.well-known/openid-configuration") {
				res.end(
					JSON.stringify({
						issuer: `http://${req.headers.host}`,
						authorization_endpoint: `http://${req.headers.host}/authorize`,
						token_endpoint: `http://${req.headers.host}/token`,
						userinfo_endpoint: `http://${req.headers.host}/userinfo`,
						jwks_uri: `http://${req.headers.host}/jwks.json`,
						id_token_signing_alg_values_supported: ["RS256"],
					}),
				);
				return;
			}

			if (url.pathname === "/jwks.json") {
				jwksReceivedHeaders = req.headers;
				res.end(JSON.stringify({ keys: [publicJwk] }));
				return;
			}

			res.statusCode = 404;
			res.end();
		});

		await new Promise<void>((resolve) => server.listen(0, resolve));
		const port = (server.address() as AddressInfo).port;
		const issuer = `http://localhost:${port}`;

		try {
			const plugin = genericOAuth({
				config: [
					{
						providerId: "ungated-provider",
						discoveryUrl: `${issuer}/.well-known/openid-configuration`,
						clientId: "test-client-id",
						clientSecret: "test-client-secret",
					},
				],
			});

			const mockCtx = {
				logger: {
					error: vi.fn(),
					warn: vi.fn(),
					info: vi.fn(),
				},
				socialProviders: [],
			} as unknown as AuthContext;

			const result = await plugin.init(mockCtx);
			const provider = result.context?.socialProviders.find(
				(p) => p.id === "ungated-provider",
			);
			expect(provider).toBeDefined();

			const idToken = await new SignJWT({
				sub: "user-ungated",
				email: "ungated@example.com",
				email_verified: true,
			})
				.setProtectedHeader({ alg: "RS256", kid: "test-no-header-key" })
				.setIssuer(issuer)
				.setAudience("test-client-id")
				.setIssuedAt()
				.setExpirationTime("2h")
				.sign(keyPair.privateKey);

			const userInfo = await provider?.getUserInfo({
				accessToken: "sample-access-token",
				idToken,
			});

			expect(userInfo).not.toBeNull();
			expect(userInfo?.data.id).toBe("user-ungated");
			expect(userInfo?.user.email).toBe("ungated@example.com");
			expect(jwksReceivedHeaders).toBeDefined();
		} finally {
			await new Promise<void>((resolve, reject) =>
				server.close((err) => (err ? reject(err) : resolve())),
			);
		}
	});
});
