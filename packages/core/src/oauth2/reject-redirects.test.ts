import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRefusingRedirects } from "./reject-redirects";

/**
 * @see https://fetch.spec.whatwg.org/#concept-filtered-response-opaque-redirect
 */
describe("fetchRefusingRedirects", () => {
	const endpoint = "https://idp.example/token";
	const mockedFetch = vi.fn<typeof fetch>();
	beforeEach(() => {
		mockedFetch.mockReset();
		vi.stubGlobal("fetch", mockedFetch);
	});
	afterEach(() => vi.unstubAllGlobals());

	it.each([301, 302, 303, 307, 308])(
		"refuses HTTP %s without following it",
		async (status) => {
			mockedFetch.mockResolvedValueOnce(
				new Response("", {
					status,
					headers: { location: "http://internal.example" },
				}),
			);

			await expect(fetchRefusingRedirects(endpoint)).rejects.toThrow(
				/refuse redirects/,
			);
			expect(mockedFetch.mock.calls[0]?.[1]?.redirect).toBe("manual");
		},
	);

	it("refuses an opaque redirect response", async () => {
		const response = new Response("", { status: 302 });
		Object.defineProperties(response, {
			type: { value: "opaqueredirect" },
			status: { value: 0 },
		});
		mockedFetch.mockResolvedValueOnce(response);

		await expect(fetchRefusingRedirects(endpoint)).rejects.toThrow(
			/refuse redirects/,
		);
	});

	it.each([200, 304, 400, 401])(
		"preserves HTTP %s responses",
		async (status) => {
			mockedFetch.mockResolvedValueOnce(new Response(null, { status }));

			await expect(fetchRefusingRedirects(endpoint)).resolves.toBeDefined();
		},
	);

	it("preserves redirect refusal when an error callback throws", async () => {
		mockedFetch.mockResolvedValueOnce(new Response("", { status: 302 }));

		await expect(
			fetchRefusingRedirects(endpoint, {
				onError: () => {
					throw new Error("custom callback");
				},
			}),
		).rejects.toThrow(/refuse redirects/);
	});
});
