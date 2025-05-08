import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { siwe } from "./index";
import { siweClientPlugin } from "./client";
import { SiweMessage } from "siwe";

describe("siwe", async (it) => {
	const walletAddress = "0x1EBfa830CEcf15b8B3b3832C0a2F997386C0c1A7";
	const domain = "example.com";

	const { client } = await getTestInstance(
		{
			plugins: [siwe({ domain })],
		},
		{
			clientOptions: {
				plugins: [siweClientPlugin()],
			},
		},
	);

	const { data } = await client.siwe.nonce({ walletAddress });

	if (!data?.nonce) throw new Error("No nonce found");

	const message = new SiweMessage({
		domain,
		address: walletAddress,
		statement: "Sign in with Ethereum to the app.",
		uri: "https://example.com",
		version: "1",
		chainId: 1,
		nonce: data.nonce,
		issuedAt: new Date().toISOString(),
	}).toMessage();

	it("should generate a valid nonce for a valid public key", async () => {
		const { data } = await client.siwe.nonce({ walletAddress });
		// to be of type string
		expect(typeof data?.nonce).toBe("string");
		// to be 17 alphanumeric characters (96 bits of entropy)
		expect(data?.nonce).toMatch(/^[a-zA-Z0-9]{17}$/);
	});

	it("should reject invalid public key", async () => {
		const { error } = await client.siwe.nonce({ walletAddress: "invalid" });
		expect(error).toBeDefined();
	});

	it("should reject verification with invalid signature", async () => {
		const { error } = await client.siwe.verify({
			message,
			signature: "invalid_signature",
			walletAddress,
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
	});

	it("should reject verification with expired or missing nonce", async () => {
		const { error } = await client.siwe.verify({
			message,
			signature: "valid_signature",
			walletAddress,
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
	});

	it("should reject invalid walletAddress format", async () => {
		const { error } = await client.siwe.nonce({
			walletAddress: "not_a_valid_key",
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(400);
	});

	it("should reject invalid message", async () => {
		const { error } = await client.siwe.verify({
			message: "invalid_message",
			signature: "valid_signature",
			walletAddress,
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(500);
	});
});
