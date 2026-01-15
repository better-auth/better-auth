import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	__resetStripeCache,
	createStripeEmbeddedCheckout,
	mountEmbeddedCheckout,
} from "../src/embedded-checkout";

// Mock document and window for browser environment
const mockContainer = {
	innerHTML: "",
	querySelector: vi.fn(),
};

const mockDocument = {
	createElement: vi.fn(() => ({
		src: "",
		async: false,
		onload: null as (() => void) | null,
		onerror: null as (() => void) | null,
	})),
	querySelector: vi.fn((selector: string) => {
		if (selector === "#checkout-container") {
			return mockContainer;
		}
		return null;
	}),
	getElementById: vi.fn((id: string) => {
		if (id === "checkout-container") {
			return mockContainer;
		}
		return null;
	}),
	head: {
		appendChild: vi.fn(),
	},
};

describe("embedded-checkout", () => {
	// Mock Stripe instance
	const mockCheckoutInstance = {
		mount: vi.fn(),
		unmount: vi.fn(),
		destroy: vi.fn(),
	};

	const mockStripeInstance = {
		initEmbeddedCheckout: vi.fn().mockResolvedValue(mockCheckoutInstance),
	};

	const mockStripeConstructor = vi.fn(() => mockStripeInstance);

	// Store original globals
	const originalWindow = globalThis.window;
	const originalDocument = globalThis.document;

	beforeEach(() => {
		vi.clearAllMocks();
		mockContainer.innerHTML = "";
		// Reset the Stripe cache to ensure fresh instance for each test
		__resetStripeCache();

		// Mock window and document
		(globalThis as any).window = {
			Stripe: mockStripeConstructor,
		};
		(globalThis as any).document = mockDocument;
	});

	afterEach(() => {
		// Restore original globals
		(globalThis as any).window = originalWindow;
		(globalThis as any).document = originalDocument;
	});

	describe("createStripeEmbeddedCheckout", () => {
		it("should create a checkout instance", () => {
			const checkout = createStripeEmbeddedCheckout({
				publishableKey: "pk_test_123",
			});

			expect(checkout).toBeDefined();
			expect(checkout.mount).toBeInstanceOf(Function);
			expect(checkout.unmount).toBeInstanceOf(Function);
			expect(checkout.destroy).toBeInstanceOf(Function);
			expect(checkout.isMounted).toBeInstanceOf(Function);
			expect(checkout.getStripe).toBeInstanceOf(Function);
		});

		it("should mount checkout with clientSecret", async () => {
			const checkout = createStripeEmbeddedCheckout({
				publishableKey: "pk_test_123",
			});

			await checkout.mount({
				clientSecret: "cs_test_secret",
				container: "#checkout-container",
			});

			expect(mockStripeConstructor).toHaveBeenCalledWith("pk_test_123", {
				stripeAccount: undefined,
				locale: undefined,
				betas: undefined,
			});
			expect(mockStripeInstance.initEmbeddedCheckout).toHaveBeenCalledWith({
				clientSecret: "cs_test_secret",
				onComplete: undefined,
			});
			expect(mockCheckoutInstance.mount).toHaveBeenCalled();
			expect(checkout.isMounted()).toBe(true);
		});

		it("should call onComplete callback", async () => {
			const onComplete = vi.fn();
			const checkout = createStripeEmbeddedCheckout({
				publishableKey: "pk_test_123",
				onComplete,
			});

			await checkout.mount({
				clientSecret: "cs_test_secret",
				container: "#checkout-container",
			});

			expect(mockStripeInstance.initEmbeddedCheckout).toHaveBeenCalledWith({
				clientSecret: "cs_test_secret",
				onComplete,
			});
		});

		it("should override onComplete in mount options", async () => {
			const globalOnComplete = vi.fn();
			const mountOnComplete = vi.fn();
			const checkout = createStripeEmbeddedCheckout({
				publishableKey: "pk_test_123",
				onComplete: globalOnComplete,
			});

			await checkout.mount({
				clientSecret: "cs_test_secret",
				container: "#checkout-container",
				onComplete: mountOnComplete,
			});

			expect(mockStripeInstance.initEmbeddedCheckout).toHaveBeenCalledWith({
				clientSecret: "cs_test_secret",
				onComplete: mountOnComplete,
			});
		});

		it("should unmount checkout", async () => {
			const checkout = createStripeEmbeddedCheckout({
				publishableKey: "pk_test_123",
			});

			await checkout.mount({
				clientSecret: "cs_test_secret",
				container: "#checkout-container",
			});

			expect(checkout.isMounted()).toBe(true);

			checkout.unmount();

			expect(mockCheckoutInstance.unmount).toHaveBeenCalled();
			expect(checkout.isMounted()).toBe(false);
		});

		it("should destroy checkout", async () => {
			const checkout = createStripeEmbeddedCheckout({
				publishableKey: "pk_test_123",
			});

			await checkout.mount({
				clientSecret: "cs_test_secret",
				container: "#checkout-container",
			});

			checkout.destroy();

			expect(mockCheckoutInstance.destroy).toHaveBeenCalled();
			expect(checkout.isMounted()).toBe(false);
		});

		it("should throw error when clientSecret is missing", async () => {
			const checkout = createStripeEmbeddedCheckout({
				publishableKey: "pk_test_123",
			});

			await expect(
				checkout.mount({
					clientSecret: "",
					container: "#checkout-container",
				}),
			).rejects.toThrow("clientSecret is required");
		});

		it("should throw error when container is not found", async () => {
			const checkout = createStripeEmbeddedCheckout({
				publishableKey: "pk_test_123",
			});

			await expect(
				checkout.mount({
					clientSecret: "cs_test_secret",
					container: "#non-existent",
				}),
			).rejects.toThrow("Container element not found");
		});

		it("should pass stripeAccount option", async () => {
			const checkout = createStripeEmbeddedCheckout({
				publishableKey: "pk_test_123",
				stripeAccount: "acct_123",
			});

			await checkout.mount({
				clientSecret: "cs_test_secret",
				container: "#checkout-container",
			});

			expect(mockStripeConstructor).toHaveBeenCalledWith("pk_test_123", {
				stripeAccount: "acct_123",
				locale: undefined,
				betas: undefined,
			});
		});

		it("should pass locale option", async () => {
			const checkout = createStripeEmbeddedCheckout({
				publishableKey: "pk_test_123",
				locale: "de",
			});

			await checkout.mount({
				clientSecret: "cs_test_secret",
				container: "#checkout-container",
			});

			expect(mockStripeConstructor).toHaveBeenCalledWith("pk_test_123", {
				stripeAccount: undefined,
				locale: "de",
				betas: undefined,
			});
		});

		it("should accept object as container", async () => {
			const checkout = createStripeEmbeddedCheckout({
				publishableKey: "pk_test_123",
			});

			const containerObj = { innerHTML: "" };

			await checkout.mount({
				clientSecret: "cs_test_secret",
				container: containerObj as unknown as HTMLElement,
			});

			expect(mockCheckoutInstance.mount).toHaveBeenCalled();
		});

		it("should destroy previous instance when remounting", async () => {
			const checkout = createStripeEmbeddedCheckout({
				publishableKey: "pk_test_123",
			});

			await checkout.mount({
				clientSecret: "cs_test_secret_1",
				container: "#checkout-container",
			});

			// Mount again with different secret
			await checkout.mount({
				clientSecret: "cs_test_secret_2",
				container: "#checkout-container",
			});

			expect(mockCheckoutInstance.destroy).toHaveBeenCalled();
			expect(mockStripeInstance.initEmbeddedCheckout).toHaveBeenCalledTimes(2);
		});

		it("should return Stripe instance from getStripe", async () => {
			const checkout = createStripeEmbeddedCheckout({
				publishableKey: "pk_test_123",
			});

			const stripe = await checkout.getStripe();

			expect(stripe).toBe(mockStripeInstance);
		});
	});

	describe("mountEmbeddedCheckout", () => {
		it("should mount checkout in a single call", async () => {
			const checkout = await mountEmbeddedCheckout({
				publishableKey: "pk_test_123",
				clientSecret: "cs_test_secret",
				container: "#checkout-container",
			});

			expect(mockStripeInstance.initEmbeddedCheckout).toHaveBeenCalled();
			expect(mockCheckoutInstance.mount).toHaveBeenCalled();
			expect(checkout.isMounted()).toBe(true);
		});

		it("should pass onComplete to convenience function", async () => {
			const onComplete = vi.fn();

			await mountEmbeddedCheckout({
				publishableKey: "pk_test_123",
				clientSecret: "cs_test_secret",
				container: "#checkout-container",
				onComplete,
			});

			expect(mockStripeInstance.initEmbeddedCheckout).toHaveBeenCalledWith({
				clientSecret: "cs_test_secret",
				onComplete,
			});
		});
	});
});
