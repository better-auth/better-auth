import { describe, it, expect, vi, beforeEach } from "vitest";
import { base, BASE_MAINNET_CHAIN_ID } from "./index";
import { baseClient } from "./client";

describe("Base Plugin", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("base plugin", () => {
		it("should create base plugin with default options", () => {
			const plugin = base();

			expect(plugin).toBeDefined();
			expect(plugin.id).toBe("siwe"); // Uses SIWE under the hood
		});

		it("should create base plugin with custom options", () => {
			const plugin = base({
				domain: "example.com",
				anonymous: false,
				emailDomainName: "custom.com",
			});

			expect(plugin).toBeDefined();
		});

		it("should use Base Mainnet chain ID constant", () => {
			expect(BASE_MAINNET_CHAIN_ID).toBe(8453);
		});
	});

	describe("baseClient", () => {
		it("should create base client plugin", () => {
			const clientPlugin = baseClient();

			expect(clientPlugin).toBeDefined();
			expect(clientPlugin.id).toBe("base");
			expect(clientPlugin.$InferServerPlugin).toBeDefined();
		});

		it("should handle missing Base Account SDK gracefully", async () => {
			const { getBaseProvider } = await import("./client");

			try {
				await getBaseProvider();
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toContain(
					"Base Account SDK not found",
				);
			}
		});

		it("should check Base Account support", async () => {
			const { isBaseAccountSupported } = await import("./client");

			const isSupported = await isBaseAccountSupported();
			expect(typeof isSupported).toBe("boolean");
		});
	});

	describe("Base constants and errors", () => {
		it("should export correct Base chain ID", () => {
			expect(BASE_MAINNET_CHAIN_ID).toBe(8453);
		});
	});
});
