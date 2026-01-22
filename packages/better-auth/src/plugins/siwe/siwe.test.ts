import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import type { Account, User } from "../../types";
import { toChecksumAddress } from "../../utils/hashing";
import { siweClient } from "./client";
import type { SIWEPluginOptions } from "./index";
import { siwe } from "./index";
import type { WalletAddress } from "./types";

describe("siwe", () => {
	const walletAddress = "0x000000000000000000000000000000000000dEaD";
	const domain = "example.com";
	const chainId = 1; // Ethereum mainnet

	// Helper to create default SIWE options with overrides
	const createSiweOptions = (
		overrides: Partial<SIWEPluginOptions> = {},
	): SIWEPluginOptions => ({
		domain,
		async getNonce() {
			return "A1b2C3d4E5f6G7h8J";
		},
		async verifyMessage({ message, signature }) {
			return signature === "valid_signature" && message === "valid_message";
		},
		...overrides,
	});

	// Helper to create test instance with default configuration
	const createTestInstance = async (
		siweOptions: Partial<SIWEPluginOptions> = {},
		authOptions: Parameters<typeof getTestInstance>[0] = {},
	) => {
		return getTestInstance(
			{
				...authOptions,
				plugins: [
					siwe(createSiweOptions(siweOptions)),
					...(authOptions.plugins ?? []),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);
	};

	describe("nonce generation", () => {
		it("should generate a valid nonce for a valid wallet address", async () => {
			const { client } = await createTestInstance();
			const { data } = await client.siwe.nonce({ walletAddress, chainId });

			expect(typeof data?.nonce).toBe("string");
			expect(data?.nonce).toMatch(/^[a-zA-Z0-9]{17}$/);
		});

		it("should generate a valid nonce with default chainId", async () => {
			const { client } = await createTestInstance();
			const { data } = await client.siwe.nonce({ walletAddress });

			expect(typeof data?.nonce).toBe("string");
			expect(data?.nonce).toMatch(/^[a-zA-Z0-9]{17}$/);
		});

		it("should reject invalid wallet address format", async () => {
			const { client } = await createTestInstance();

			const invalidAddresses = ["invalid", "not_a_valid_key", "0x123", ""];
			for (const invalidAddress of invalidAddresses) {
				const { error } = await client.siwe.nonce({
					walletAddress: invalidAddress,
				});
				expect(error).toBeDefined();
				expect(error?.status).toBe(400);
			}
		});

		it("should reject invalid chainId values", async () => {
			const { client } = await createTestInstance();

			// Negative chainId
			const { error: negativeError } = await client.siwe.nonce({
				walletAddress,
				chainId: -1,
			});
			expect(negativeError).toBeDefined();
			expect(negativeError?.status).toBe(400);

			// Zero chainId
			const { error: zeroError } = await client.siwe.nonce({
				walletAddress,
				chainId: 0,
			});
			expect(zeroError).toBeDefined();
			expect(zeroError?.status).toBe(400);

			// ChainId exceeding max value (2147483647)
			const { error: maxError } = await client.siwe.nonce({
				walletAddress,
				chainId: 2147483648,
			});
			expect(maxError).toBeDefined();
			expect(maxError?.status).toBe(400);
		});
	});

	describe("verification", () => {
		it("should reject verification if nonce is missing", async () => {
			const { client } = await createTestInstance();
			const { error } = await client.siwe.verify({
				message: "valid_message",
				signature: "valid_signature",
				walletAddress,
				chainId,
			});

			expect(error).toBeDefined();
			expect(error?.status).toBe(401);
			expect(error?.code).toBe("INVALID_OR_EXPIRED_NONCE");
		});

		it("should reject verification when nonce has expired", async () => {
			vi.useFakeTimers();
			try {
				const { client } = await createTestInstance();

				await client.siwe.nonce({ walletAddress, chainId });

				// Advance time by 16 minutes (nonce expires in 15 minutes)
				vi.advanceTimersByTime(16 * 60 * 1000);

				const { error } = await client.siwe.verify({
					message: "valid_message",
					signature: "valid_signature",
					walletAddress,
					chainId,
				});

				expect(error).toBeDefined();
				expect(error?.status).toBe(401);
				expect(error?.code).toBe("INVALID_OR_EXPIRED_NONCE");
			} finally {
				vi.useRealTimers();
			}
		});

		it("should reject verification with invalid signature", async () => {
			const { client } = await createTestInstance();
			await client.siwe.nonce({ walletAddress, chainId });

			const { error } = await client.siwe.verify({
				message: "valid_message",
				signature: "invalid_signature",
				walletAddress,
				chainId,
			});

			expect(error).toBeDefined();
			expect(error?.status).toBe(401);
		});

		it("should reject verification with invalid message", async () => {
			const { client } = await createTestInstance();
			await client.siwe.nonce({ walletAddress, chainId });

			const { error } = await client.siwe.verify({
				message: "invalid_message",
				signature: "valid_signature",
				walletAddress,
				chainId,
			});

			expect(error).toBeDefined();
			expect(error?.status).toBe(401);
		});

		it("should reject empty message", async () => {
			const { client } = await createTestInstance();
			await client.siwe.nonce({ walletAddress, chainId });

			const { error } = await client.siwe.verify({
				message: "",
				signature: "valid_signature",
				walletAddress,
				chainId,
			});

			expect(error).toBeDefined();
			expect(error?.status).toBe(400);
		});

		it("should reject empty signature", async () => {
			const { client } = await createTestInstance();
			await client.siwe.nonce({ walletAddress, chainId });

			const { error } = await client.siwe.verify({
				message: "valid_message",
				signature: "",
				walletAddress,
				chainId,
			});

			expect(error).toBeDefined();
			expect(error?.status).toBe(400);
		});

		it("should not allow nonce reuse", async () => {
			const { client } = await createTestInstance();

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
			expect(second.error?.code).toBe("INVALID_OR_EXPIRED_NONCE");
		});

		it("should successfully verify with valid credentials", async () => {
			const { client } = await createTestInstance();

			await client.siwe.nonce({ walletAddress, chainId });
			const { data, error } = await client.siwe.verify({
				message: "valid_message",
				signature: "valid_signature",
				walletAddress,
				chainId,
			});

			expect(error).toBeNull();
			expect(data?.success).toBe(true);
			expect(data?.token).toBeDefined();
			expect(data?.user.walletAddress).toBe(walletAddress);
		});
	});

	describe("anonymous mode", () => {
		it("should allow verification without email when anonymous is true (default)", async () => {
			const { client } = await createTestInstance();

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

		it("should reject verification without email when anonymous is false", async () => {
			const { client } = await createTestInstance({ anonymous: false });

			const { error } = await client.siwe.verify({
				message: "valid_message",
				signature: "valid_signature",
				walletAddress,
				chainId,
				email: undefined,
			});

			expect(error).toBeDefined();
			expect(error?.status).toBe(400);
		});

		it("should accept verification with email when anonymous is false", async () => {
			const { client } = await createTestInstance({ anonymous: false });

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
			const { client } = await createTestInstance({ anonymous: false });

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

		it("should reject empty string email when anonymous is false", async () => {
			const { client } = await createTestInstance({ anonymous: false });

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
		});
	});

	describe("wallet address management", () => {
		it("should store and return the wallet address in checksum format", async () => {
			const { client, auth } = await createTestInstance();

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

			// Verify that different case variations resolve to same wallet
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

		it("should not create duplicate wallet address entries", async () => {
			const { client, auth } = await createTestInstance();

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

			// Second verification with same wallet should return same user
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

		it("should allow same address on different chains for same user", async () => {
			const { client, auth } = await createTestInstance();

			const testAddress = "0x000000000000000000000000000000000000dEaD";
			const chainId1 = 1; // Ethereum
			const chainId2 = 137; // Polygon

			await client.siwe.nonce({
				walletAddress: testAddress,
				chainId: chainId1,
			});
			const ethereumAuth = await client.siwe.verify({
				message: "valid_message",
				signature: "valid_signature",
				walletAddress: testAddress,
				chainId: chainId1,
			});
			expect(ethereumAuth.error).toBeNull();
			expect(ethereumAuth.data?.success).toBe(true);

			await client.siwe.nonce({
				walletAddress: testAddress,
				chainId: chainId2,
			});
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
			const { client, auth } = await createTestInstance();

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
	});

	describe("ENS integration", () => {
		it("should use ENS lookup for user name and avatar when provided", async () => {
			const ensName = "better-auth.eth";
			const ensAvatar = "https://example.com/avatar.png";

			const { client, auth } = await createTestInstance({
				ensLookup: async () => ({
					name: ensName,
					avatar: ensAvatar,
				}),
			});

			const testWallet = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

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
			const user = await ctx.adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: data?.user.id! }],
			});

			expect(user?.name).toBe(ensName);
			expect(user?.image).toBe(ensAvatar);
		});

		it("should use wallet address as name when ENS lookup not provided", async () => {
			const { client, auth } = await createTestInstance();

			const testWallet = "0xE8dA6BF26964aF9D7eEd9e03E53415D37aA96046";

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
			const user = await ctx.adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: data?.user.id! }],
			});

			// Wallet address is stored in checksum format
			expect(user?.name).toBe(toChecksumAddress(testWallet));
		});

		it("should pass wallet address to ENS lookup function", async () => {
			const ensLookupSpy = vi.fn().mockResolvedValue({
				name: "test.eth",
				avatar: "https://example.com/test.png",
			});

			const { client } = await createTestInstance({
				ensLookup: ensLookupSpy,
			});

			const testWallet = "0xF8dA6BF26964aF9D7eEd9e03E53415D37aA96047";

			await client.siwe.nonce({ walletAddress: testWallet, chainId });
			await client.siwe.verify({
				message: "valid_message",
				signature: "valid_signature",
				walletAddress: testWallet,
				chainId,
			});

			// ENS lookup receives the checksum-formatted address
			expect(ensLookupSpy).toHaveBeenCalledWith({
				walletAddress: toChecksumAddress(testWallet),
			});
		});
	});

	describe("emailDomainName option", () => {
		it("should use custom emailDomainName for anonymous user email", async () => {
			const customDomain = "custom-wallet.io";
			const { client, auth } = await createTestInstance({
				emailDomainName: customDomain,
			});

			const testWallet = "0xA1dA6BF26964aF9D7eEd9e03E53415D37aA96048";

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
			const user = await ctx.adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: data?.user.id! }],
			});

			// Email is normalized to lowercase
			expect(user?.email?.toLowerCase()).toBe(
				`${testWallet.toLowerCase()}@${customDomain}`,
			);
		});

		it("should use baseURL origin when emailDomainName not provided", async () => {
			const { client, auth } = await createTestInstance();

			const testWallet = "0xB1dA6BF26964aF9D7eEd9e03E53415D37aA96049";

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
			const user = await ctx.adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: data?.user.id! }],
			});

			// Email is normalized to lowercase and uses the default baseURL origin
			expect(user?.email?.toLowerCase()).toContain(testWallet.toLowerCase());
			expect(user?.email).toContain("@");
		});
	});

	describe("custom schema", () => {
		it("should support custom schema with mergeSchema", async () => {
			const { client, auth } = await getTestInstance(
				{
					plugins: [
						siwe({
							...createSiweOptions(),
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
	});

	describe("account record creation", () => {
		it("should create account record with correct providerId and accountId", async () => {
			const { client, auth } = await createTestInstance();

			const testWallet = "0xC1dA6BF26964aF9D7eEd9e03E53415D37aA96050";

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
			const accounts = await ctx.adapter.findMany<Account>({
				model: "account",
				where: [{ field: "userId", value: data?.user.id! }],
			});

			expect(accounts.length).toBe(1);
			expect(accounts[0]?.providerId).toBe("siwe");
			// accountId uses checksum-formatted wallet address
			expect(accounts[0]?.accountId).toBe(
				`${toChecksumAddress(testWallet)}:${chainId}`,
			);
		});

		it("should create separate account records for same wallet on different chains", async () => {
			const { client, auth } = await createTestInstance();

			const testWallet = "0xD1dA6BF26964aF9D7eEd9e03E53415D37aA96051";
			const chainId1 = 1;
			const chainId2 = 137;

			await client.siwe.nonce({ walletAddress: testWallet, chainId: chainId1 });
			const { data: data1 } = await client.siwe.verify({
				message: "valid_message",
				signature: "valid_signature",
				walletAddress: testWallet,
				chainId: chainId1,
			});

			await client.siwe.nonce({ walletAddress: testWallet, chainId: chainId2 });
			const { data: data2 } = await client.siwe.verify({
				message: "valid_message",
				signature: "valid_signature",
				walletAddress: testWallet,
				chainId: chainId2,
			});

			expect(data1?.user.id).toBe(data2?.user.id);

			const ctx = await auth.$context;
			const accounts = await ctx.adapter.findMany<Account>({
				model: "account",
				where: [{ field: "userId", value: data1?.user.id! }],
			});

			expect(accounts.length).toBe(2);

			// accountIds use checksum-formatted wallet addresses
			const checksumWallet = toChecksumAddress(testWallet);
			const accountIds = accounts.map(
				(a: { accountId: string }) => a.accountId,
			);
			expect(accountIds).toContain(`${checksumWallet}:${chainId1}`);
			expect(accountIds).toContain(`${checksumWallet}:${chainId2}`);
		});
	});
});
