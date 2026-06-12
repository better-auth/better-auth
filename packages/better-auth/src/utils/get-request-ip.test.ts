import type { BetterAuthOptions } from "@better-auth/core";
import { describe, expect, it, vi } from "vitest";
import { getIp } from "./get-request-ip";

const headersWith = (entries: Record<string, string>): Headers => {
	const h = new Headers();
	for (const [k, v] of Object.entries(entries)) h.set(k, v);
	return h;
};

const requestWith = (entries: Record<string, string>): Request =>
	new Request("https://example.com/auth/session", { headers: entries });

describe("getIp — getClientIp callback", () => {
	it("uses the callback's IP when it returns a valid IPv4", () => {
		const options: BetterAuthOptions = {
			advanced: {
				ipAddress: { getClientIp: () => "203.0.113.42" },
			},
		};
		expect(getIp(requestWith({}), options)).toBe("203.0.113.42");
	});

	it("ignores ipAddressHeaders when the callback returns a valid IP", () => {
		const callback = vi.fn(() => "203.0.113.42");
		const options: BetterAuthOptions = {
			advanced: {
				ipAddress: {
					getClientIp: callback,
					ipAddressHeaders: ["x-forwarded-for"],
				},
			},
		};
		const req = requestWith({ "x-forwarded-for": "198.51.100.1" });
		expect(getIp(req, options)).toBe("203.0.113.42");
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it("normalizes IPv6 returned by the callback using ipv6Subnet", () => {
		const options: BetterAuthOptions = {
			advanced: {
				ipAddress: {
					getClientIp: () => "2001:db8:abcd:1234:5678:9abc:def0:1234",
					ipv6Subnet: 64,
				},
			},
		};
		// /64 prefix keeps the first 64 bits; lower bits zero out.
		expect(getIp(requestWith({}), options)).toBe(
			"2001:0db8:abcd:1234:0000:0000:0000:0000",
		);
	});

	it("falls through to ipAddressHeaders when the callback returns null", () => {
		const options: BetterAuthOptions = {
			advanced: {
				ipAddress: {
					getClientIp: () => null,
					ipAddressHeaders: ["x-real-ip"],
				},
			},
		};
		const req = requestWith({ "x-real-ip": "198.51.100.7" });
		expect(getIp(req, options)).toBe("198.51.100.7");
	});

	it("falls through when the callback returns undefined", () => {
		const options: BetterAuthOptions = {
			advanced: {
				ipAddress: {
					getClientIp: () => undefined,
					ipAddressHeaders: ["x-real-ip"],
				},
			},
		};
		const req = requestWith({ "x-real-ip": "198.51.100.8" });
		expect(getIp(req, options)).toBe("198.51.100.8");
	});

	it("falls through when the callback returns a non-IP string", () => {
		const options: BetterAuthOptions = {
			advanced: {
				ipAddress: {
					getClientIp: () => "not-an-ip",
					ipAddressHeaders: ["x-real-ip"],
				},
			},
		};
		const req = requestWith({ "x-real-ip": "198.51.100.9" });
		expect(getIp(req, options)).toBe("198.51.100.9");
	});

	it("falls through when the callback returns an empty string", () => {
		const options: BetterAuthOptions = {
			advanced: {
				ipAddress: {
					getClientIp: () => "",
					ipAddressHeaders: ["x-real-ip"],
				},
			},
		};
		const req = requestWith({ "x-real-ip": "198.51.100.10" });
		expect(getIp(req, options)).toBe("198.51.100.10");
	});

	it("does not invoke the callback when disableIpTracking is true", () => {
		const callback = vi.fn(() => "203.0.113.42");
		const options: BetterAuthOptions = {
			advanced: {
				ipAddress: { getClientIp: callback, disableIpTracking: true },
			},
		};
		expect(getIp(requestWith({}), options)).toBeNull();
		expect(callback).not.toHaveBeenCalled();
	});

	it("passes the original Request through to the callback", () => {
		const callback = vi.fn((req: Request | Headers) => {
			if (req instanceof Request) return "203.0.113.99";
			return null;
		});
		const options: BetterAuthOptions = {
			advanced: { ipAddress: { getClientIp: callback } },
		};
		const req = requestWith({});
		expect(getIp(req, options)).toBe("203.0.113.99");
		expect(callback).toHaveBeenCalledWith(req);
	});

	it("passes Headers through when the caller only has Headers", () => {
		const callback = vi.fn((req: Request | Headers) => {
			if (req instanceof Headers) return "203.0.113.50";
			return null;
		});
		const options: BetterAuthOptions = {
			advanced: { ipAddress: { getClientIp: callback } },
		};
		const headers = headersWith({});
		expect(getIp(headers, options)).toBe("203.0.113.50");
		expect(callback).toHaveBeenCalledWith(headers);
	});

	it("preserves existing header-based behavior when no callback is provided", () => {
		const options: BetterAuthOptions = {
			advanced: { ipAddress: { ipAddressHeaders: ["x-forwarded-for"] } },
		};
		const req = requestWith({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" });
		expect(getIp(req, options)).toBe("198.51.100.1");
	});
});
