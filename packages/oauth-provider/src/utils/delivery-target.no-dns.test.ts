import { describe, expect, it, vi } from "vitest";
import { getDeliveryTargetRejection } from "./delivery-target";

vi.mock("node:dns/promises", () => {
	throw new Error("node:dns/promises is not available on this runtime");
});

/**
 * Runtimes without a resolver API keep only the hostname check.
 */
describe("getDeliveryTargetRejection without node:dns", () => {
	const signal = AbortSignal.timeout(5_000);

	it("accepts a public host name", async () => {
		await expect(
			getDeliveryTargetRejection("https://client.example.com/hook", signal),
		).resolves.toBeNull();
	});

	it("still rejects a private literal and a reserved name", async () => {
		await expect(
			getDeliveryTargetRejection("https://10.0.0.5/hook", signal),
		).resolves.toBe("points to a private or reserved address");
		await expect(
			getDeliveryTargetRejection("https://localhost/hook", signal),
		).resolves.toBe("points to a private or reserved address");
	});
});
