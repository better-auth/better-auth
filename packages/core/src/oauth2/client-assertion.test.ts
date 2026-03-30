import {
	createLocalJWKSet,
	decodeJwt,
	decodeProtectedHeader,
	exportJWK,
	generateKeyPair,
	jwtVerify,
} from "jose";
import { describe, expect, it } from "vitest";
import { signClientAssertion } from "./client-assertion";

describe("signClientAssertion", () => {
	const clientId = "test-client-id";
	const tokenEndpoint = "https://idp.example.com/token";

	it("signs a valid JWT with RSA JWK", async () => {
		const { privateKey, publicKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const privateJwk = await exportJWK(privateKey);
		const publicJwk = await exportJWK(publicKey);

		const assertion = await signClientAssertion({
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

		const assertion = await signClientAssertion({
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

		const assertion = await signClientAssertion({
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

		const a1 = await signClientAssertion({
			clientId,
			tokenEndpoint,
			privateKeyJwk: privateJwk,
		});
		const a2 = await signClientAssertion({
			clientId,
			tokenEndpoint,
			privateKeyJwk: privateJwk,
		});

		const p1 = decodeJwt(a1);
		const p2 = decodeJwt(a2);
		expect(p1.jti).not.toBe(p2.jti);
	});

	it("throws when neither JWK nor PEM is provided", async () => {
		await expect(
			signClientAssertion({ clientId, tokenEndpoint }),
		).rejects.toThrow(
			"private_key_jwt requires either privateKeyJwk or privateKeyPem",
		);
	});
});
