import bs58 from "bs58";
import nacl from "tweetnacl";
import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { siwxClient } from "./client";
import { siwx } from "./index";

describe("siwx", async (it) => {
	const evmAddress = "0x000000000000000000000000000000000000dEaD";
	const solanaAddress = "11111111111111111111111111111111";
	const domain = "example.com";

	it("should generate a valid nonce for EVM address", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_evm_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);
		const { data, error } = await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
		});

		expect(error).toBeNull();
		expect(data?.nonce).toBe("A1b2C3d4E5f6G7h8J");
		expect(data?.chainId).toBe("1");
		expect(data?.statement).toBe("Sign in with your wallet");
		expect(data?.expiresAt).toBeDefined();
	});

	it("should generate a valid nonce for Solana address", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_solana_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);
		const { data, error } = await client.siwx.nonce({
			address: solanaAddress,
			chainType: "solana",
		});

		expect(error).toBeNull();
		expect(data?.nonce).toBe("A1b2C3d4E5f6G7h8J");
		expect(data?.chainId).toBe("mainnet-beta");
	});

	it("should use custom chainId when provided", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage() {
							return true;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);
		const { data } = await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
			chainId: "137",
		});

		expect(data?.chainId).toBe("137");
	});

	it("should reject unsupported chain type in nonce request", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						supportedChains: ["evm"],
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage() {
							return true;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		const { error } = await client.siwx.nonce({
			address: solanaAddress,
			chainType: "solana",
		});

		expect(error).toBeDefined();
		expect(error?.status).toBe(400);
		expect(error?.code).toBe("UNSUPPORTED_CHAIN_TYPE");
	});

	it("should use custom statement when provided", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						statement: "Welcome to MyApp!",
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage() {
							return true;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		const { data } = await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
		});

		expect(data?.statement).toBe("Welcome to MyApp!");
	});

	it("should verify EVM signature and create session", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_evm_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
			chainId: "1",
		});

		const { data, error } = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress,
			chainType: "evm",
			chainId: "1",
		});

		expect(error).toBeNull();
		expect(data?.success).toBe(true);
		expect(data?.token).toBeDefined();
		expect(data?.user.chainType).toBe("evm");
		expect(data?.user.chainId).toBe("1");
	});

	it("should verify Solana signature and create session", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_solana_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		await client.siwx.nonce({
			address: solanaAddress,
			chainType: "solana",
		});

		const { data, error } = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_solana_signature",
			address: solanaAddress,
			chainType: "solana",
		});

		expect(error).toBeNull();
		expect(data?.success).toBe(true);
		expect(data?.user.chainType).toBe("solana");
		expect(data?.user.chainId).toBe("mainnet-beta");
	});

	it("should reject verification if nonce is missing", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_evm_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		const { error } = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress,
			chainType: "evm",
		});

		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
		expect(error?.code).toBe("INVALID_OR_EXPIRED_NONCE");
	});

	it("should reject invalid signature", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_evm_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
		});

		const { error } = await client.siwx.verify({
			message: "Sign in message",
			signature: "invalid_signature",
			address: evmAddress,
			chainType: "evm",
		});

		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
		expect(error?.code).toBe("UNAUTHORIZED_INVALID_SIGNATURE");
	});

	it("should not allow nonce reuse", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_evm_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
			chainId: "1",
		});

		const first = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress,
			chainType: "evm",
			chainId: "1",
		});
		expect(first.error).toBeNull();
		expect(first.data?.success).toBe(true);

		const second = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress,
			chainType: "evm",
			chainId: "1",
		});
		expect(second.error).toBeDefined();
		expect(second.error?.status).toBe(401);
		expect(second.error?.code).toBe("INVALID_OR_EXPIRED_NONCE");
	});

	it("should return same user on subsequent sign-ins", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_evm_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
			chainId: "1",
		});
		const first = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress,
			chainType: "evm",
			chainId: "1",
		});

		await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
			chainId: "1",
		});
		const second = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress,
			chainType: "evm",
			chainId: "1",
		});

		expect(first.data?.user.id).toBe(second.data?.user.id);
	});

	it("should link same address across different chains to same user", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_evm_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
			chainId: "1",
		});
		const evmAuth = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress,
			chainType: "evm",
			chainId: "1",
		});

		await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
			chainId: "137",
		});
		const polygonAuth = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress,
			chainType: "evm",
			chainId: "137",
		});

		expect(evmAuth.data?.user.id).toBe(polygonAuth.data?.user.id);
	});

	it("should create different users for different addresses", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_evm_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);
		const anotherAddress = "0x1111111111111111111111111111111111111111";

		await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
		});
		const first = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress,
			chainType: "evm",
		});

		await client.siwx.nonce({
			address: anotherAddress,
			chainType: "evm",
		});
		const second = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: anotherAddress,
			chainType: "evm",
		});

		expect(first.data?.user.id).not.toBe(second.data?.user.id);
	});

	it("should allow sign-in without email when anonymous is true", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						anonymous: true,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_evm_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
		});

		const { data, error } = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress,
			chainType: "evm",
		});

		expect(error).toBeNull();
		expect(data?.success).toBe(true);
	});

	it("should require email when anonymous is false", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						anonymous: false,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_evm_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
		});

		const { error } = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress,
			chainType: "evm",
		});

		expect(error).toBeDefined();
		expect(error?.status).toBe(400);
	});

	it("should accept email when anonymous is false", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						anonymous: false,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_evm_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
		});

		const { data, error } = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress,
			chainType: "evm",
			email: "user@example.com",
		});

		expect(error).toBeNull();
		expect(data?.success).toBe(true);
	});

	it("should reject invalid email format", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						anonymous: false,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_evm_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
		});

		const { error } = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress,
			chainType: "evm",
			email: "not-an-email",
		});

		expect(error).toBeDefined();
		expect(error?.status).toBe(400);
	});

	it("should normalize EVM address to checksum format", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_evm_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);
		const lowercaseAddress = evmAddress.toLowerCase();

		await client.siwx.nonce({
			address: lowercaseAddress,
			chainType: "evm",
		});

		const { data } = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: lowercaseAddress,
			chainType: "evm",
		});

		expect(data?.user.address).toBe(evmAddress);
	});

	it("should treat different case EVM addresses as same user", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_evm_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		await client.siwx.nonce({
			address: evmAddress.toLowerCase(),
			chainType: "evm",
		});
		const first = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress.toLowerCase(),
			chainType: "evm",
		});

		await client.siwx.nonce({
			address: evmAddress.toUpperCase(),
			chainType: "evm",
		});
		const second = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress.toUpperCase(),
			chainType: "evm",
		});

		expect(first.data?.user.id).toBe(second.data?.user.id);
	});

	it("should preserve Solana address case", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_solana_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		await client.siwx.nonce({
			address: solanaAddress,
			chainType: "solana",
		});

		const { data } = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_solana_signature",
			address: solanaAddress,
			chainType: "solana",
		});

		expect(data?.user.address).toBe(solanaAddress);
	});

	it("should use name from nameLookup callback", async () => {
		const { client, auth } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature }) {
							return signature === "valid_evm_signature";
						},
						nameLookup: async ({ chainType }) => {
							if (chainType === "evm") {
								return {
									name: "vitalik.eth",
									avatar: "https://example.com/avatar.png",
								};
							}
							return {};
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
		});

		const { data } = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress,
			chainType: "evm",
		});

		const user = await (await auth.$context).adapter.findOne<{
			name: string;
			image: string;
		}>({
			model: "user",
			where: [{ field: "id", operator: "eq", value: data!.user.id }],
		});

		expect(user?.name).toBe("vitalik.eth");
		expect(user?.image).toBe("https://example.com/avatar.png");
	});

	it("should pass custom signature type to verifyMessage", async () => {
		let receivedSignatureType: string | undefined;

		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature, signatureType }) {
							receivedSignatureType = signatureType;
							return signature === "valid_evm_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
		});

		await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress,
			chainType: "evm",
			signatureType: "evm:eip1271",
		});

		expect(receivedSignatureType).toBe("evm:eip1271");
	});

	it("should use default signature type when not provided", async () => {
		let receivedSignatureType: string | undefined;

		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature, signatureType }) {
							receivedSignatureType = signatureType;
							return signature === "valid_evm_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
		});

		await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress,
			chainType: "evm",
		});

		expect(receivedSignatureType).toBe("evm:eip191");
	});

	it("should pass correct CACAO object to verifyMessage", async () => {
		let receivedCacao: any;

		const { client } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ signature, cacao }) {
							receivedCacao = cacao;
							return signature === "valid_evm_signature";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		await client.siwx.nonce({
			address: evmAddress,
			chainType: "evm",
			chainId: "1",
		});

		await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_evm_signature",
			address: evmAddress,
			chainType: "evm",
			chainId: "1",
		});

		expect(receivedCacao.h.t).toBe("caip122");
		expect(receivedCacao.p.domain).toBe(domain);
		expect(receivedCacao.p.iss).toBe(`eip155:1:${evmAddress}`);
		expect(receivedCacao.p.nonce).toBe("A1b2C3d4E5f6G7h8J");
		expect(receivedCacao.s.t).toBe("evm:eip191");
		expect(receivedCacao.s.s).toBe("valid_evm_signature");
	});

	it("should reject callback when not configured", async () => {
		const { auth } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage() {
							return true;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		const response = await auth.handler(
			new Request("http://localhost/api/auth/siwx/callback/phantom"),
		);

		expect(response.status).toBe(500);
	});

	it("should reject callback for unsupported provider", async () => {
		const appKeyPair = nacl.box.keyPair();

		const { auth } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage() {
							return true;
						},
						callback: {
							appPublicKeyBase58: bs58.encode(appKeyPair.publicKey),
							appPrivateKeyBase58: bs58.encode(appKeyPair.secretKey),
							providers: ["phantom"],
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		const response = await auth.handler(
			new Request("http://localhost/api/auth/siwx/callback/solflare"),
		);

		expect(response.status).toBe(400);
	});

	it("should handle callback error response with redirect", async () => {
		const appKeyPair = nacl.box.keyPair();

		const { auth } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage() {
							return true;
						},
						callback: {
							appPublicKeyBase58: bs58.encode(appKeyPair.publicKey),
							appPrivateKeyBase58: bs58.encode(appKeyPair.secretKey),
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		const response = await auth.handler(
			new Request(
				"http://localhost/api/auth/siwx/callback/phantom?errorCode=USER_REJECTED&errorMessage=User%20rejected",
			),
		);

		expect(response.status).toBe(302);
		const location = response.headers.get("location");
		expect(location).toContain("/login?success=false");
		expect(location).toContain("errorCode=USER_REJECTED");
	});

	it("should decrypt phantom callback and create session", async () => {
		const appKeyPair = nacl.box.keyPair();
		const walletKeyPair = nacl.box.keyPair();
		const walletSigningKeyPair = nacl.sign.keyPair();
		const walletPublicKey = bs58.encode(walletSigningKeyPair.publicKey);

		const payload = JSON.stringify({ public_key: walletPublicKey });
		const nonce = nacl.randomBytes(24);
		const encrypted = nacl.box(
			new TextEncoder().encode(payload),
			nonce,
			appKeyPair.publicKey,
			walletKeyPair.secretKey,
		);

		const { auth } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage() {
							return true;
						},
						callback: {
							appPublicKeyBase58: bs58.encode(appKeyPair.publicKey),
							appPrivateKeyBase58: bs58.encode(appKeyPair.secretKey),
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		const params = new URLSearchParams({
			phantom_encryption_public_key: bs58.encode(walletKeyPair.publicKey),
			nonce: bs58.encode(nonce),
			data: bs58.encode(encrypted),
		});

		const response = await auth.handler(
			new Request(`http://localhost/api/auth/siwx/callback/phantom?${params}`),
		);

		expect(response.status).toBe(302);
		const location = response.headers.get("location");
		expect(location).toContain("/?success=true");
		expect(location).toContain("provider=phantom");
		expect(response.headers.get("set-cookie")).toContain("better-auth.session");
	});

	it("should decrypt solflare callback and create session", async () => {
		const appKeyPair = nacl.box.keyPair();
		const walletKeyPair = nacl.box.keyPair();
		const walletSigningKeyPair = nacl.sign.keyPair();
		const walletPublicKey = bs58.encode(walletSigningKeyPair.publicKey);

		const payload = JSON.stringify({ public_key: walletPublicKey });
		const nonce = nacl.randomBytes(24);
		const encrypted = nacl.box(
			new TextEncoder().encode(payload),
			nonce,
			appKeyPair.publicKey,
			walletKeyPair.secretKey,
		);

		const { auth } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage() {
							return true;
						},
						callback: {
							appPublicKeyBase58: bs58.encode(appKeyPair.publicKey),
							appPrivateKeyBase58: bs58.encode(appKeyPair.secretKey),
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		const params = new URLSearchParams({
			solflare_encryption_public_key: bs58.encode(walletKeyPair.publicKey),
			nonce: bs58.encode(nonce),
			data: bs58.encode(encrypted),
		});

		const response = await auth.handler(
			new Request(`http://localhost/api/auth/siwx/callback/solflare?${params}`),
		);

		expect(response.status).toBe(302);
		const location = response.headers.get("location");
		expect(location).toContain("/?success=true");
		expect(location).toContain("provider=solflare");
	});

	it("should decrypt backpack callback and create session", async () => {
		const appKeyPair = nacl.box.keyPair();
		const walletKeyPair = nacl.box.keyPair();
		const walletSigningKeyPair = nacl.sign.keyPair();
		const walletPublicKey = bs58.encode(walletSigningKeyPair.publicKey);

		const payload = JSON.stringify({ public_key: walletPublicKey });
		const nonce = nacl.randomBytes(24);
		const encrypted = nacl.box(
			new TextEncoder().encode(payload),
			nonce,
			appKeyPair.publicKey,
			walletKeyPair.secretKey,
		);

		const { auth } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage() {
							return true;
						},
						callback: {
							appPublicKeyBase58: bs58.encode(appKeyPair.publicKey),
							appPrivateKeyBase58: bs58.encode(appKeyPair.secretKey),
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		const params = new URLSearchParams({
			wallet_encryption_public_key: bs58.encode(walletKeyPair.publicKey),
			nonce: bs58.encode(nonce),
			data: bs58.encode(encrypted),
		});

		const response = await auth.handler(
			new Request(`http://localhost/api/auth/siwx/callback/backpack?${params}`),
		);

		expect(response.status).toBe(302);
		const location = response.headers.get("location");
		expect(location).toContain("/?success=true");
		expect(location).toContain("provider=backpack");
	});

	it("should use custom success redirect URL", async () => {
		const appKeyPair = nacl.box.keyPair();
		const walletKeyPair = nacl.box.keyPair();
		const walletSigningKeyPair = nacl.sign.keyPair();
		const walletPublicKey = bs58.encode(walletSigningKeyPair.publicKey);

		const payload = JSON.stringify({ public_key: walletPublicKey });
		const nonce = nacl.randomBytes(24);
		const encrypted = nacl.box(
			new TextEncoder().encode(payload),
			nonce,
			appKeyPair.publicKey,
			walletKeyPair.secretKey,
		);

		const { auth } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage() {
							return true;
						},
						callback: {
							appPublicKeyBase58: bs58.encode(appKeyPair.publicKey),
							appPrivateKeyBase58: bs58.encode(appKeyPair.secretKey),
							successRedirect: "/dashboard?auth=complete",
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		const params = new URLSearchParams({
			phantom_encryption_public_key: bs58.encode(walletKeyPair.publicKey),
			nonce: bs58.encode(nonce),
			data: bs58.encode(encrypted),
		});

		const response = await auth.handler(
			new Request(`http://localhost/api/auth/siwx/callback/phantom?${params}`),
		);

		expect(response.status).toBe(302);
		const location = response.headers.get("location");
		expect(location).toContain("/dashboard?auth=complete");
	});

	it("should return same user for callback as regular verify", async () => {
		const appKeyPair = nacl.box.keyPair();
		const walletKeyPair = nacl.box.keyPair();
		const walletSigningKeyPair = nacl.sign.keyPair();
		const walletPublicKey = bs58.encode(walletSigningKeyPair.publicKey);

		const { client, auth } = await getTestInstance(
			{
				plugins: [
					siwx({
						domain,
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage() {
							return true;
						},
						callback: {
							appPublicKeyBase58: bs58.encode(appKeyPair.publicKey),
							appPrivateKeyBase58: bs58.encode(appKeyPair.secretKey),
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siwxClient()],
				},
			},
		);

		await client.siwx.nonce({
			address: walletPublicKey,
			chainType: "solana",
		});

		const verifyResult = await client.siwx.verify({
			message: "Sign in message",
			signature: "valid_solana_signature",
			address: walletPublicKey,
			chainType: "solana",
		});

		const userId = verifyResult.data?.user.id;

		const payload = JSON.stringify({ public_key: walletPublicKey });
		const nonce = nacl.randomBytes(24);
		const encrypted = nacl.box(
			new TextEncoder().encode(payload),
			nonce,
			appKeyPair.publicKey,
			walletKeyPair.secretKey,
		);

		const params = new URLSearchParams({
			phantom_encryption_public_key: bs58.encode(walletKeyPair.publicKey),
			nonce: bs58.encode(nonce),
			data: bs58.encode(encrypted),
		});

		const callbackResponse = await auth.handler(
			new Request(`http://localhost/api/auth/siwx/callback/phantom?${params}`),
		);

		expect(callbackResponse.status).toBe(302);

		const allAccounts = await (await auth.$context).adapter.findMany<{
			userId: string;
			accountId: string;
		}>({
			model: "account",
			where: [{ field: "providerId", operator: "eq", value: "siwx" }],
		});

		const accountsForWallet = allAccounts.filter((acc) =>
			acc.accountId.includes(walletPublicKey),
		);

		expect(accountsForWallet.length).toBeGreaterThan(0);
		expect(accountsForWallet[0]?.userId).toBe(userId);
	});
});
