import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { siwsClient } from "./client";
import { siws } from "./index";
import type { SIWSVerifyArgs } from "./types";

// A valid Solana base58 address (44 chars, base58 alphabet).
const walletAddress = "So11111111111111111111111111111111111111112";
const domain = "example.com";
const NONCE = "A1b2C3d4E5f6G7h8J";

// Encode a string as base64 without using Buffer (runtime-agnostic in tests).
const b64 = (s: string) => btoa(s);

// The mock verifier checks that the decoded signature bytes spell "valid_signature".
const mockOutput = {
	account: {
		address: walletAddress,
		publicKey: b64("a".repeat(32)), // 32 bytes for an Ed25519 public key
	},
	signature: b64("valid_signature"),
	signedMessage: b64("signed_message"),
};

const mockVerifySignIn = async ({
	output,
}: {
	input: unknown;
	output: { signature: Uint8Array };
}) => {
	const decoded = new TextDecoder().decode(output.signature);
	return decoded === "valid_signature";
};

describe("siws", async () => {
	it("should generate a valid nonce for a valid Solana address", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						async getNonce() {
							return NONCE;
						},
						verifySignIn: mockVerifySignIn,
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwsClient()],
				},
			},
		);

		const { data } = await client.siws.nonce({ address: walletAddress });
		expect(typeof data?.nonce).toBe("string");
		expect(data?.nonce).toBe(NONCE);
	});

	it("should reject invalid Solana address format on nonce", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						async getNonce() {
							return NONCE;
						},
						verifySignIn: mockVerifySignIn,
					}),
				],
			},
			{
				clientOptions: { plugins: [siwsClient()] },
			},
		);

		const { error } = await client.siws.nonce({
			address: "0xdeadbeef", // Ethereum address — invalid for Solana
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(400);
	});

	it("should reject verification if nonce was never issued", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						async getNonce() {
							return NONCE;
						},
						verifySignIn: mockVerifySignIn,
					}),
				],
			},
			{
				clientOptions: { plugins: [siwsClient()] },
			},
		);

		const { error } = await client.siws.verify({
			address: walletAddress,
			input: { domain, address: walletAddress, nonce: NONCE },
			output: mockOutput,
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
		expect(error?.code).toBe("UNAUTHORIZED_INVALID_OR_EXPIRED_NONCE");
	});

	it("should provide wallet-standard-compatible output fields to verifySignIn", async () => {
		let receivedOutput: SIWSVerifyArgs["output"] | undefined;

		const { client } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						async getNonce() {
							return NONCE;
						},
						async verifySignIn({ output }) {
							receivedOutput = output;
							return true;
						},
					}),
				],
			},
			{
				clientOptions: { plugins: [siwsClient()] },
			},
		);

		await client.siws.nonce({ address: walletAddress });

		const { data, error } = await client.siws.verify({
			address: walletAddress,
			input: { domain, address: walletAddress, nonce: NONCE },
			output: mockOutput,
		});

		expect(error).toBeNull();
		expect(data?.success).toBe(true);
		expect(receivedOutput?.account.chains).toEqual([]);
		expect(receivedOutput?.account.features).toEqual([]);
		expect(receivedOutput?.signatureType).toBe("ed25519");
	});

	it("should reject verification when input has no nonce", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						async getNonce() {
							return NONCE;
						},
						verifySignIn: mockVerifySignIn,
					}),
				],
			},
			{
				clientOptions: { plugins: [siwsClient()] },
			},
		);

		await client.siws.nonce({ address: walletAddress });

		const { error } = await client.siws.verify({
			address: walletAddress,
			input: { domain }, // missing nonce
			output: mockOutput,
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
		expect(error?.code).toBe("UNAUTHORIZED_SIWS_NONCE_MISMATCH");
	});

	it("should reject verification when input nonce does not match", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						async getNonce() {
							return NONCE;
						},
						verifySignIn: mockVerifySignIn,
					}),
				],
			},
			{
				clientOptions: { plugins: [siwsClient()] },
			},
		);

		await client.siws.nonce({ address: walletAddress });

		const { error } = await client.siws.verify({
			address: walletAddress,
			input: { domain, address: walletAddress, nonce: "wrong-nonce" },
			output: mockOutput,
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
		expect(error?.code).toBe("UNAUTHORIZED_SIWS_NONCE_MISMATCH");
	});

	it("should reject verification when input domain does not match", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						async getNonce() {
							return NONCE;
						},
						verifySignIn: mockVerifySignIn,
					}),
				],
			},
			{
				clientOptions: { plugins: [siwsClient()] },
			},
		);

		await client.siws.nonce({ address: walletAddress });

		const { error } = await client.siws.verify({
			address: walletAddress,
			input: { domain: "evil.com", address: walletAddress, nonce: NONCE },
			output: mockOutput,
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
		expect(error?.code).toBe("UNAUTHORIZED_SIWS_DOMAIN_MISMATCH");
	});

	it("should reject verification when input address does not match", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						async getNonce() {
							return NONCE;
						},
						verifySignIn: mockVerifySignIn,
					}),
				],
			},
			{
				clientOptions: { plugins: [siwsClient()] },
			},
		);

		await client.siws.nonce({ address: walletAddress });

		const { error } = await client.siws.verify({
			address: walletAddress,
			input: {
				domain,
				address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // different address
				nonce: NONCE,
			},
			output: mockOutput,
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
		expect(error?.code).toBe("UNAUTHORIZED_SIWS_ADDRESS_MISMATCH");
	});

	it("should reject verification with an expired input", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						async getNonce() {
							return NONCE;
						},
						verifySignIn: mockVerifySignIn,
					}),
				],
			},
			{
				clientOptions: { plugins: [siwsClient()] },
			},
		);

		await client.siws.nonce({ address: walletAddress });

		const { error } = await client.siws.verify({
			address: walletAddress,
			input: {
				domain,
				address: walletAddress,
				nonce: NONCE,
				expirationTime: "2020-01-01T00:00:00.000Z",
			},
			output: mockOutput,
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
		expect(error?.code).toBe("UNAUTHORIZED_SIWS_INPUT_EXPIRED");
	});

	it("should reject verification with invalid signature", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						async getNonce() {
							return NONCE;
						},
						verifySignIn: mockVerifySignIn,
					}),
				],
			},
			{
				clientOptions: { plugins: [siwsClient()] },
			},
		);

		await client.siws.nonce({ address: walletAddress });

		const { error } = await client.siws.verify({
			address: walletAddress,
			input: { domain, address: walletAddress, nonce: NONCE },
			output: { ...mockOutput, signature: b64("bad_signature") },
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
	});

	it("should successfully sign in and create a session", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						async getNonce() {
							return NONCE;
						},
						verifySignIn: mockVerifySignIn,
					}),
				],
			},
			{
				clientOptions: { plugins: [siwsClient()] },
			},
		);

		await client.siws.nonce({ address: walletAddress });

		const { data, error } = await client.siws.verify({
			address: walletAddress,
			input: { domain, address: walletAddress, nonce: NONCE },
			output: mockOutput,
		});

		expect(error).toBeNull();
		expect(data?.success).toBe(true);
		expect((data?.user as any)?.address).toBe(walletAddress);
	});

	it("should return same user on second sign-in with same address", async () => {
		const { client, auth } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						async getNonce() {
							return NONCE;
						},
						verifySignIn: mockVerifySignIn,
					}),
				],
			},
			{
				clientOptions: { plugins: [siwsClient()] },
			},
		);

		// First sign-in
		await client.siws.nonce({ address: walletAddress });
		const first = await client.siws.verify({
			address: walletAddress,
			input: { domain, address: walletAddress, nonce: NONCE },
			output: mockOutput,
		});
		expect(first.error).toBeNull();

		// Second sign-in
		await client.siws.nonce({ address: walletAddress });
		const second = await client.siws.verify({
			address: walletAddress,
			input: { domain, address: walletAddress, nonce: NONCE },
			output: mockOutput,
		});
		expect(second.error).toBeNull();
		expect(second.data?.user.id).toBe(first.data?.user.id);

		// Only one solanaWalletAddress row
		const ctx = await auth.$context;
		const wallets = await ctx.adapter.findMany({
			model: "solanaWalletAddress",
			where: [{ field: "address", operator: "eq", value: walletAddress }],
		});
		expect(wallets).toHaveLength(1);
	});

	it("should not allow nonce reuse", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						async getNonce() {
							return NONCE;
						},
						verifySignIn: mockVerifySignIn,
					}),
				],
			},
			{
				clientOptions: { plugins: [siwsClient()] },
			},
		);

		await client.siws.nonce({ address: walletAddress });

		const first = await client.siws.verify({
			address: walletAddress,
			input: { domain, address: walletAddress, nonce: NONCE },
			output: mockOutput,
		});
		expect(first.error).toBeNull();

		// Replay the same verify — nonce already consumed
		const second = await client.siws.verify({
			address: walletAddress,
			input: { domain, address: walletAddress, nonce: NONCE },
			output: mockOutput,
		});
		expect(second.error?.status).toBe(401);
		expect(second.error?.code).toBe("UNAUTHORIZED_INVALID_OR_EXPIRED_NONCE");
	});

	// First concurrent request wins; racer must not create a second session.
	it("should mint exactly one session when the same nonce is verified concurrently", async () => {
		const { client, auth } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						async getNonce() {
							return NONCE;
						},
						async verifySignIn({ output }) {
							await new Promise((r) => setTimeout(r, 50));
							const decoded = new TextDecoder().decode(output.signature);
							return decoded === "valid_signature";
						},
					}),
				],
			},
			{ clientOptions: { plugins: [siwsClient()] } },
		);

		await client.siws.nonce({ address: walletAddress });

		const ctx = await auth.$context;
		const sessionsBefore = await ctx.adapter.findMany({ model: "session" });

		const verify = () =>
			client.siws.verify({
				address: walletAddress,
				input: { domain, address: walletAddress, nonce: NONCE },
				output: mockOutput,
			});

		const [first, second] = await Promise.all([verify(), verify()]);

		const successes = [first, second].filter((r) => r.data?.success === true);
		const failures = [first, second].filter((r) => r.error != null);
		expect(successes).toHaveLength(1);
		expect(failures).toHaveLength(1);
		expect(failures[0]?.error?.status).toBe(401);

		const sessionsAfter = await ctx.adapter.findMany({ model: "session" });
		expect(sessionsAfter).toHaveLength(sessionsBefore.length + 1);
	});

	it("should reject an expired nonce and consume the row", async () => {
		const { client, auth } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						async getNonce() {
							return NONCE;
						},
						verifySignIn: mockVerifySignIn,
					}),
				],
			},
			{ clientOptions: { plugins: [siwsClient()] } },
		);

		const ctx = await auth.$context;
		const identifier = `siws:${walletAddress}`;
		await ctx.internalAdapter.createVerificationValue({
			identifier,
			value: NONCE,
			expiresAt: new Date(Date.now() - 1000), // already expired
		});

		const { error } = await client.siws.verify({
			address: walletAddress,
			input: { domain, address: walletAddress, nonce: NONCE },
			output: mockOutput,
		});
		expect(error?.status).toBe(401);
		expect(error?.code).toBe("UNAUTHORIZED_INVALID_OR_EXPIRED_NONCE");

		// Row should be gone — cannot replay.
		const remaining =
			await ctx.internalAdapter.findVerificationValue(identifier);
		expect(remaining).toBeNull();
	});

	it("should reject verification without email when anonymous is false", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						anonymous: false,
						async getNonce() {
							return NONCE;
						},
						verifySignIn: mockVerifySignIn,
					}),
				],
			},
			{ clientOptions: { plugins: [siwsClient()] } },
		);

		await client.siws.nonce({ address: walletAddress });

		const { error } = await client.siws.verify({
			address: walletAddress,
			input: { domain, address: walletAddress, nonce: NONCE },
			output: mockOutput,
		});
		expect(error?.status).toBe(400);
		expect(error?.message).toMatch(/email is required/i);
	});

	it("should accept verification with email when anonymous is false", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						anonymous: false,
						async getNonce() {
							return NONCE;
						},
						verifySignIn: mockVerifySignIn,
					}),
				],
			},
			{ clientOptions: { plugins: [siwsClient()] } },
		);

		await client.siws.nonce({ address: walletAddress });

		const { data, error } = await client.siws.verify({
			address: walletAddress,
			input: { domain, address: walletAddress, nonce: NONCE },
			output: mockOutput,
			email: "user@example.com",
		});
		expect(error).toBeNull();
		expect(data?.success).toBe(true);
	});

	it("should not bind a caller-supplied email that already belongs to another account", async () => {
		const { client, testUser, sessionSetter } = await getTestInstance(
			{
				plugins: [
					siws({
						domain,
						anonymous: false,
						async getNonce() {
							return NONCE;
						},
						verifySignIn: mockVerifySignIn,
					}),
				],
			},
			{ clientOptions: { plugins: [siwsClient()] } },
		);

		const headers = new Headers();
		await client.siws.nonce({ address: walletAddress });

		const { data, error } = await client.siws.verify({
			address: walletAddress,
			input: { domain, address: walletAddress, nonce: NONCE },
			output: mockOutput,
			email: testUser.email,
			fetchOptions: { onSuccess: sessionSetter(headers) },
		});

		// Sign-in succeeds — no enumeration oracle.
		expect(error).toBeNull();
		expect(data?.success).toBe(true);

		// The wallet account keeps its wallet-derived email, not the existing user's.
		const session = await client.getSession({ fetchOptions: { headers } });
		expect((session.data?.user as any)?.email).not.toBe(testUser.email);
	});
});
