import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const lookup = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup }));

import {
	assertPublicFetchTarget,
	fetchPublicResource,
	SsrfRefusedError,
} from "./public-fetch";

/**
 * @see https://github.com/better-auth/better-auth
 */
describe("assertPublicFetchTarget", () => {
	beforeEach(() => {
		lookup.mockReset();
	});

	it("rejects a literal private host", async () => {
		await expect(
			assertPublicFetchTarget("http://169.254.169.254/latest/meta-data"),
		).rejects.toMatchObject({ code: "ssrf_private_host" });
		expect(lookup).not.toHaveBeenCalled();
	});

	it("skips the gate when trustedOrigins returns true", async () => {
		await expect(
			assertPublicFetchTarget("http://10.0.0.5/internal", {
				trustedOrigins: () => true,
			}),
		).resolves.toBeUndefined();
		expect(lookup).not.toHaveBeenCalled();
	});

	it("skips DNS resolution for a public IP literal", async () => {
		await expect(
			assertPublicFetchTarget("https://93.184.216.34/"),
		).resolves.toBeUndefined();
		expect(lookup).not.toHaveBeenCalled();
	});

	it("rejects an FQDN that resolves to a loopback address", async () => {
		lookup.mockResolvedValueOnce([{ address: "127.0.0.1" }]);

		await expect(
			assertPublicFetchTarget("https://attacker.example/"),
		).rejects.toMatchObject({
			code: "ssrf_private_host",
			resolvedAddress: "127.0.0.1",
		});
		expect(lookup).toHaveBeenCalledWith("attacker.example", { all: true });
	});

	it("rejects an FQDN that resolves to the cloud metadata address", async () => {
		lookup.mockResolvedValueOnce([{ address: "169.254.169.254" }]);

		await expect(
			assertPublicFetchTarget("https://metadata.attacker.example/"),
		).rejects.toMatchObject({
			code: "ssrf_private_host",
			resolvedAddress: "169.254.169.254",
		});
	});

	it("resolves for an FQDN that resolves to a public address", async () => {
		lookup.mockResolvedValueOnce([{ address: "93.184.216.34" }]);

		await expect(
			assertPublicFetchTarget("https://example.com/"),
		).resolves.toBeUndefined();
	});

	it("throws ssrf_invalid_url for a non-http(s) scheme", async () => {
		await expect(
			assertPublicFetchTarget("file:///etc/passwd"),
		).rejects.toMatchObject({ code: "ssrf_invalid_url" });
	});

	it("throws ssrf_invalid_url for a malformed URL", async () => {
		await expect(assertPublicFetchTarget("not a url")).rejects.toMatchObject({
			code: "ssrf_invalid_url",
		});
	});
});

/**
 * @see https://github.com/better-auth/better-auth
 */
describe("fetchPublicResource refuses redirects", () => {
	const originalFetch = globalThis.fetch;
	const mockedFetch = vi.fn() as unknown as typeof fetch &
		ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockedFetch.mockReset();
		globalThis.fetch = mockedFetch;
		lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	it("rejects a 302 from the endpoint and never follows it", async () => {
		mockedFetch.mockResolvedValueOnce(
			new Response("", {
				status: 302,
				headers: { location: "http://169.254.169.254/" },
			}),
		);

		await expect(
			fetchPublicResource("https://idp.example/token", { method: "POST" }),
		).rejects.toThrow(/refuse redirects to prevent SSRF/);

		expect(mockedFetch).toHaveBeenCalledTimes(1);
		const init = mockedFetch.mock.calls[0]?.[1] as RequestInit | undefined;
		expect(init?.redirect).toBe("manual");
	});

	it("throws the redirect-specific error when betterFetch throw mode is enabled", async () => {
		mockedFetch.mockResolvedValueOnce(
			new Response("", {
				status: 302,
				headers: { location: "http://169.254.169.254/" },
			}),
		);

		await expect(
			fetchPublicResource("https://idp.example/token", { throw: true }),
		).rejects.toThrow(/refuse redirects to prevent SSRF/);
	});

	it("preserves caller onError handlers for non-redirect errors", async () => {
		const onError = vi.fn();
		mockedFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "invalid_client" }), {
				status: 401,
				headers: { "content-type": "application/json" },
			}),
		);

		const result = await fetchPublicResource("https://idp.example/token", {
			onError,
		});

		expect(result.error).toBeDefined();
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0]?.[0].response.status).toBe(401);
	});

	it("refuses the fetch before connecting when the host is private", async () => {
		await expect(
			fetchPublicResource("http://10.0.0.5/token", {
				method: "POST",
				trustedOrigins: () => false,
			}),
		).rejects.toBeInstanceOf(SsrfRefusedError);
		expect(mockedFetch).not.toHaveBeenCalled();
	});
});
