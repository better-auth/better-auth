import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { siweClient } from "./client";
import { siwe } from "./index";

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
		const walletAddresses: any[] = await (await auth.$context).adapter.findMany(
			{
				model: "walletAddress",
				where: [{ field: "address", operator: "eq", value: walletAddress }],
			},
		);
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
		const walletAddresses: any[] = await (await auth.$context).adapter.findMany(
			{
				model: "walletAddress",
				where: [
					{ field: "address", operator: "eq", value: testAddress },
					{ field: "chainId", operator: "eq", value: testChainId },
				],
			},
		);
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
		const walletAddressesAfter: any[] = await (
			await auth.$context
		).adapter.findMany({
			model: "walletAddress",
			where: [
				{ field: "address", operator: "eq", value: testAddress },
				{ field: "chainId", operator: "eq", value: testChainId },
			],
		});
		expect(walletAddressesAfter.length).toBe(1); // Still only one record

		// Verify total user count (should be only 1 user created)
		const allUsers: any[] = await (await auth.$context).adapter.findMany({
			model: "user",
		});
		const usersWithTestAddress = allUsers.filter((user) =>
			walletAddressesAfter.some((wa) => wa.userId === user.id),
		);
		expect(usersWithTestAddress.length).toBe(1); // Only one user should have this address
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
									userId: "user_id",
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

		const walletAddresses: any[] = await context.adapter.findMany({
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
		expect(walletAddresses[0]?.userId).toBeDefined();
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
		const allWalletAddresses: any[] = await (
			await auth.$context
		).adapter.findMany({
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
		expect(ethereumRecord?.userId).toBe(polygonRecord?.userId); // Same user ID
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
