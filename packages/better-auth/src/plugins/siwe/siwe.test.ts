import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { siweClient } from "./client";
import { siwe } from "./index";

describe("siwe", async (it) => {
	const walletAddress = "0x000000000000000000000000000000000000dEaD";
	const domain = "example.com";
	const chainId = 1; // Ethereum mainnet

	it("should generate a valid nonce for a valid public key", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
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
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
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

	it("should reject verification if nonce is missing", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwe({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
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
			message: "valid_message",
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
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
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
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
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
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
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
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
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
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
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
			message: "valid_message",
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
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
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
			message: "valid_message",
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
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
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
			message: "valid_message",
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
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
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
			message: "valid_message",
			signature: "valid_signature",
			walletAddress,
			chainId,
		});
		expect(error).toBeNull();
		expect(data?.success).toBe(true);
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
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
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
			message: "valid_message",
			signature: "valid_signature",
			walletAddress,
			chainId,
		});
		expect(first.error).toBeNull();
		expect(first.data?.success).toBe(true);

		// Try to verify again with the same nonce
		const second = await client.siwe.verify({
			message: "valid_message",
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
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
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
			message: "valid_message",
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
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
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
			message: "valid_message",
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
		const { data: data2, error: error2 } = await client.siwe.verify({
			message: "valid_message",
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
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
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
			message: "valid_message",
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
			message: "valid_message",
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
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
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
			message: "valid_message",
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
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
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
			message: "valid_message",
			signature: "valid_signature",
			walletAddress: testAddress,
			chainId: chainId1,
		});
		expect(ethereumAuth.error).toBeNull();
		expect(ethereumAuth.data?.success).toBe(true);

		// Second authentication on Polygon with same address
		await client.siwe.nonce({ walletAddress: testAddress, chainId: chainId2 });
		const polygonAuth = await client.siwe.verify({
			message: "valid_message",
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
});
