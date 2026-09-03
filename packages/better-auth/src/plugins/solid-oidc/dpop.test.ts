import {
	DPOP_PROOF_TYPE,
	deriveDpopAth,
	deriveDpopJkt,
	verifyDpopProof,
} from "@better-auth/core/oauth2";
import { decodeJwt, decodeProtectedHeader } from "jose";
import { describe, expect, it } from "vitest";
import {
	createSolidDpopProof,
	DEFAULT_SOLID_DPOP_ALGORITHM,
	generateSolidDpopKeyPair,
	importSolidDpopKeyPair,
	isSolidDpopAlgorithm,
} from "./dpop";

const TOKEN_ENDPOINT = "https://op.example/token";

describe("solid-oidc dpop key pairs", () => {
	it("generates an ES256 key pair by default", async () => {
		const keyPair = await generateSolidDpopKeyPair();
		expect(keyPair.algorithm).toBe(DEFAULT_SOLID_DPOP_ALGORITHM);
		expect(keyPair.publicJwk.kty).toBe("EC");
		expect(keyPair.publicJwk.crv).toBe("P-256");
	});

	it("never exposes private key material on the public JWK", async () => {
		const keyPair = await generateSolidDpopKeyPair();
		expect(keyPair.privateJwk.d).toBeTypeOf("string");
		for (const member of ["d", "p", "q", "dp", "dq", "qi", "oth", "k"]) {
			expect(keyPair.publicJwk).not.toHaveProperty(member);
		}
	});

	it("derives the thumbprint from the public JWK", async () => {
		const keyPair = await generateSolidDpopKeyPair();
		expect(keyPair.jkt).toBe(await deriveDpopJkt(keyPair.publicJwk));
	});

	it("generates a distinct key pair per call", async () => {
		const first = await generateSolidDpopKeyPair();
		const second = await generateSolidDpopKeyPair();
		expect(first.jkt).not.toBe(second.jkt);
	});

	it("supports every algorithm it reports as supported", async () => {
		for (const algorithm of ["ES256", "ES512", "PS256", "RS256"] as const) {
			expect(isSolidDpopAlgorithm(algorithm)).toBe(true);
			const keyPair = await generateSolidDpopKeyPair(algorithm);
			expect(keyPair.algorithm).toBe(algorithm);
		}
	});

	it("rejects an unsupported signing algorithm", async () => {
		expect(isSolidDpopAlgorithm("HS256")).toBe(false);
		await expect(
			// @ts-expect-error deliberately invalid to prove the runtime guard
			generateSolidDpopKeyPair("HS256"),
		).rejects.toThrow(/Unsupported Solid DPoP signing algorithm/);
	});

	it("round-trips a stored private JWK back to the same thumbprint", async () => {
		const keyPair = await generateSolidDpopKeyPair();
		const restored = await importSolidDpopKeyPair(
			JSON.parse(JSON.stringify(keyPair.privateJwk)),
			keyPair.algorithm,
		);
		expect(restored.jkt).toBe(keyPair.jkt);
		expect(restored.publicJwk).not.toHaveProperty("d");
	});

	it("strips non-public members when rebuilding a key pair", async () => {
		const keyPair = await generateSolidDpopKeyPair();
		const restored = await importSolidDpopKeyPair(
			{ ...keyPair.privateJwk, key_ops: ["sign"], ext: true },
			keyPair.algorithm,
		);
		expect(restored.publicJwk).not.toHaveProperty("key_ops");
		expect(restored.publicJwk).not.toHaveProperty("ext");
		expect(restored.jkt).toBe(keyPair.jkt);
	});

	it("rejects a stored key with an unsupported algorithm", async () => {
		const keyPair = await generateSolidDpopKeyPair();
		await expect(
			// @ts-expect-error deliberately invalid to prove the runtime guard
			importSolidDpopKeyPair(keyPair.privateJwk, "none"),
		).rejects.toThrow(/Unsupported Solid DPoP signing algorithm/);
	});
});

