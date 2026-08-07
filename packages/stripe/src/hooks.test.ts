import { describe, expect, it, vi } from "vitest";
import { onCheckoutSessionCompleted } from "./hooks"; // Adjust path

describe("onCheckoutSessionCompleted", () => {
	it("should return early for 'payment' mode sessions without calling subscription retrieve", async () => {
		// 1. Mock the client
		const mockRetrieve = vi.fn();
		const mockOptions = {
			stripeClient: {
				subscriptions: { retrieve: mockRetrieve },
			},
			subscription: {
				enabled: true,
			},
		} as any;

		// 2. Mock the context
		const mockCtx = {
			context: { logger: { error: vi.fn(), warn: vi.fn() } },
		} as any;

		// 3. Mock the event (The core of the problem)
		const mockEvent = {
			type: "checkout.session.completed",
			data: {
				object: {
					mode: "payment",
					subscription: null,
				},
			},
		} as any;

		// 4. Execute
		await onCheckoutSessionCompleted(mockCtx, mockOptions, mockEvent);

		// 5. Assertions
		// If the bug is fixed, retrieve should NEVER be called
		expect(mockRetrieve).not.toHaveBeenCalled();

		// Ensure no errors were logged (meaning it didn't crash)
		expect(mockCtx.context.logger.error).not.toHaveBeenCalled();
	});
});
