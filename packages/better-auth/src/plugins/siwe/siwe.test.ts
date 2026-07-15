import type { BetterAuthOptions } from "@better-auth/core";
import type {
	AtomicWriteResult,
	DBAdapter,
} from "@better-auth/core/db/adapter";
import type { MemoryDB } from "@better-auth/memory-adapter";
import { memoryAdapter } from "@better-auth/memory-adapter";
import { assert, describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { siweClient } from "./client";
import { siwe } from "./index";
import type { WalletAddress } from "./types";

/** Exercise the declarative batch branch while keeping copy-on-write atomicity. */
function useBatchOnlyAtomicWrites<Options extends BetterAuthOptions>(
	adapter: DBAdapter<Options>,
): void {
	const adapterConfig = adapter.options?.adapterConfig;
	const nativeTransaction = adapterConfig?.transaction;
	if (!adapterConfig || typeof nativeTransaction !== "function") {
		throw new Error("The workflow adapter should expose a native transaction");
	}
	adapter.commitAtomicWrites = async (operations) =>
		nativeTransaction(async (transactionAdapter) => {
			const results: AtomicWriteResult[] = [];
			for (const operation of operations) {
				switch (operation.type) {
					case "create": {
						const record = await transactionAdapter.create({
							model: operation.model,
							data: operation.data,
							forceAllowId: operation.forceAllowId,
						});
						results.push({ type: "create", record });
						break;
					}
					case "update": {
						const record = await transactionAdapter.update<
							Record<string, unknown>
						>({
							model: operation.model,
							where: operation.where,
							update: operation.update,
						});
						results.push({ type: "update", record });
						break;
					}
					case "delete": {
						const record = await transactionAdapter.consumeOne<
							Record<string, unknown>
						>({
							model: operation.model,
							where: operation.where,
						});
						results.push({ type: "delete", deletedCount: record ? 1 : 0 });
						break;
					}
					case "deleteMany": {
						const deletedCount = await transactionAdapter.deleteMany({
							model: operation.model,
							where: operation.where,
						});
						results.push({ type: "deleteMany", deletedCount });
						break;
					}
				}
			}
			return results;
		});
	adapterConfig.transaction = false;
}

describe("siwe", async () => {
	const walletAddress = "0x000000000000000000000000000000000000dEaD";
	const domain = "example.com";
	const chainId = 1; // Ethereum mainnet
	const NONCE = "A1b2C3d4E5f6G7h8J";

	// Builds a valid ERC-4361 message bound to the server-issued nonce. The
	// plugin now parses and validates this message, so tests must sign a real
	// SIWE message rather than an arbitrary string.
	const siweMessage = (opts?: {
		domain?: string;
		address?: string;
		chainId?: number;
		nonce?: string;
		expirationTime?: string;
		notBefore?: string;
	}) => {
		const d = opts?.domain ?? domain;
		const a = opts?.address ?? walletAddress;
		const c = opts?.chainId ?? chainId;
		const n = opts?.nonce ?? NONCE;
		let msg =
			`${d} wants you to sign in with your Ethereum account:\n` +
			`${a}\n\n` +
			`Sign in.\n\n` +
			`URI: https://${d}\n` +
			`Version: 1\n` +
			`Chain ID: ${c}\n` +
			`Nonce: ${n}\n` +
			`Issued At: 2024-01-01T00:00:00.000Z`;
		if (opts?.expirationTime)
			msg += `\nExpiration Time: ${opts.expirationTime}`;
		if (opts?.notBefore) msg += `\nNot Before: ${opts.notBefore}`;
		return msg;
	};

	it("should generate a valid nonce for a valid public key", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);
		const { data } = await client.siwe.nonce({ walletAddress, chainId });
		// to be of type string
		expect(typeof data?.nonce).toBe("string");
		// to be 17 alphanumeric characters (96 bits of entropy)
		expect(data?.nonce).toMatch(/^[a-zA-Z0-9]{17}$/);
	});

	it("should generate a valid nonce with default chainId", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);
		// Test without chainId (should default to 1)
		const { data } = await client.siwe.nonce({ walletAddress });
		expect(typeof data?.nonce).toBe("string");
		expect(data?.nonce).toMatch(/^[a-zA-Z0-9]{17}$/);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8631
	 */
	it("should support getNonce alias with address input", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);

		const { data, error } = await client.siwe.getNonce({
			address: walletAddress,
			chainId,
		});

		expect(error).toBeNull();
		expect(data?.nonce).toBe("A1b2C3d4E5f6G7h8J");
	});

	it("should reject verification if nonce is missing", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);
		const { error } = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress,
			chainId,
		});

		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
		expect(error?.code).toBe("UNAUTHORIZED_INVALID_OR_EXPIRED_NONCE");
		expect(error?.message).toMatch(/nonce/i);
	});

	it("should reject invalid public key", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);
		const { error } = await client.siwe.nonce({ walletAddress: "invalid" });
		expect(error).toBeDefined();
		expect(error?.status).toBe(400);
		expect(error?.message).toBe(
			"[body.walletAddress] Invalid string: must match pattern /^0[xX][a-fA-F0-9]{40}$/i; [body.walletAddress] Too small: expected string to have >=42 characters",
		);
	});

	it("should reject verification with invalid signature", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);
		const { error } = await client.siwe.verify({
			message: "Sign in with Ethereum.",
			signature: "invalid_signature",
			walletAddress,
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
	});

	it("should reject invalid walletAddress format", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);
		const { error } = await client.siwe.nonce({
			walletAddress: "not_a_valid_key",
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(400);
	});

	it("should reject invalid message", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);
		const { error } = await client.siwe.verify({
			message: "invalid_message",
			signature: "valid_signature",
			walletAddress,
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
	});

	it("should reject verification without email when anonymous is false", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						anonymous: false,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);

		const { error } = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress,
			email: undefined,
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(400);
		expect(error?.message).toBe(
			"[body.email] Email is required when the anonymous plugin option is disabled.",
		);
	});

	it("should accept verification with email when anonymous is false", async () => {
		const { auth, client } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						anonymous: false,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);
		const context = await auth.$context;

		await client.siwe.nonce({ walletAddress, chainId });

		const { data, error } = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress,
			chainId,
			email: "user@example.com",
		});
		expect(error).toBeNull();
		expect(data?.success).toBe(true);
		assert(data, "SIWE verification should return a user");
		const accounts = await context.internalAdapter.listUserAccounts(
			data.user.id,
		);
		const siweAccount = accounts.find(
			({ account }) => account.providerId === "siwe",
		)?.account;
		assert(siweAccount, "SIWE verification should create an account");
		expect(accounts).toContainEqual(
			expect.objectContaining({
				account: expect.objectContaining({
					providerId: "siwe",
				}),
				identity: expect.objectContaining({
					userId: data.user.id,
					issuer: "local:siwe",
					providerAccountId: `${walletAddress}:${chainId}`,
				}),
			}),
		);
		await expect(
			context.adapter.findOne<WalletAddress>({
				model: "walletAddress",
				where: [
					{ field: "accountId", value: siweAccount.id },
					{ field: "address", value: walletAddress },
					{ field: "chainId", value: chainId },
				],
			}),
		).resolves.toMatchObject({
			accountId: siweAccount.id,
			address: walletAddress,
			chainId,
			isPrimary: true,
		});
	});

	it.each([
		new Error(
			"reserveVerificationValue requires database-backed verification storage. Set verification.storeInDatabase to true for flows that reserve verification values.",
		),
		new Error("reservation adapter unavailable"),
	])("should keep wallet email fallback when email reservation fails with %s", async (reservationError) => {
		const { client, auth, sessionSetter } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						anonymous: false,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);
		const context = await auth.$context;
		const reserveVerificationValue =
			context.internalAdapter.reserveVerificationValue;
		context.internalAdapter.reserveVerificationValue = async () => {
			throw reservationError;
		};
		const headers = new Headers();

		try {
			await client.siwe.nonce({ walletAddress, chainId });
			const { data, error } = await client.siwe.verify({
				message: siweMessage(),
				signature: "valid_signature",
				walletAddress,
				chainId,
				email: "user@example.com",
				fetchOptions: { onSuccess: sessionSetter(headers) },
			});

			expect(error).toBeNull();
			expect(data?.success).toBe(true);

			const session = await client.getSession({ fetchOptions: { headers } });
			expect(session.data?.user.email).not.toBe("user@example.com");
			expect(session.data?.user.email).toBe(
				`${walletAddress.toLowerCase()}@http://localhost:3000`,
			);
		} finally {
			context.internalAdapter.reserveVerificationValue =
				reserveVerificationValue;
		}
	});

	it("should reject new SIWE user when validateUserInfo returns error", async () => {
		const { client } = await getTestInstance(
			{
				user: {
					validateUserInfo({ source }) {
						expect(source.method).toBe("siwe");
						return {
							error: "siwe_blocked",
							errorDescription: "SIWE sign-up is not allowed",
						};
					},
				},
				plugins: [
					siwe({
						domain,
						anonymous: false,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
				disableTestUser: true,
			},
		);
		await client.siwe.nonce({ walletAddress, chainId });
		const { error } = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress,
			chainId,
			email: "siwe@example.com",
		});

		expect(error?.code).toBe("siwe_blocked");
		expect(error?.message).toBe("SIWE sign-up is not allowed");
	});

	it("should not bind a caller-supplied email that already belongs to another account", async () => {
		const { client, testUser, db, sessionSetter } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						anonymous: false,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);

		const headers = new Headers();
		await client.siwe.nonce({ walletAddress, chainId });

		const { data, error } = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress,
			chainId,
			email: testUser.email,
			fetchOptions: { onSuccess: sessionSetter(headers) },
		});

		// Sign-in succeeds with no distinct error, so the response does not reveal
		// whether the email is already registered.
		expect(error).toBeNull();
		expect(data?.success).toBe(true);

		// The wallet account does not adopt the existing email; it keeps the
		// wallet-derived address, and the email stays on one account.
		const session = await client.getSession({ fetchOptions: { headers } });
		expect(session.data?.user.email).not.toBe(testUser.email);
		const usersWithEmail = await db.findMany({
			model: "user",
			where: [{ field: "email", value: testUser.email }],
		});
		expect(usersWithEmail).toHaveLength(1);
	});

	it("should treat a case-variant of an existing email as the same email", async () => {
		const otherWallet = "0x000000000000000000000000000000000000bEEF";
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						anonymous: false,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);

		// First wallet claims a mixed-case email; it is stored normalized.
		const firstHeaders = new Headers();
		await client.siwe.nonce({ walletAddress, chainId });
		const first = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress,
			chainId,
			email: "Mixed@Case.com",
			fetchOptions: { onSuccess: sessionSetter(firstHeaders) },
		});
		expect(first.error).toBeNull();
		const firstSession = await client.getSession({
			fetchOptions: { headers: firstHeaders },
		});
		expect(firstSession.data?.user.email).toBe("mixed@case.com");

		// A different wallet presenting the lowercase variant must not claim it.
		const secondHeaders = new Headers();
		await client.siwe.nonce({ walletAddress: otherWallet, chainId });
		const second = await client.siwe.verify({
			message: siweMessage({ address: otherWallet }),
			signature: "valid_signature",
			walletAddress: otherWallet,
			chainId,
			email: "mixed@case.com",
			fetchOptions: { onSuccess: sessionSetter(secondHeaders) },
		});
		expect(second.error).toBeNull();
		const secondSession = await client.getSession({
			fetchOptions: { headers: secondHeaders },
		});
		expect(secondSession.data?.user.email).not.toBe("mixed@case.com");
	});

	it("should reject invalid email format when anonymous is false", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						anonymous: false,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);

		const { error } = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress,
			email: "not-an-email",
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(400);
		expect(error?.message).toBe("[body.email] Invalid email address");
	});

	it("should allow verification without email when anonymous is true", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						// anonymous: true by default
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);

		await client.siwe.nonce({ walletAddress, chainId });
		const { data, error } = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress,
			chainId,
		});
		expect(error).toBeNull();
		expect(data?.success).toBe(true);
	});

	// The nonce is single-use. Two requests presenting the same valid nonce at
	// the same time must collapse to exactly one authenticated session: the
	// first request to consume the row wins, the racer sees the row already
	// gone. Without an atomic consume, both reads observe the row before either
	// delete lands and both mint a session, replaying a single-use login.
	it("should mint exactly one session when the same nonce is verified concurrently", async () => {
		const { client, auth } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return NONCE;
						},
						async verifyMessage({ signature }) {
							// Stall inside signature verification to widen the window
							// between the two requests. With a non-atomic nonce read both
							// requests would already have passed the nonce check and would
							// both mint a session; the atomic consume rejects the racer
							// before it ever reaches this point.
							await new Promise((resolve) => setTimeout(resolve, 50));
							return signature === "valid_signature";
						},
					}),
				],
			},
			{ clientOptions: { plugins: [siweClient()] } },
		);

		await client.siwe.nonce({ walletAddress, chainId });

		const ctx = await auth.$context;
		const sessionsBefore = await ctx.adapter.findMany({ model: "session" });

		const verifyOnce = () =>
			client.siwe.verify({
				message: siweMessage(),
				signature: "valid_signature",
				walletAddress,
				chainId,
			});

		const [first, second] = await Promise.all([verifyOnce(), verifyOnce()]);

		const successes = [first, second].filter((r) => r.data?.success === true);
		const failures = [first, second].filter((r) => r.error != null);
		expect(successes.length).toBe(1);
		expect(failures.length).toBe(1);
		expect(failures[0]?.error?.status).toBe(401);

		// Exactly one wallet record and one new session for the SIWE login.
		const wallets = await ctx.adapter.findMany({
			model: "walletAddress",
			where: [{ field: "address", operator: "eq", value: walletAddress }],
		});
		expect(wallets.length).toBe(1);
		const sessionsAfter = await ctx.adapter.findMany({ model: "session" });
		expect(sessionsAfter.length).toBe(sessionsBefore.length + 1);
	});

	// An expired nonce must be rejected even before any signature work, and the
	// expired row must still be burned so it can never be replayed later.
	it("should reject an expired nonce and consume the row", async () => {
		const { client, auth } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return NONCE;
						},
						async verifyMessage({ signature }) {
							return signature === "valid_signature";
						},
					}),
				],
			},
			{ clientOptions: { plugins: [siweClient()] } },
		);

		const ctx = await auth.$context;
		const identifier = `siwe:${walletAddress}:${chainId}`;
		await ctx.internalAdapter.createVerificationValue({
			identifier,
			value: NONCE,
			expiresAt: new Date(Date.now() - 1000),
		});

		const { error } = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress,
			chainId,
		});
		expect(error?.status).toBe(401);
		expect(error?.code).toBe("UNAUTHORIZED_INVALID_OR_EXPIRED_NONCE");

		// The expired row is gone, so a retry cannot replay it.
		const remaining =
			await ctx.internalAdapter.findVerificationValue(identifier);
		expect(remaining).toBeNull();
	});

	it("should not allow nonce reuse", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: { plugins: [siweClient()] },
			},
		);

		await client.siwe.nonce({ walletAddress, chainId });
		const first = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress,
			chainId,
		});
		expect(first.error).toBeNull();
		expect(first.data?.success).toBe(true);

		// Try to verify again with the same nonce
		const second = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress,
			chainId,
		});
		expect(second.error).toBeDefined();
		expect(second.error?.status).toBe(401);
		expect(second.error?.code).toBe("UNAUTHORIZED_INVALID_OR_EXPIRED_NONCE");
	});

	it("should reject empty string email when anonymous is false", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						anonymous: false,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: { plugins: [siweClient()] },
			},
		);

		await client.siwe.nonce({ walletAddress, chainId });
		const { error } = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress,
			chainId,
			email: "",
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(400);
		expect(error?.message).toBe(
			"[body.email] Invalid email address; [body.email] Email is required when the anonymous plugin option is disabled.",
		);
	});

	it("should store and return the wallet address in checksum format", async () => {
		const { client, auth } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: { plugins: [siweClient()] },
			},
		);

		// Use lowercase address
		await client.siwe.nonce({
			walletAddress: walletAddress.toLowerCase(),
			chainId,
		});
		const { data } = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress: walletAddress.toLowerCase(),
			chainId,
		});
		expect(data?.success).toBe(true);

		// Fetch wallet address from the adapter
		const walletAddresses = await (
			await auth.$context
		).adapter.findMany<WalletAddress>({
			model: "walletAddress",
			where: [{ field: "address", operator: "eq", value: walletAddress }],
		});
		expect(walletAddresses.length).toBe(1);
		expect(walletAddresses[0]?.address).toBe(walletAddress); // checksummed

		// Try with uppercase address, should not create a new wallet address entry
		await client.siwe.nonce({
			walletAddress: walletAddress.toUpperCase(),
			chainId,
		});
		const { data: data2 } = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress: walletAddress.toUpperCase(),
			chainId,
		});
		expect(data2?.success).toBe(true); // Should succeed with existing address

		const walletAddressesAfter = await (await auth.$context).adapter.findMany({
			model: "walletAddress",
			where: [{ field: "address", operator: "eq", value: walletAddress }],
		});
		expect(walletAddressesAfter.length).toBe(1); // Still only one wallet address entry
	});

	it("should reject duplicate wallet address entries", async () => {
		const { client, auth } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
					}),
				],
			},
			{ clientOptions: { plugins: [siweClient()] } },
		);

		const testAddress = "0x000000000000000000000000000000000000dEaD";
		const testChainId = 1;

		// First user successfully creates account with wallet address
		await client.siwe.nonce({
			walletAddress: testAddress,
			chainId: testChainId,
		});
		const firstUser = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress: testAddress,
			chainId: testChainId,
		});
		expect(firstUser.error).toBeNull();
		expect(firstUser.data?.success).toBe(true);

		// Verify wallet address record was created
		const walletAddresses = await (
			await auth.$context
		).adapter.findMany<WalletAddress>({
			model: "walletAddress",
			where: [
				{ field: "address", operator: "eq", value: testAddress },
				{ field: "chainId", operator: "eq", value: testChainId },
			],
		});
		expect(walletAddresses.length).toBe(1);
		expect(walletAddresses[0]?.address).toBe(testAddress);
		expect(walletAddresses[0]?.chainId).toBe(testChainId);
		expect(walletAddresses[0]?.isPrimary).toBe(true);

		// Second attempt with same address + chainId should use existing user
		await client.siwe.nonce({
			walletAddress: testAddress,
			chainId: testChainId,
		});
		const secondUser = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress: testAddress,
			chainId: testChainId,
		});
		expect(secondUser.error).toBeNull();
		expect(secondUser.data?.success).toBe(true);
		expect(secondUser.data?.user.id).toBe(firstUser.data?.user.id); // Same user ID

		// Verify no duplicate wallet address records were created
		const walletAddressesAfter = await (
			await auth.$context
		).adapter.findMany<WalletAddress>({
			model: "walletAddress",
			where: [
				{ field: "address", operator: "eq", value: testAddress },
				{ field: "chainId", operator: "eq", value: testChainId },
			],
		});
		expect(walletAddressesAfter.length).toBe(1); // Still only one record
	});

	it("isolates custom schema mappings between plugin instances", () => {
		const pluginOptions = {
			domain,
			async getNonce() {
				return NONCE;
			},
			async verifyMessage() {
				return true;
			},
		};
		const customPlugin = siwe({
			...pluginOptions,
			schema: {
				walletAddress: {
					modelName: "wallet_address",
					fields: { accountId: "account_id" },
				},
			},
		});
		const defaultPlugin = siwe(pluginOptions);

		expect(customPlugin.schema.walletAddress).toMatchObject({
			modelName: "wallet_address",
		});
		expect(customPlugin.schema.walletAddress.fields.accountId).toMatchObject({
			fieldName: "account_id",
		});
		expect(defaultPlugin.schema.walletAddress).not.toHaveProperty("modelName");
		expect(
			defaultPlugin.schema.walletAddress.fields.accountId,
		).not.toHaveProperty("fieldName");
	});

	it("should support custom schema with mergeSchema", async () => {
		const { client, auth } = await getTestInstance(
			{
				logger: {
					level: "debug",
				},
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
						schema: {
							walletAddress: {
								modelName: "wallet_address",
								fields: {
									accountId: "account_id",
									address: "wallet_address",
									chainId: "chain_id",
									isPrimary: "is_primary",
									createdAt: "created_at",
								},
							},
						},
					}),
				],
			},
			{ clientOptions: { plugins: [siweClient()] } },
		);

		const testAddress = "0x000000000000000000000000000000000000dEaD";
		const testChainId = 1;

		// Create account with custom schema
		await client.siwe.nonce({
			walletAddress: testAddress,
			chainId: testChainId,
		});
		const result = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress: testAddress,
			chainId: testChainId,
		});
		expect(result.error).toBeNull();
		expect(result.data?.success).toBe(true);
		const context = await auth.$context;

		const walletAddresses = await context.adapter.findMany<WalletAddress>({
			model: "walletAddress",
			where: [
				{ field: "address", operator: "eq", value: testAddress },
				{ field: "chainId", operator: "eq", value: testChainId },
			],
		});
		expect(walletAddresses.length).toBe(1);
		expect(walletAddresses[0]?.address).toBe(testAddress);
		expect(walletAddresses[0]?.chainId).toBe(testChainId);
		expect(walletAddresses[0]?.isPrimary).toBe(true);
		expect(walletAddresses[0]?.accountId).toBeDefined();
		expect(walletAddresses[0]?.createdAt).toBeDefined();
	});

	it("should allow same address on different chains for same user", async () => {
		const { client, auth } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							// Mirrors the documented viem pattern: signature recovery only.
							return signature === "valid_signature";
						},
					}),
				],
			},
			{ clientOptions: { plugins: [siweClient()] } },
		);

		const testAddress = "0x000000000000000000000000000000000000dEaD";
		const chainId1 = 1; // Ethereum
		const chainId2 = 137; // Polygon

		// First authentication on Ethereum
		await client.siwe.nonce({ walletAddress: testAddress, chainId: chainId1 });
		const ethereumAuth = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress: testAddress,
			chainId: chainId1,
		});
		expect(ethereumAuth.error).toBeNull();
		expect(ethereumAuth.data?.success).toBe(true);

		// Second authentication on Polygon with same address
		await client.siwe.nonce({ walletAddress: testAddress, chainId: chainId2 });
		const polygonAuth = await client.siwe.verify({
			message: siweMessage({ chainId: chainId2 }),
			signature: "valid_signature",
			walletAddress: testAddress,
			chainId: chainId2,
		});
		expect(polygonAuth.error).toBeNull();
		expect(polygonAuth.data?.success).toBe(true);
		expect(polygonAuth.data?.user.id).toBe(ethereumAuth.data?.user.id); // Same user

		// Verify both wallet address records exist
		const allWalletAddresses = await (
			await auth.$context
		).adapter.findMany<WalletAddress>({
			model: "walletAddress",
			where: [{ field: "address", operator: "eq", value: testAddress }],
		});
		expect(allWalletAddresses.length).toBe(2);

		const ethereumRecord = allWalletAddresses.find(
			(wa) => wa.chainId === chainId1,
		);
		const polygonRecord = allWalletAddresses.find(
			(wa) => wa.chainId === chainId2,
		);

		expect(ethereumRecord).toBeDefined();
		expect(polygonRecord).toBeDefined();
		expect(ethereumRecord?.isPrimary).toBe(true); // First address is primary
		expect(polygonRecord?.isPrimary).toBe(false); // Second address is not primary
		expect(ethereumRecord?.accountId).not.toBe(polygonRecord?.accountId);
	});

	it("should roll back a secondary wallet when its account link is rejected", async () => {
		let accountCreateAttempt = 0;
		const { client, auth } = await getTestInstance(
			{
				databaseHooks: {
					account: {
						create: {
							before: async (account) => {
								if (account.providerId !== "siwe") return;
								accountCreateAttempt += 1;
								if (accountCreateAttempt === 2) return false;
							},
						},
					},
				},
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return NONCE;
						},
						async verifyMessage({ signature }) {
							return signature === "valid_signature";
						},
					}),
				],
			},
			{ clientOptions: { plugins: [siweClient()] } },
		);

		await client.siwe.nonce({ walletAddress, chainId });
		const firstAuthentication = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress,
			chainId,
		});
		expect(firstAuthentication.error).toBeNull();

		const secondChainId = 137;
		await client.siwe.nonce({ walletAddress, chainId: secondChainId });
		const rejectedAuthentication = await client.siwe.verify({
			message: siweMessage({ chainId: secondChainId }),
			signature: "valid_signature",
			walletAddress,
			chainId: secondChainId,
		});
		expect(rejectedAuthentication.error).not.toBeNull();

		const context = await auth.$context;
		const walletAddresses = await context.adapter.findMany<{
			address: string;
			chainId: number;
		}>({
			model: "walletAddress",
			where: [{ field: "address", operator: "eq", value: walletAddress }],
		});
		expect(walletAddresses.map(({ chainId }) => chainId)).toEqual([chainId]);
	});

	it("should remove wallet authority when its SIWE account is unlinked", async () => {
		const { client, auth, sessionSetter } = await getTestInstance(
			{
				account: { accountLinking: { allowUnlinkingAll: true } },
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return NONCE;
						},
						async verifyMessage({ signature }) {
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: { plugins: [siweClient()] },
				disableTestUser: true,
			},
		);
		const sessionHeaders = new Headers();
		await client.siwe.nonce({ walletAddress, chainId });
		const firstAuthentication = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress,
			chainId,
			fetchOptions: { onSuccess: sessionSetter(sessionHeaders) },
		});
		expect(firstAuthentication.error).toBeNull();
		assert(firstAuthentication.data, "SIWE verification should return a user");

		const context = await auth.$context;
		const accounts = await context.internalAdapter.listUserAccounts(
			firstAuthentication.data.user.id,
		);
		const siweAccount = accounts.find(
			({ account }) => account.providerId === "siwe",
		)?.account;
		assert(siweAccount, "SIWE verification should create an account");
		const usersBeforeUnlink = await context.adapter.findMany({ model: "user" });

		const unlinkResult = await client.unlinkAccount({
			accountId: siweAccount.id,
			fetchOptions: { headers: sessionHeaders },
		});
		expect(unlinkResult.data?.status).toBe(true);
		await expect(
			context.adapter.findOne({
				model: "walletAddress",
				where: [
					{ field: "address", value: walletAddress },
					{ field: "chainId", value: chainId },
				],
			}),
		).resolves.toBeNull();

		await client.siwe.nonce({ walletAddress, chainId });
		const authenticationAfterUnlink = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress,
			chainId,
		});
		expect(authenticationAfterUnlink.error?.code).toBe(
			"UNAUTHORIZED_WALLET_NOT_LINKED",
		);
		await expect(
			context.adapter.findMany({ model: "user" }),
		).resolves.toHaveLength(usersBeforeUnlink.length);
	});

	it("should unlink and relink a wallet when the adapter does not cascade foreign keys", async () => {
		const database: MemoryDB = {
			user: [],
			identity: [],
			account: [],
			session: [],
			verification: [],
			walletAddress: [],
		};
		const { client, auth, sessionSetter } = await getTestInstance(
			{
				database: memoryAdapter(database),
				account: { accountLinking: { allowUnlinkingAll: true } },
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return NONCE;
						},
						async verifyMessage({ signature }) {
							return signature === "valid_signature";
						},
					}),
				],
			},
			{
				clientOptions: { plugins: [siweClient()] },
				disableTestUser: true,
			},
		);
		const context = await auth.$context;
		useBatchOnlyAtomicWrites(context.adapter);

		await client.siwe.nonce({ walletAddress, chainId });
		const firstAuthentication = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress,
			chainId,
		});
		expect(firstAuthentication.error).toBeNull();
		assert(firstAuthentication.data, "SIWE verification should return a user");

		const secondChainId = 137;
		const sessionHeaders = new Headers();
		await client.siwe.nonce({ walletAddress, chainId: secondChainId });
		const secondAuthentication = await client.siwe.verify({
			message: siweMessage({ chainId: secondChainId }),
			signature: "valid_signature",
			walletAddress,
			chainId: secondChainId,
			fetchOptions: { onSuccess: sessionSetter(sessionHeaders) },
		});
		expect(secondAuthentication.error).toBeNull();
		expect(secondAuthentication.data?.user.id).toBe(
			firstAuthentication.data.user.id,
		);

		const accounts = await context.internalAdapter.listUserAccounts(
			firstAuthentication.data.user.id,
		);
		const firstChainAccount = accounts.find(
			({ identity }) =>
				identity.providerAccountId === `${walletAddress}:${chainId}`,
		)?.account;
		assert(firstChainAccount, "The first chain should have an account");

		const unlinkResult = await client.unlinkAccount({
			accountId: firstChainAccount.id,
			fetchOptions: { headers: sessionHeaders },
		});
		expect(unlinkResult.error).toBeNull();
		expect(unlinkResult.data?.status).toBe(true);

		await client.siwe.nonce({ walletAddress, chainId });
		const authenticationAfterUnlink = await client.siwe.verify({
			message: siweMessage(),
			signature: "valid_signature",
			walletAddress,
			chainId,
		});
		expect(authenticationAfterUnlink.error).toBeNull();
		expect(authenticationAfterUnlink.data?.user.id).toBe(
			firstAuthentication.data.user.id,
		);

		const relinkedWalletAddresses =
			await context.adapter.findMany<WalletAddress>({
				model: "walletAddress",
				where: [
					{ field: "address", value: walletAddress },
					{ field: "chainId", value: chainId },
				],
			});
		expect(relinkedWalletAddresses).toHaveLength(1);
		expect(relinkedWalletAddresses[0]?.accountId).not.toBe(
			firstChainAccount.id,
		);
	});

	/**
	 * The plugin must bind the signed message to the server-issued nonce,
	 * configured domain, address, and chain id — signature recovery alone (the
	 * documented viem `verifyMessage`) is not sufficient. Otherwise a valid
	 * signature the wallet previously produced (stale, for another domain, or
	 * over an arbitrary string) could be reused with a freshly minted nonce to
	 * mint a session.
	 */
	describe("message binding", () => {
		const setup = async () => {
			// Verifier mirrors the documented viem pattern: signature recovery
			// only, with no inspection of the message body.
			const { client, auth } = await getTestInstance(
				{
					plugins: [
						siwe({
							domain,
							async getNonce() {
								return NONCE;
							},
							async verifyMessage({ signature }) {
								return signature === "valid_signature";
							},
						}),
					],
				},
				{ clientOptions: { plugins: [siweClient()] } },
			);
			return { client, auth };
		};

		it("rejects a valid signature over a message with a non-matching nonce", async () => {
			const { client } = await setup();
			await client.siwe.nonce({ walletAddress, chainId });
			const { error } = await client.siwe.verify({
				message: siweMessage({ nonce: "some-other-nonce" }),
				signature: "valid_signature",
				walletAddress,
				chainId,
			});
			expect(error?.status).toBe(401);
			expect(error?.code).toBe("UNAUTHORIZED_SIWE_MESSAGE_MISMATCH");
		});

		it("rejects a message bound to a different domain", async () => {
			const { client } = await setup();
			await client.siwe.nonce({ walletAddress, chainId });
			const { error } = await client.siwe.verify({
				message: siweMessage({ domain: "other.example.com" }),
				signature: "valid_signature",
				walletAddress,
				chainId,
			});
			expect(error?.status).toBe(401);
			expect(error?.code).toBe("UNAUTHORIZED_SIWE_MESSAGE_MISMATCH");
		});

		it("rejects a message whose chain id does not match", async () => {
			const { client } = await setup();
			await client.siwe.nonce({ walletAddress, chainId });
			const { error } = await client.siwe.verify({
				message: siweMessage({ chainId: 137 }),
				signature: "valid_signature",
				walletAddress,
				chainId,
			});
			expect(error?.status).toBe(401);
			expect(error?.code).toBe("UNAUTHORIZED_SIWE_MESSAGE_MISMATCH");
		});

		it("rejects an arbitrary (non-SIWE) message even with a valid signature", async () => {
			const { client } = await setup();
			await client.siwe.nonce({ walletAddress, chainId });
			const { error } = await client.siwe.verify({
				message: "gm, please sign this to continue",
				signature: "valid_signature",
				walletAddress,
				chainId,
			});
			expect(error?.status).toBe(401);
			expect(error?.code).toBe("UNAUTHORIZED_SIWE_MESSAGE_MISMATCH");
		});

		it("rejects an expired SIWE message", async () => {
			const { client } = await setup();
			await client.siwe.nonce({ walletAddress, chainId });
			const { error } = await client.siwe.verify({
				message: siweMessage({
					expirationTime: "2020-01-01T00:00:00.000Z",
				}),
				signature: "valid_signature",
				walletAddress,
				chainId,
			});
			expect(error?.status).toBe(401);
			expect(error?.code).toBe("UNAUTHORIZED_SIWE_MESSAGE_EXPIRED");
		});

		it("does not mint a session for an existing wallet user when an unrelated signature is reused", async () => {
			const { client, auth } = await setup();

			// The wallet user signs in normally, creating the wallet user.
			await client.siwe.nonce({ walletAddress, chainId });
			const legit = await client.siwe.verify({
				message: siweMessage(),
				signature: "valid_signature",
				walletAddress,
				chainId,
			});
			expect(legit.data?.success).toBe(true);

			const ctx = await auth.$context;
			const sessionsBefore = await ctx.adapter.findMany({
				model: "session",
			});

			// A second request mints a fresh nonce and reuses a previously
			// produced signature over an unrelated message for the same wallet.
			await client.siwe.nonce({ walletAddress, chainId });
			const secondAttempt = await client.siwe.verify({
				message: "Approve transfer of 1 ETH",
				signature: "valid_signature",
				walletAddress,
				chainId,
			});
			expect(secondAttempt.error?.status).toBe(401);
			expect(secondAttempt.data).toBeNull();

			const sessionsAfter = await ctx.adapter.findMany({ model: "session" });
			expect(sessionsAfter.length).toBe(sessionsBefore.length);
		});
	});
});
