import { describe, expect, it } from "vitest";
import { validatePublicClientJwks } from "./client-jwks";

describe("validatePublicClientJwks", () => {
	it.each([
		{
			kty: "RSA",
			n: "public-modulus",
			e: "AQAB",
		},
		{
			kty: "EC",
			crv: "P-256",
			x: "public-x",
			y: "public-y",
		},
		{
			kty: "OKP",
			crv: "Ed25519",
			x: "public-x",
		},
	])("accepts a supported public $kty key", (key) => {
		expect(validatePublicClientJwks({ keys: [key] })).toMatchObject({
			valid: true,
			jwks: { keys: [key] },
		});
	});

	it.each([
		{ name: "missing set", jwks: undefined },
		{
			name: "bare key array",
			jwks: [{ kty: "RSA", n: "public-modulus", e: "AQAB" }],
		},
		{ name: "empty set", jwks: { keys: [] } },
		{ name: "non-object key", jwks: { keys: ["key"] } },
		{
			name: "symmetric key",
			jwks: { keys: [{ kty: "oct", k: "secret" }] },
		},
		{
			name: "private RSA key",
			jwks: { keys: [{ kty: "RSA", n: "n", e: "AQAB", d: "private" }] },
		},
		{
			name: "private EC key",
			jwks: {
				keys: [{ kty: "EC", crv: "P-256", x: "x", y: "y", d: "private" }],
			},
		},
		{
			name: "private OKP key",
			jwks: {
				keys: [{ kty: "OKP", crv: "Ed25519", x: "x", d: "private" }],
			},
		},
		{
			name: "incomplete RSA key",
			jwks: { keys: [{ kty: "RSA", n: "n" }] },
		},
		{
			name: "unsupported key type",
			jwks: { keys: [{ kty: "AKP", alg: "ML-DSA-65", pub: "public" }] },
		},
	])("rejects a $name", ({ jwks }) => {
		expect(validatePublicClientJwks(jwks)).toMatchObject({ valid: false });
	});
});
