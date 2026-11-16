import { expect, it, vi } from "vitest";
import { createTelemetry } from "./node";
import { hashToBase64 } from "./utils/hash";

vi.mock("./utils/hash", () => ({
	hashToBase64: vi.fn(async () => "anon-123"),
}));

/**
 * @see https://github.com/better-auth/better-auth/issues/12399
 */
it("initializes when the project id cannot be generated yet", async () => {
	vi.mocked(hashToBase64).mockRejectedValueOnce(
		new Error("Disallowed operation called within global scope."),
	);
	const track = vi.fn(async () => {});
	const telemetry = await createTelemetry(
		{ telemetry: { enabled: true } },
		{ customTrack: track, skipTestCheck: true },
	);
	expect(track).not.toHaveBeenCalled();

	await telemetry.publish({ type: "test-event", payload: {} });
	expect(track).toHaveBeenCalledExactlyOnceWith({
		type: "test-event",
		payload: {},
		anonymousId: "anon-123",
	});
});
