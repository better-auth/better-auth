import {
	createLocalJWKSet,
	decodeJwt,
	decodeProtectedHeader,
	exportJWK,
	generateKeyPair,
	jwtVerify,
} from "jose";
import { describe, expect, it } from "vitest";
import {
	createPrivateKeyJwtClientAssertionGetter,
	signPrivateKeyJwtClientAssertion,
} from "./client-assertion";

describe("signPrivateKeyJwtClientAssertion", () => {
	const clientId = "test-client-id";
	const tokenEndpoint = "https://idp.example.com/token";

	it("signs a valid JWT with RSA JWK", async () => {
		const { privateKey, publicKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const privateJwk = await exportJWK(privateKey);
		const publicJwk = await exportJWK(publicKey);

		const assertion = await signPrivateKeyJwtClientAssertion({
			clientId,
			tokenEndpoint,
			privateKeyJwk: privateJwk,
			algorithm: "RS256",
		});

		const jwks = createLocalJWKSet({ keys: [publicJwk] });
		const { payload } = await jwtVerify(assertion, jwks, {
			algorithms: ["RS256"],
		});

		expect(payload.iss).toBe(clientId);
		expect(payload.sub).toBe(clientId);
		expect(payload.aud).toBe(tokenEndpoint);
		expect(payload.jti).toBeDefined();
		expect(payload.iat).toBeDefined();
		expect(payload.exp).toBeDefined();
		expect(payload.exp! - payload.iat!).toBe(120);
	});

	it("signs a valid JWT with EdDSA JWK", async () => {
		const { privateKey, publicKey } = await generateKeyPair("EdDSA", {
			extractable: true,
		});
		const privateJwk = await exportJWK(privateKey);
		const publicJwk = await exportJWK(publicKey);

		const assertion = await signPrivateKeyJwtClientAssertion({
			clientId,
			tokenEndpoint,
			privateKeyJwk: privateJwk,
			algorithm: "EdDSA",
		});

		const jwks = createLocalJWKSet({ keys: [publicJwk] });
		const { payload } = await jwtVerify(assertion, jwks, {
			algorithms: ["EdDSA"],
		});

		expect(payload.iss).toBe(clientId);
		expect(payload.sub).toBe(clientId);
	});

	it("includes kid in JWT header when provided", async () => {
		const { privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const privateJwk = await exportJWK(privateKey);

		const assertion = await signPrivateKeyJwtClientAssertion({
			clientId,
			tokenEndpoint,
			privateKeyJwk: privateJwk,
			kid: "my-key-id",
			algorithm: "RS256",
		});

		const header = decodeProtectedHeader(assertion);
		expect(header.kid).toBe("my-key-id");
		expect(header.alg).toBe("RS256");
	});

	it("produces unique jti on each call", async () => {
		const { privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const privateJwk = await exportJWK(privateKey);

		const a1 = await signPrivateKeyJwtClientAssertion({
			clientId,
			tokenEndpoint,
			privateKeyJwk: privateJwk,
		});
		const a2 = await signPrivateKeyJwtClientAssertion({
			clientId,
			tokenEndpoint,
			privateKeyJwk: privateJwk,
		});

		const p1 = decodeJwt(a1);
		const p2 = decodeJwt(a2);
		expect(p1.jti).not.toBe(p2.jti);
	});

	it("auto-extracts kid from JWK when not explicitly provided", async () => {
		const { privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const privateJwk = { ...(await exportJWK(privateKey)), kid: "jwk-kid" };

		const assertion = await signPrivateKeyJwtClientAssertion({
			clientId,
			tokenEndpoint,
			privateKeyJwk: privateJwk,
		});

		const header = decodeProtectedHeader(assertion);
		expect(header.kid).toBe("jwk-kid");
	});

	it("prefers explicit kid over JWK-embedded kid", async () => {
		const { privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const privateJwk = { ...(await exportJWK(privateKey)), kid: "jwk-kid" };

		const assertion = await signPrivateKeyJwtClientAssertion({
			clientId,
			tokenEndpoint,
			privateKeyJwk: privateJwk,
			kid: "explicit-kid",
		});

		const header = decodeProtectedHeader(assertion);
		expect(header.kid).toBe("explicit-kid");
	});

	it("auto-extracts alg from JWK when not explicitly provided", async () => {
		const { privateKey, publicKey } = await generateKeyPair("ES256", {
			extractable: true,
		});
		const privateJwk = { ...(await exportJWK(privateKey)), alg: "ES256" };
		const publicJwk = await exportJWK(publicKey);

		const assertion = await signPrivateKeyJwtClientAssertion({
			clientId,
			tokenEndpoint,
			privateKeyJwk: privateJwk,
		});

		const header = decodeProtectedHeader(assertion);
		expect(header.alg).toBe("ES256");

		const jwks = createLocalJWKSet({ keys: [publicJwk] });
		const { payload } = await jwtVerify(assertion, jwks, {
			algorithms: ["ES256"],
		});
		expect(payload.iss).toBe(clientId);
	});

	it("rejects a JWK whose embedded alg is not allowed for private_key_jwt", async () => {
		const { privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const privateJwk = { ...(await exportJWK(privateKey)), alg: "HS256" };

		await expect(
			signPrivateKeyJwtClientAssertion({
				clientId,
				tokenEndpoint,
				privateKeyJwk: privateJwk,
			}),
		).rejects.toThrow(/Unsupported private_key_jwt signing algorithm: HS256/);
	});

	it("rejects a JWK whose embedded alg conflicts with the explicit algorithm", async () => {
		const { privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const privateJwk = { ...(await exportJWK(privateKey)), alg: "RS256" };

		await expect(
			signPrivateKeyJwtClientAssertion({
				clientId,
				tokenEndpoint,
				privateKeyJwk: privateJwk,
				algorithm: "PS256",
			}),
		).rejects.toThrow(
			/JWK alg "RS256" does not match configured algorithm "PS256"/,
		);
	});

	it("rejects a disallowed embedded alg even when an explicit algorithm is set", async () => {
		const { privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const privateJwk = { ...(await exportJWK(privateKey)), alg: "HS256" };

		await expect(
			signPrivateKeyJwtClientAssertion({
				clientId,
				tokenEndpoint,
				privateKeyJwk: privateJwk,
				algorithm: "RS256",
			}),
		).rejects.toThrow(/Unsupported private_key_jwt signing algorithm: HS256/);
	});

	it("rejects a disallowed explicit algorithm passed by JavaScript callers", async () => {
		const { privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const privateJwk = await exportJWK(privateKey);

		await expect(
			signPrivateKeyJwtClientAssertion({
				clientId,
				tokenEndpoint,
				privateKeyJwk: privateJwk,
				// @ts-expect-error — JS callers can pass an unsupported alg string.
				algorithm: "HS256",
			}),
		).rejects.toThrow(/Unsupported private_key_jwt signing algorithm: HS256/);
	});

	it("createPrivateKeyJwtClientAssertionGetter throws eagerly on misconfiguration", async () => {
		const { privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const privateJwk = { ...(await exportJWK(privateKey)), alg: "HS256" };

		expect(() =>
			createPrivateKeyJwtClientAssertionGetter({
				privateKeyJwk: privateJwk,
			}),
		).toThrow(/Unsupported private_key_jwt signing algorithm: HS256/);

		expect(() =>
			createPrivateKeyJwtClientAssertionGetter({ algorithm: "RS256" }),
		).toThrow(/private_key_jwt requires either privateKeyJwk or privateKeyPem/);
	});

	it("throws when neither JWK nor PEM is provided", async () => {
		await expect(
			signPrivateKeyJwtClientAssertion({ clientId, tokenEndpoint }),
		).rejects.toThrow(
			"private_key_jwt requires either privateKeyJwk or privateKeyPem",
		);
	});

	it("creates a private_key_jwt client assertion getter", async () => {
		const { privateKey, publicKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const privateJwk = await exportJWK(privateKey);
		const publicJwk = await exportJWK(publicKey);

		const getClientAssertion = createPrivateKeyJwtClientAssertionGetter({
			privateKeyJwk: privateJwk,
			algorithm: "RS256",
		});

		const assertion = await getClientAssertion({
			clientId,
			tokenEndpoint,
			grantType: "authorization_code",
		});
		const jwks = createLocalJWKSet({ keys: [publicJwk] });
		const { payload } = await jwtVerify(assertion, jwks, {
			algorithms: ["RS256"],
		});

		expect(payload.iss).toBe(clientId);
		expect(payload.sub).toBe(clientId);
		expect(payload.aud).toBe(tokenEndpoint);
	});
});
