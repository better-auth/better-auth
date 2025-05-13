import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { siwe } from "./index";
import { siweClientPlugin } from "./client";

describe("siwe", async (it) => {
	const walletAddress = "0x1EBfa830CEcf15b8B3b3832C0a2F997386C0c1A7";
	const domain = "example.com";

	it("should generate a valid nonce for a valid public key", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [siwe({ 
					domain, 
					async generateSiweNonce() {
						return "A1b2C3d4E5f6G7h8J";
					},
					async verifySiweMessage(message, signature, nonce) {
						return signature === "valid_signature" && message === "valid_message";
					},
				})],
			},
			{
				clientOptions: {
					plugins: [siweClientPlugin()],
				},
			},
		);
		const { data } = await client.siwe.nonce({ walletAddress });
		// to be of type string
		expect(typeof data?.nonce).toBe("string");
		// to be 17 alphanumeric characters (96 bits of entropy)
		expect(data?.nonce).toMatch(/^[a-zA-Z0-9]{17}$/);
	});

	it("should reject verification if nonce is missing", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [siwe({ 
					domain, 
					async generateSiweNonce() {
						return "A1b2C3d4E5f6G7h8J";
					},
					async verifySiweMessage(message, signature, nonce) {
						return signature === "valid_signature" && message === "valid_message";
					},
				})],
			},
			{
				clientOptions: {
					plugins: [siweClientPlugin()],
				},
			},
		);
		const { error } = await client.siwe.verify({
			message: "valid_message",
			signature: "valid_signature",
			walletAddress,
		});

		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
		expect(error?.code).toBe("UNAUTHORIZED_INVALID_OR_EXPIRED_NONCE");
		expect(error?.message).toMatch(/nonce/i);
	});

	it("should reject invalid public key", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [siwe({ 
					domain, 
					async generateSiweNonce() {
						return "A1b2C3d4E5f6G7h8J";
					},
					async verifySiweMessage(message, signature, nonce) {
						return signature === "valid_signature" && message === "valid_message";
					},
				})],
			},
			{
				clientOptions: {
					plugins: [siweClientPlugin()],
				},
			},
		);
		const { error } = await client.siwe.nonce({ walletAddress: "invalid" });
		expect(error).toBeDefined();
		expect(error?.status).toBe(400);
		expect(error?.message).toBe("Invalid body parameters");
	});

	it("should reject verification with invalid signature", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [siwe({ 
					domain, 
					async generateSiweNonce() {
						return "A1b2C3d4E5f6G7h8J";
					},
					async verifySiweMessage(message, signature, nonce) {
						return signature === "valid_signature" && message === "valid_message";
					},
				})],
			},
			{
				clientOptions: {
					plugins: [siweClientPlugin()],
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
				plugins: [siwe({ 
					domain, 
					async generateSiweNonce() {
						return "A1b2C3d4E5f6G7h8J";
					},
					async verifySiweMessage(message, signature, nonce) {
						return signature === "valid_signature" && message === "valid_message";
					},
				})],
			},
			{
				clientOptions: {
					plugins: [siweClientPlugin()],
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
				plugins: [siwe({ 
					domain, 
					async generateSiweNonce() {
						return "A1b2C3d4E5f6G7h8J";
					},
					async verifySiweMessage(message, signature, nonce) {
						return signature === "valid_signature" && message === "valid_message";
					},
				})],
			},
			{
				clientOptions: {
					plugins: [siweClientPlugin()],
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
				plugins: [siwe({ 
					domain,
					anonymous: false,
					async generateSiweNonce() {
						return "A1b2C3d4E5f6G7h8J";
					},
					async verifySiweMessage(message, signature, nonce) {
						return signature === "valid_signature" && message === "valid_message";
					},
				})],
			},
			{
				clientOptions: {
					plugins: [siweClientPlugin()],
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
		expect(error?.message).toBe("Invalid body parameters");
	});

	it("should accept verification with email when anonymous is false", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [siwe({ 
					domain,
					anonymous: false,
					async generateSiweNonce() {
						return "A1b2C3d4E5f6G7h8J";
					},
					async verifySiweMessage(message, signature, nonce) {
						return signature === "valid_signature" && message === "valid_message";
					},
				})],
			},
			{
				clientOptions: {
					plugins: [siweClientPlugin()],
				},
			},
		);

		await client.siwe.nonce({ walletAddress });

		const { data, error } = await client.siwe.verify({
			message: "valid_message",
			signature: "valid_signature",
			walletAddress,
			email: "user@example.com",
		});
		expect(error).toBeNull();
		expect(data?.success).toBe(true);
	});

	it("should reject invalid email format when anonymous is false", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [siwe({ 
					domain,
					anonymous: false,
					async generateSiweNonce() {
						return "A1b2C3d4E5f6G7h8J";
					},
					async verifySiweMessage(message, signature, nonce) {
						return signature === "valid_signature" && message === "valid_message";
					},
				})],
			},
			{
				clientOptions: {
					plugins: [siweClientPlugin()],
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
		expect(error?.message).toBe("Invalid body parameters");
	});

	it("should allow verification without email when anonymous is true", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [siwe({ 
					domain,
					// anonymous: true by default
					async generateSiweNonce() {
						return "A1b2C3d4E5f6G7h8J";
					},
					async verifySiweMessage(message, signature, nonce) {
						return signature === "valid_signature" && message === "valid_message";
					},
				})],
			},
			{
				clientOptions: {
					plugins: [siweClientPlugin()],
				},
			},
		);

		await client.siwe.nonce({ walletAddress });
		const { data, error } = await client.siwe.verify({
			message: "valid_message",
			signature: "valid_signature",
			walletAddress,
		});
		expect(error).toBeNull();
		expect(data?.success).toBe(true);
	});

	it("should not allow nonce reuse", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [siwe({
					domain,
					async generateSiweNonce() { return "A1b2C3d4E5f6G7h8J"; },
					async verifySiweMessage(message, signature, nonce) {
						return signature === "valid_signature" && message === "valid_message";
					},
				})],
			},
			{
				clientOptions: { plugins: [siweClientPlugin()] },
			},
		);

		await client.siwe.nonce({ walletAddress });
		const first = await client.siwe.verify({
			message: "valid_message",
			signature: "valid_signature",
			walletAddress,
		});
		expect(first.error).toBeNull();
		expect(first.data?.success).toBe(true);

		// Try to verify again with the same nonce
		const second = await client.siwe.verify({
			message: "valid_message",
			signature: "valid_signature",
			walletAddress,
		});
		expect(second.error).toBeDefined();
		expect(second.error?.status).toBe(401);
		expect(second.error?.code).toBe("UNAUTHORIZED_INVALID_OR_EXPIRED_NONCE");
	});

	it("should reject empty string email when anonymous is false", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [siwe({
					domain,
					anonymous: false,
					async generateSiweNonce() { return "A1b2C3d4E5f6G7h8J"; },
					async verifySiweMessage(message, signature, nonce) {
						return signature === "valid_signature" && message === "valid_message";
					},
				})],
			},
			{
				clientOptions: { plugins: [siweClientPlugin()] },
			},
		);

		await client.siwe.nonce({ walletAddress });
		const { error } = await client.siwe.verify({
			message: "valid_message",
			signature: "valid_signature",
			walletAddress,
			email: "",
		});
		expect(error).toBeDefined();
		expect(error?.status).toBe(400);
		expect(error?.message).toBe("Invalid body parameters");
	});

});
