import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BetterAuthError } from "../error";

const lookup = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup }));

import {
	assertPublicFetchTarget,
	createSsrfRefusedError,
	fetchPublicResource,
	isSsrfRefusedError,
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

	it("skips the gate when isTrustedOrigin returns true", async () => {
		await expect(
			assertPublicFetchTarget("http://10.0.0.5/internal", {
				isTrustedOrigin: () => true,
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

	it("fails closed when DNS lookup fails for an FQDN", async () => {
		lookup.mockRejectedValueOnce(new Error("lookup failed"));

		await expect(
			assertPublicFetchTarget("https://unresolvable.example/"),
		).rejects.toMatchObject({
			code: "ssrf_dns_lookup_failed",
			url: "https://unresolvable.example/",
		});
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
				isTrustedOrigin: () => false,
			}),
		).rejects.toMatchObject({
			name: "SsrfRefusedError",
			code: "ssrf_private_host",
			url: "http://10.0.0.5/token",
		});
		expect(mockedFetch).not.toHaveBeenCalled();
	});
});

describe("typed fetch-refusal errors", () => {
	it.each([
		"ssrf_invalid_url",
		"ssrf_private_host",
		"ssrf_dns_lookup_failed",
		"ssrf_redirect_refused",
	] as const)("recognizes %s without requiring a new error subclass", (code) => {
		const error = createSsrfRefusedError(
			code,
			"Refused",
			"https://idp.example",
		);
		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(BetterAuthError);
		expect(isSsrfRefusedError(error)).toBe(true);
		expect(error.message).toBe("Refused");
		expect(error.code).toBe(code);
		expect(error.url).toBe("https://idp.example");
		expect(error.resolvedAddress).toBeUndefined();
	});

	it("preserves the resolved address used by SSO error mapping", () => {
		const error = createSsrfRefusedError(
			"ssrf_private_host",
			"Refused",
			"https://idp.example",
			"10.0.0.5",
		);
		expect(isSsrfRefusedError(error)).toBe(true);
		expect(error.resolvedAddress).toBe("10.0.0.5");
	});

	it("rejects unrelated errors and malformed refusal metadata", () => {
		const details = {
			name: "SsrfRefusedError",
			code: "ssrf_private_host",
			url: "https://idp.example",
		};
		expect(isSsrfRefusedError(new Error("Unrelated"))).toBe(false);
		expect(isSsrfRefusedError(details)).toBe(false);
		expect(
			isSsrfRefusedError(
				Object.assign(new Error("Refused"), details, { code: "unknown" }),
			),
		).toBe(false);
		expect(
			isSsrfRefusedError(
				Object.assign(new Error("Refused"), details, { url: 1 }),
			),
		).toBe(false);
		expect(
			isSsrfRefusedError(
				Object.assign(new Error("Refused"), details, { resolvedAddress: 1 }),
			),
		).toBe(false);
	});
});
