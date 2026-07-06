import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshAccessToken } from "./refresh-access-token";

/**
 * Exercises the real `betterFetch` (only `globalThis.fetch` is mocked) to prove
 * the control end to end: a redirecting token endpoint is rejected and the
 * redirect is never followed to the internal host.
 */
describe("server-side OAuth fetch refuses redirects via real betterFetch", () => {
	const originalFetch = globalThis.fetch;
	const mockedFetch = vi.fn() as unknown as typeof fetch &
		ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockedFetch.mockReset();
		globalThis.fetch = mockedFetch;
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	it("rejects a 302 from the token endpoint and never follows it", async () => {
		mockedFetch.mockResolvedValueOnce(
			new Response("", {
				status: 302,
				headers: { location: "http://169.254.169.254/" },
			}),
		);

		await expect(
			refreshAccessToken({
				refreshToken: "refresh-token",
				options: { clientId: "client", clientSecret: "secret" },
				tokenEndpoint: "https://idp.example/token",
			}),
		).rejects.toThrow(/refuse redirects to prevent SSRF/);

		expect(mockedFetch).toHaveBeenCalledTimes(1);
		const init = mockedFetch.mock.calls[0]?.[1] as RequestInit | undefined;
		expect(init?.redirect).toBe("manual");
	});
});
