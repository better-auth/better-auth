import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { toChecksumAddress } from "../../utils/hashing";
import { siweClient } from "./client";
import { siwe } from "./index";
import type { WalletAddress } from "./types";

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
		expect(typeof data?.nonce).toBe("string");
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

		const ctx = await auth.$context;
		const walletAddresses = await ctx.adapter.findMany<WalletAddress>({
			model: "walletAddress",
			where: [{ field: "address", operator: "eq", value: walletAddress }],
		});
		expect(walletAddresses.length).toBe(1);
		expect(walletAddresses[0]?.address).toBe(walletAddress);

		await client.siwe.nonce({
			walletAddress: walletAddress.toUpperCase(),
			chainId,
		});
		const { data: data2 } = await client.siwe.verify({
			message: "valid_message",
			signature: "valid_signature",
			walletAddress: walletAddress.toUpperCase(),
			chainId,
		});
		expect(data2?.success).toBe(true);

		const walletAddressesAfter = await ctx.adapter.findMany<WalletAddress>({
			model: "walletAddress",
			where: [{ field: "address", operator: "eq", value: walletAddress }],
		});
		expect(walletAddressesAfter.length).toBe(1);
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

		const ctx = await auth.$context;
		const walletAddresses = await ctx.adapter.findMany<WalletAddress>({
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
		expect(secondUser.data?.user.id).toBe(firstUser.data?.user.id);

		const walletAddressesAfter = await ctx.adapter.findMany<WalletAddress>({
			model: "walletAddress",
			where: [
				{ field: "address", operator: "eq", value: testAddress },
				{ field: "chainId", operator: "eq", value: testChainId },
			],
		});
		expect(walletAddressesAfter.length).toBe(1);
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

		const ctx = await auth.$context;
		const walletAddresses = await ctx.adapter.findMany<WalletAddress>({
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
		const chainId1 = 1;
		const chainId2 = 137;

		await client.siwe.nonce({ walletAddress: testAddress, chainId: chainId1 });
		const ethereumAuth = await client.siwe.verify({
			message: "valid_message",
			signature: "valid_signature",
			walletAddress: testAddress,
			chainId: chainId1,
		});
		expect(ethereumAuth.error).toBeNull();
		expect(ethereumAuth.data?.success).toBe(true);

		await client.siwe.nonce({ walletAddress: testAddress, chainId: chainId2 });
		const polygonAuth = await client.siwe.verify({
			message: "valid_message",
			signature: "valid_signature",
			walletAddress: testAddress,
			chainId: chainId2,
		});
		expect(polygonAuth.error).toBeNull();
		expect(polygonAuth.data?.success).toBe(true);
		expect(polygonAuth.data?.user.id).toBe(ethereumAuth.data?.user.id);

		const ctx = await auth.$context;
		const allWalletAddresses = await ctx.adapter.findMany<WalletAddress>({
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
		expect(ethereumRecord?.isPrimary).toBe(true);
		expect(polygonRecord?.isPrimary).toBe(false);
		expect(ethereumRecord?.userId).toBe(polygonRecord?.userId);
	});

	it("should create new user when wallet not found (default behavior)", async () => {
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

		const testWallet = "0x5234567890123456789012345678901234567890";

		await client.siwe.nonce({ walletAddress: testWallet, chainId });
		const { data, error } = await client.siwe.verify({
			message: "valid_message",
			signature: "valid_signature",
			walletAddress: testWallet,
			chainId,
		});

		expect(error).toBeNull();
		expect(data?.success).toBe(true);

		const ctx = await auth.$context;
		const walletAddresses = await ctx.adapter.findMany<WalletAddress>({
			model: "walletAddress",
			where: [{ field: "address", value: testWallet }],
		});
		expect(walletAddresses.length).toBe(1);
		expect(walletAddresses[0]?.isPrimary).toBe(true);
	});

	it("should link wallet to authenticated user when siwe is trusted provider", async () => {
		const { auth, client, cookieSetter } = await getTestInstance(
			{
				account: {
					accountLinking: {
						enabled: true,
						trustedProviders: ["siwe"],
					},
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
					}),
				],
			},
			{ clientOptions: { plugins: [siweClient()] } },
		);

		const headers = new Headers();
		await client.signUp.email(
			{
				email: "existing@example.com",
				name: "Existing User",
				password: "password123",
			},
			{ onSuccess: cookieSetter(headers) },
		);

		const session = await client.getSession({ fetchOptions: { headers } });
		const existingUserId = session.data?.user.id!;

		const testWallet = "0x1234567890123456789012345678901234567890";

		await client.siwe.nonce(
			{ walletAddress: testWallet, chainId },
			{ headers },
		);

		const { data, error } = await client.siwe.verify(
			{
				message: "valid_message",
				signature: "valid_signature",
				walletAddress: testWallet,
				chainId,
			},
			{ headers },
		);

		expect(error).toBeNull();
		expect(data?.success).toBe(true);
		expect(data?.user.id).toBe(existingUserId);

		const ctx = await auth.$context;
		const walletAddresses = await ctx.adapter.findMany<WalletAddress>({
			model: "walletAddress",
			where: [{ field: "userId", value: existingUserId }],
		});
		expect(walletAddresses.length).toBe(1);
		expect(walletAddresses[0]?.address).toBe(testWallet);
		expect(walletAddresses[0]?.isPrimary).toBe(false);
	});

	it("should link wallet when no trustedProviders configured (default allows linking)", async () => {
		const { auth, client, cookieSetter } = await getTestInstance(
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

		const headers = new Headers();
		await client.signUp.email(
			{
				email: "default-linking@example.com",
				name: "Default Linking User",
				password: "password123",
			},
			{ onSuccess: cookieSetter(headers) },
		);

		const session = await client.getSession({ fetchOptions: { headers } });
		const existingUserId = session.data?.user.id!;

		const testWallet = "0x9234567890123456789012345678901234567890";

		await client.siwe.nonce(
			{ walletAddress: testWallet, chainId },
			{ headers },
		);

		const { data, error } = await client.siwe.verify(
			{
				message: "valid_message",
				signature: "valid_signature",
				walletAddress: testWallet,
				chainId,
			},
			{ headers },
		);

		expect(error).toBeNull();
		expect(data?.success).toBe(true);
		expect(data?.user.id).toBe(existingUserId);

		const ctx = await auth.$context;
		const walletAddresses = await ctx.adapter.findMany<WalletAddress>({
			model: "walletAddress",
			where: [{ field: "userId", value: existingUserId }],
		});
		expect(walletAddresses.length).toBe(1);
	});

	it("should NOT link when trustedProviders is set but doesn't include siwe", async () => {
		const { auth, client, cookieSetter } = await getTestInstance(
			{
				account: {
					accountLinking: {
						enabled: true,
						trustedProviders: ["google", "github"], // siwe not included
					},
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
					}),
				],
			},
			{ clientOptions: { plugins: [siweClient()] } },
		);

		const headers = new Headers();
		await client.signUp.email(
			{
				email: "trusted-providers@example.com",
				name: "Trusted Providers User",
				password: "password123",
			},
			{ onSuccess: cookieSetter(headers) },
		);

		const session = await client.getSession({ fetchOptions: { headers } });
		const existingUserId = session.data?.user.id!;

		const testWallet = "0x7234567890123456789012345678901234567890";

		await client.siwe.nonce(
			{ walletAddress: testWallet, chainId },
			{ headers },
		);

		const { data, error } = await client.siwe.verify(
			{
				message: "valid_message",
				signature: "valid_signature",
				walletAddress: testWallet,
				chainId,
			},
			{ headers },
		);

		expect(error).toBeNull();
		expect(data?.success).toBe(true);
		expect(data?.user.id).not.toBe(existingUserId);

		const ctx = await auth.$context;
		const walletAddresses = await ctx.adapter.findMany<WalletAddress>({
			model: "walletAddress",
			where: [{ field: "userId", value: existingUserId }],
		});
		expect(walletAddresses.length).toBe(0);
	});

	it("should NOT link when accountLinking.enabled is false", async () => {
		const { auth, client, cookieSetter } = await getTestInstance(
			{
				account: {
					accountLinking: {
						enabled: false,
					},
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
					}),
				],
			},
			{ clientOptions: { plugins: [siweClient()] } },
		);

		const headers = new Headers();
		await client.signUp.email(
			{
				email: "linking-disabled@example.com",
				name: "Linking Disabled User",
				password: "password123",
			},
			{ onSuccess: cookieSetter(headers) },
		);

		const session = await client.getSession({ fetchOptions: { headers } });
		const existingUserId = session.data?.user.id!;

		const testWallet = "0x6234567890123456789012345678901234567890";

		await client.siwe.nonce(
			{ walletAddress: testWallet, chainId },
			{ headers },
		);

		const { data, error } = await client.siwe.verify(
			{
				message: "valid_message",
				signature: "valid_signature",
				walletAddress: testWallet,
				chainId,
			},
			{ headers },
		);

		expect(error).toBeNull();
		expect(data?.success).toBe(true);
		expect(data?.user.id).not.toBe(existingUserId);

		const ctx = await auth.$context;
		const walletAddresses = await ctx.adapter.findMany<WalletAddress>({
			model: "walletAddress",
			where: [{ field: "userId", value: existingUserId }],
		});
		expect(walletAddresses.length).toBe(0);
	});

	it("should return success if wallet already linked to current user (idempotent)", async () => {
		const { auth, client, cookieSetter } = await getTestInstance(
			{
				account: {
					accountLinking: {
						enabled: true,
						trustedProviders: ["siwe"],
					},
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
					}),
				],
			},
			{ clientOptions: { plugins: [siweClient()] } },
		);

		const headers = new Headers();
		await client.signUp.email(
			{
				email: "existing2@example.com",
				name: "Existing User 2",
				password: "password123",
			},
			{ onSuccess: cookieSetter(headers) },
		);

		const testWallet = "0x2234567890123456789012345678901234567890";

		await client.siwe.nonce(
			{ walletAddress: testWallet, chainId },
			{ headers },
		);
		const firstLink = await client.siwe.verify(
			{
				message: "valid_message",
				signature: "valid_signature",
				walletAddress: testWallet,
				chainId,
			},
			{ headers },
		);
		expect(firstLink.error).toBeNull();
		expect(firstLink.data?.success).toBe(true);

		await client.siwe.nonce(
			{ walletAddress: testWallet, chainId },
			{ headers },
		);
		const secondLink = await client.siwe.verify(
			{
				message: "valid_message",
				signature: "valid_signature",
				walletAddress: testWallet,
				chainId,
			},
			{ headers },
		);
		expect(secondLink.error).toBeNull();
		expect(secondLink.data?.success).toBe(true);

		const ctx = await auth.$context;
		const walletAddresses = await ctx.adapter.findMany<WalletAddress>({
			model: "walletAddress",
			where: [{ field: "address", value: testWallet }],
		});
		expect(walletAddresses.length).toBe(1);
	});

	it("should reject if wallet already linked to another user", async () => {
		const { client, cookieSetter } = await getTestInstance(
			{
				account: {
					accountLinking: {
						enabled: true,
						trustedProviders: ["siwe"],
					},
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
					}),
				],
			},
			{ clientOptions: { plugins: [siweClient()] } },
		);

		const testWallet = "0x3234567890123456789012345678901234567890";

		// First user signs in with wallet (creates ownership)
		await client.siwe.nonce({ walletAddress: testWallet, chainId });
		const firstUserResult = await client.siwe.verify({
			message: "valid_message",
			signature: "valid_signature",
			walletAddress: testWallet,
			chainId,
		});
		expect(firstUserResult.error).toBeNull();

		// Second user signs up and tries to link the same wallet
		const secondUserHeaders = new Headers();
		await client.signUp.email(
			{
				email: "second@example.com",
				name: "Second User",
				password: "password123",
			},
			{ onSuccess: cookieSetter(secondUserHeaders) },
		);

		await client.siwe.nonce(
			{ walletAddress: testWallet, chainId },
			{ headers: secondUserHeaders },
		);

		const { error } = await client.siwe.verify(
			{
				message: "valid_message",
				signature: "valid_signature",
				walletAddress: testWallet,
				chainId,
			},
			{ headers: secondUserHeaders },
		);

		expect(error).toBeDefined();
		expect(error?.status).toBe(400);
		expect(error?.code).toBe("WALLET_ALREADY_LINKED");
	});

	it("should create new user when not authenticated (no session)", async () => {
		const { auth, client } = await getTestInstance(
			{
				account: {
					accountLinking: {
						enabled: true,
						trustedProviders: ["siwe"],
					},
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
					}),
				],
			},
			{ clientOptions: { plugins: [siweClient()] } },
		);

		const testWallet = "0xABCD567890123456789012345678901234567890";

		await client.siwe.nonce({ walletAddress: testWallet, chainId });
		const { data, error } = await client.siwe.verify({
			message: "valid_message",
			signature: "valid_signature",
			walletAddress: testWallet,
			chainId,
		});

		expect(error).toBeNull();
		expect(data?.success).toBe(true);

		const ctx = await auth.$context;
		const walletAddresses = await ctx.adapter.findMany<WalletAddress>({
			model: "walletAddress",
			where: [{ field: "address", value: toChecksumAddress(testWallet) }],
		});
		expect(walletAddresses.length).toBe(1);
		expect(walletAddresses[0]?.isPrimary).toBe(true);
	});
});