describe("solid-oidc dpop proofs", () => {
	it("produces a proof Better Auth's own verifier accepts", async () => {
		const keyPair = await generateSolidDpopKeyPair();
		const proof = await createSolidDpopProof({
			keyPair,
			method: "POST",
			url: TOKEN_ENDPOINT,
		});

		const verified = await verifyDpopProof({
			proofJwt: proof,
			method: "POST",
			url: TOKEN_ENDPOINT,
		});
		expect(verified.jkt).toBe(keyPair.jkt);
		expect(verified.htm).toBe("POST");
		expect(verified.htu).toBe(TOKEN_ENDPOINT);
		expect(decodeProtectedHeader(proof).typ).toBe(DPOP_PROOF_TYPE);
	});

	it("signs the proof with the configured algorithm", async () => {
		const keyPair = await generateSolidDpopKeyPair("RS256");
		const proof = await createSolidDpopProof({
			keyPair,
			method: "POST",
			url: TOKEN_ENDPOINT,
		});
		expect(decodeProtectedHeader(proof).alg).toBe("RS256");
		await expect(
			verifyDpopProof({ proofJwt: proof, method: "POST", url: TOKEN_ENDPOINT }),
		).resolves.toBeDefined();
	});

	it("normalizes htu by dropping the query string", async () => {
		const keyPair = await generateSolidDpopKeyPair();
		const proof = await createSolidDpopProof({
			keyPair,
			method: "get",
			url: "https://pod.example/alice/notes?page=2",
		});
		const payload = decodeJwt(proof);
		expect(payload.htu).toBe("https://pod.example/alice/notes");
		// The method is upper-cased so `htm` matches RFC 9449 comparison.
		expect(payload.htm).toBe("GET");
	});

	it("binds the proof to an access token through the ath claim", async () => {
		const keyPair = await generateSolidDpopKeyPair();
		const accessToken = "solid-access-token";
		const proof = await createSolidDpopProof({
			keyPair,
			method: "GET",
			url: "https://pod.example/alice/",
			accessToken,
		});
		expect(decodeJwt(proof).ath).toBe(await deriveDpopAth(accessToken));

		const verified = await verifyDpopProof({
			proofJwt: proof,
			method: "GET",
			url: "https://pod.example/alice/",
			accessToken,
			expectedJkt: keyPair.jkt,
			requireAth: true,
		});
		expect(verified.ath).toBeTypeOf("string");
	});

	it("omits ath when there is no access token yet", async () => {
		const keyPair = await generateSolidDpopKeyPair();
		const proof = await createSolidDpopProof({
			keyPair,
			method: "POST",
			url: TOKEN_ENDPOINT,
		});
		expect(decodeJwt(proof).ath).toBeUndefined();
	});

	it("echoes a server-supplied nonce", async () => {
		const keyPair = await generateSolidDpopKeyPair();
		const proof = await createSolidDpopProof({
			keyPair,
			method: "POST",
			url: TOKEN_ENDPOINT,
			nonce: "server-nonce",
		});
		expect(decodeJwt(proof).nonce).toBe("server-nonce");
	});

	it("mints a unique jti per proof so a proof is single-use", async () => {
		const keyPair = await generateSolidDpopKeyPair();
		const jtis = new Set<unknown>();
		for (let attempt = 0; attempt < 5; attempt++) {
			const proof = await createSolidDpopProof({
				keyPair,
				method: "POST",
				url: TOKEN_ENDPOINT,
			});
			jtis.add(decodeJwt(proof).jti);
		}
		expect(jtis.size).toBe(5);
	});

	it("is rejected when replayed against a different URL", async () => {
		const keyPair = await generateSolidDpopKeyPair();
		const proof = await createSolidDpopProof({
			keyPair,
			method: "POST",
			url: TOKEN_ENDPOINT,
		});
		await expect(
			verifyDpopProof({
				proofJwt: proof,
				method: "POST",
				url: "https://attacker.example/token",
			}),
		).rejects.toThrow(/htu does not match/);
	});

	it("is rejected when replayed with a different method", async () => {
		const keyPair = await generateSolidDpopKeyPair();
		const proof = await createSolidDpopProof({
			keyPair,
			method: "POST",
			url: TOKEN_ENDPOINT,
		});
		await expect(
			verifyDpopProof({
				proofJwt: proof,
				method: "GET",
				url: TOKEN_ENDPOINT,
			}),
		).rejects.toThrow(/htm does not match/);
	});

	it("refuses a target URL carrying a fragment", async () => {
		const keyPair = await generateSolidDpopKeyPair();
		await expect(
			createSolidDpopProof({
				keyPair,
				method: "POST",
				url: "https://op.example/token#fragment",
			}),
		).rejects.toThrow(/must not contain a fragment/);
	});
});
