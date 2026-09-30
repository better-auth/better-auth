import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({
	lookup: vi.fn(),
	resolve4: vi.fn(),
	resolve6: vi.fn(),
}));
vi.mock("node:dns/promises", () => dns);

import { assertPublicFetchTarget, fetchPublicResponse } from "./public-fetch";

/**
 * @see https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/
 * @see https://nodejs.org/api/dns.html#dns_error_codes
 * @see https://github.com/cloudflare/workerd/blob/82b85cf9f6de50c921b83a4d3b8a005ced8b513a/src/node/internal/internal_dns.ts
 */
describe("public-host validation with record resolvers", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		dns.lookup.mockRejectedValue(new Error("Not implemented"));
		dns.resolve4.mockResolvedValue(["93.184.216.34"]);
		dns.resolve6.mockResolvedValue(["2606:4700:4700::1111"]);
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("fetches an ordinary public hostname when lookup is unsupported", async () => {
		const transport = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("ok"));
		await expect(
			fetchPublicResponse(
				"https://idp.example/document",
				{},
				{
					isTrustedOrigin: () => false,
				},
			),
		).resolves.toMatchObject({ status: 200 });
		expect(dns.resolve4).toHaveBeenCalledWith("idp.example");
		expect(dns.resolve6).toHaveBeenCalledWith("idp.example");
		expect(transport).toHaveBeenCalledWith("https://idp.example/document", {
			redirect: "manual",
		});
	});

	it("accepts an IPv4-only host when AAAA has no answer", async () => {
		dns.resolve6.mockRejectedValue({ code: "ENODATA" });
		await expect(
			assertPublicFetchTarget("https://idp.example"),
		).resolves.toBeUndefined();
	});

	it("checks IP answers without treating returned aliases as addresses", async () => {
		dns.resolve4.mockResolvedValue(["cdn.example.", "93.184.216.34"]);
		await expect(
			assertPublicFetchTarget("https://idp.example"),
		).resolves.toBeUndefined();
	});

	it("normalizes alias-bearing lookup results too", async () => {
		dns.lookup.mockResolvedValue([
			{ address: "cdn.example" },
			{ address: "93.184.216.34" },
		]);
		await expect(
			assertPublicFetchTarget("https://idp.example"),
		).resolves.toBeUndefined();
		expect(dns.resolve4).not.toHaveBeenCalled();
	});

	it("rejects private IPs even when an alias and public IP are present", async () => {
		dns.resolve4.mockResolvedValue([
			"cdn.example",
			"93.184.216.34",
			"10.0.0.4",
		]);
		await expect(
			assertPublicFetchTarget("https://idp.example"),
		).rejects.toMatchObject({ code: "ssrf_private_host" });
	});

	it("rejects malformed records despite another public answer", async () => {
		dns.resolve4.mockResolvedValue(["invalid answer!", "93.184.216.34"]);
		await expect(
			assertPublicFetchTarget("https://idp.example"),
		).rejects.toMatchObject({ code: "ssrf_dns_lookup_failed" });
	});

	it.each([
		"8.8.8.8:443",
		"[2606:4700:4700::1111]",
		" 8.8.8.8",
		"fe80::1%eth0",
	])("refuses non-DNS IP syntax %s", async (address) => {
		dns.lookup.mockResolvedValue([{ address }, { address: "93.184.216.34" }]);
		await expect(
			assertPublicFetchTarget("https://idp.example"),
		).rejects.toMatchObject({ code: "ssrf_dns_lookup_failed" });
	});

	it("accepts an IPv6-only host when A has no answer", async () => {
		dns.resolve4.mockRejectedValue({ code: "ENOTFOUND" });
		await expect(
			assertPublicFetchTarget("https://idp.example"),
		).resolves.toBeUndefined();
	});

	it.each([
		"127.0.0.1",
		"10.0.0.4",
		"169.254.169.254",
		"fd00::1",
		"fe80::1",
	])("rejects a non-public answer %s before fetching", async (address) => {
		dns.resolve6.mockResolvedValue([address]);
		const transport = vi.spyOn(globalThis, "fetch");
		await expect(
			fetchPublicResponse(
				"https://idp.example",
				{},
				{ isTrustedOrigin: () => false },
			),
		).rejects.toMatchObject({
			code: "ssrf_private_host",
			resolvedAddress: address,
		});
		expect(transport).not.toHaveBeenCalled();
	});

	it("refuses a transient family failure despite another public answer", async () => {
		dns.resolve6.mockRejectedValue({ code: "ESERVFAIL" });
		await expect(
			assertPublicFetchTarget("https://idp.example"),
		).rejects.toMatchObject({ code: "ssrf_dns_lookup_failed" });
	});

	it("does not retry a normal system lookup failure through another resolver", async () => {
		dns.lookup.mockRejectedValue({ code: "EAI_AGAIN" });
		await expect(
			assertPublicFetchTarget("https://idp.example"),
		).rejects.toMatchObject({ code: "ssrf_dns_lookup_failed" });
		expect(dns.resolve4).not.toHaveBeenCalled();
	});

	it.each([
		{ addresses: [] },
		{ addresses: ["not-an-address"] },
	])("refuses empty or non-address results %j", async ({ addresses }) => {
		dns.resolve4.mockResolvedValue(addresses);
		dns.resolve6.mockResolvedValue([]);
		await expect(
			assertPublicFetchTarget("https://idp.example"),
		).rejects.toMatchObject({ code: "ssrf_dns_lookup_failed" });
	});

	it("bounds stalled record resolution without starting HTTP transport", async () => {
		vi.useFakeTimers();
		dns.resolve6.mockImplementation(() => new Promise(() => {}));
		const transport = vi.spyOn(globalThis, "fetch");
		const check = expect(
			fetchPublicResponse(
				"https://idp.example",
				{},
				{ isTrustedOrigin: () => false },
			),
		).rejects.toMatchObject({ code: "ssrf_dns_lookup_failed" });
		await vi.advanceTimersByTimeAsync(5000);
		await check;
		expect(transport).not.toHaveBeenCalled();
	});

	it("retains exact approved private-origin policy without resolving", async () => {
		await expect(
			assertPublicFetchTarget("http://10.0.0.4", {
				isTrustedOrigin: (url) => new URL(url).origin === "http://10.0.0.4",
			}),
		).resolves.toBeUndefined();
		expect(dns.lookup).not.toHaveBeenCalled();
		expect(dns.resolve4).not.toHaveBeenCalled();
	});
});
