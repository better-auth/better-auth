import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
	vi,
} from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock(import("node:dns/promises"), () => ({ lookup: mocks.lookup }));

import type { ResolvedHostAddress } from "./resolve-host";
import { classifyResolvedHost } from "./resolve-host";

const PUBLIC_V4 = { address: "93.184.216.34", family: 4 };
const PUBLIC_V6 = { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 };
const PUBLIC_V6_FULL = {
	address: "2606:2800:0220:0001:0248:1893:25c8:1946",
	family: 6,
};

beforeEach(() => {
	mocks.lookup.mockReset();
});

afterEach(() => {
	vi.doMock("node:dns/promises", () => ({ lookup: mocks.lookup }));
	vi.resetModules();
});

describe("classifyResolvedHost", () => {
	describe("host names", () => {
		it("reports public addresses in resolver order", async () => {
			mocks.lookup.mockResolvedValue([PUBLIC_V6, PUBLIC_V4]);

			await expect(classifyResolvedHost("idp.example.com")).resolves.toEqual({
				status: "public",
				addresses: [PUBLIC_V6, PUBLIC_V4],
			});
			expect(mocks.lookup).toHaveBeenCalledWith("idp.example.com", {
				all: true,
				verbatim: true,
			});
		});

		it("types the public addresses as a non-empty list", async () => {
			mocks.lookup.mockResolvedValue([PUBLIC_V4]);

			const result = await classifyResolvedHost("idp.example.com");
			if (result.status !== "public") throw new Error("expected public");
			expectTypeOf(result.addresses).toEqualTypeOf<
				[ResolvedHostAddress, ...ResolvedHostAddress[]]
			>();
			expectTypeOf(result.addresses[0]).toEqualTypeOf<ResolvedHostAddress>();
		});

		it.each([
			["loopback", "127.0.0.1", "loopback"],
			["private", "10.0.0.5", "private"],
			["link-local", "169.254.169.254", "linkLocal"],
			["IPv6 loopback", "::1", "loopback"],
			["IPv4-mapped IPv6 loopback", "::ffff:127.0.0.1", "loopback"],
		])("reports %s as non-public", async (_label, address, kind) => {
			mocks.lookup.mockResolvedValue([
				{ address, family: address.includes(":") ? 6 : 4 },
			]);

			await expect(classifyResolvedHost("idp.example.com")).resolves.toEqual({
				status: "non-public",
				address,
				kind,
			});
		});

		it("reports the first offending address of a mixed answer", async () => {
			mocks.lookup.mockResolvedValue([
				PUBLIC_V4,
				{ address: "10.0.0.5", family: 4 },
				{ address: "127.0.0.1", family: 4 },
			]);

			await expect(classifyResolvedHost("idp.example.com")).resolves.toEqual({
				status: "non-public",
				address: "10.0.0.5",
				kind: "private",
			});
		});

		it("reports an empty answer as unresolved without an error", async () => {
			mocks.lookup.mockResolvedValue([]);

			const result = await classifyResolvedHost("idp.example.com");
			expect(result).toEqual({ status: "unresolved" });
			expect("error" in result).toBe(false);
		});

		it("reports a lookup rejection as unresolved with the error", async () => {
			const error = Object.assign(new Error("ENOTFOUND"), {
				code: "ENOTFOUND",
			});
			mocks.lookup.mockRejectedValue(error);

			const result = await classifyResolvedHost("idp.example.com");
			expect(result).toEqual({ status: "unresolved", error });
			expect(result.status === "unresolved" && result.error).toBe(error);
		});
	});

	describe("host names that classifyHost rejects", () => {
		it.each([
			["localhost", "localhost", "localhost"],
			["a .localhost name", "tenant.localhost", "localhost"],
			["a cloud metadata name", "metadata.google.internal", "cloudMetadata"],
		])("reports %s as non-public without a lookup", async (_l, host, kind) => {
			mocks.lookup.mockResolvedValue([PUBLIC_V4]);

			await expect(classifyResolvedHost(host)).resolves.toStrictEqual({
				status: "non-public",
				kind,
			});
			expect(mocks.lookup).not.toHaveBeenCalled();
		});
	});

	describe("IP literals", () => {
		it.each([
			["IPv4", "93.184.216.34", { address: "93.184.216.34", family: 4 }],
			[
				"bracketed IPv6",
				"[2606:2800:220:1:248:1893:25c8:1946]",
				PUBLIC_V6_FULL,
			],
			["IPv6", "2606:2800:220:1:248:1893:25c8:1946", PUBLIC_V6_FULL],
		])(
			"classifies a public %s literal without a lookup",
			async (_l, host, entry) => {
				await expect(classifyResolvedHost(host)).resolves.toEqual({
					status: "public",
					addresses: [entry],
				});
				expect(mocks.lookup).not.toHaveBeenCalled();
			},
		);

		it.each([
			["IPv4 loopback", "127.0.0.1", "loopback"],
			["IPv4 private", "192.168.1.10", "private"],
			["bracketed IPv6 loopback", "[::1]", "loopback"],
			["IPv4-mapped IPv6", "::ffff:10.0.0.1", "private"],
		])(
			"classifies a non-public %s literal without a lookup or an address",
			async (_l, host, kind) => {
				await expect(classifyResolvedHost(host)).resolves.toStrictEqual({
					status: "non-public",
					kind,
				});
				expect(mocks.lookup).not.toHaveBeenCalled();
			},
		);

		it("unmaps a public IPv4-mapped IPv6 literal to its IPv4 address", async () => {
			await expect(
				classifyResolvedHost("::ffff:93.184.216.34"),
			).resolves.toEqual({
				status: "public",
				addresses: [{ address: "93.184.216.34", family: 4 }],
			});
		});

		it.each([
			[
				"a trailing dot",
				"93.184.216.34.",
				{ address: "93.184.216.34", family: 4 },
			],
			["a port", "93.184.216.34:8080", { address: "93.184.216.34", family: 4 }],
			[
				"a bracketed port",
				"[2606:2800:220:1:248:1893:25c8:1946]:443",
				PUBLIC_V6_FULL,
			],
			["a zone id", "2606:2800:220:1:248:1893:25c8:1946%eth0", PUBLIC_V6_FULL],
		])(
			"returns a connectable address for a literal with %s",
			async (_l, host, entry) => {
				await expect(classifyResolvedHost(host)).resolves.toEqual({
					status: "public",
					addresses: [entry],
				});
				expect(mocks.lookup).not.toHaveBeenCalled();
			},
		);
	});

	describe("runtimes without a working resolver", () => {
		it("reports a stub lookup that throws ERR_METHOD_NOT_IMPLEMENTED", async () => {
			mocks.lookup.mockRejectedValue(
				Object.assign(new Error("dns.lookup"), {
					code: "ERR_METHOD_NOT_IMPLEMENTED",
				}),
			);

			await expect(classifyResolvedHost("idp.example.com")).resolves.toEqual({
				status: "no-resolver",
			});
		});

		it("reports the unenv stub lookup, which throws without an error code", async () => {
			mocks.lookup.mockRejectedValue(
				new Error("[unenv] dns.lookup is not implemented yet!"),
			);

			await expect(classifyResolvedHost("idp.example.com")).resolves.toEqual({
				status: "no-resolver",
			});
		});

		it.each([
			[
				"ENOTFOUND",
				Object.assign(new Error("getaddrinfo ENOTFOUND idp.example.com"), {
					code: "ENOTFOUND",
				}),
			],
			[
				"EAI_AGAIN",
				Object.assign(new Error("getaddrinfo EAI_AGAIN idp.example.com"), {
					code: "EAI_AGAIN",
				}),
			],
			[
				"a message that mentions not implemented",
				new Error("resolver returned NOTIMP: query type not implemented"),
			],
			[
				"an unrelated unenv stub",
				new Error("[unenv] dns.lookupService is not implemented yet!"),
			],
			[
				"a dns.lookup message without the unenv prefix",
				new Error("dns.lookup is not implemented"),
			],
			["a non-Error rejection", "dns.lookup is not implemented"],
		])(
			"reports an ordinary lookup failure as unresolved: %s",
			async (_, error) => {
				mocks.lookup.mockRejectedValue(error);

				await expect(classifyResolvedHost("idp.example.com")).resolves.toEqual({
					status: "unresolved",
					error,
				});
			},
		);

		it("reports a module without a lookup function", async () => {
			vi.resetModules();
			vi.doMock("node:dns/promises", () => ({ lookup: undefined }));
			const { classifyResolvedHost: classify } = await import("./resolve-host");

			await expect(classify("idp.example.com")).resolves.toEqual({
				status: "no-resolver",
			});
		});

		it("reports a runtime where node:dns cannot be imported", async () => {
			vi.resetModules();
			vi.doMock("node:dns/promises", () => {
				throw new Error("Cannot find module 'node:dns/promises'");
			});
			const { classifyResolvedHost: classify } = await import("./resolve-host");

			await expect(classify("idp.example.com")).resolves.toEqual({
				status: "no-resolver",
			});
		});

		it("still classifies IP literals without node:dns", async () => {
			vi.resetModules();
			vi.doMock("node:dns/promises", () => {
				throw new Error("Cannot find module 'node:dns/promises'");
			});
			const { classifyResolvedHost: classify } = await import("./resolve-host");

			await expect(classify("10.0.0.1")).resolves.toMatchObject({
				status: "non-public",
			});
		});
	});

	describe("abort signal", () => {
		it("reports unresolved with the abort reason when the signal aborts mid-lookup", async () => {
			mocks.lookup.mockReturnValue(new Promise(() => {}));
			const controller = new AbortController();
			const pending = classifyResolvedHost("idp.example.com", {
				signal: controller.signal,
			});
			controller.abort(new Error("deadline"));

			await expect(pending).resolves.toEqual({
				status: "unresolved",
				error: expect.objectContaining({ message: "deadline" }),
			});
		});

		it.each([
			Object.assign(new Error("forwarded"), {
				code: "ERR_METHOD_NOT_IMPLEMENTED",
			}),
			new Error("[unenv] dns.lookup is not implemented yet!"),
		])(
			"reports an abort reason that looks like a stub error as unresolved",
			async (reason) => {
				mocks.lookup.mockReturnValue(new Promise(() => {}));
				const controller = new AbortController();
				const pending = classifyResolvedHost("idp.example.com", {
					signal: controller.signal,
				});
				controller.abort(reason);

				await expect(pending).resolves.toEqual({
					status: "unresolved",
					error: reason,
				});
			},
		);

		it("does not look up when the signal is already aborted", async () => {
			const controller = new AbortController();
			controller.abort();

			await expect(
				classifyResolvedHost("idp.example.com", { signal: controller.signal }),
			).resolves.toEqual({
				status: "unresolved",
				error: controller.signal.reason,
			});
			expect(mocks.lookup).not.toHaveBeenCalled();
		});

		it("leaves no unhandled rejection when a synchronously throwing lookup meets a late abort", async () => {
			mocks.lookup.mockImplementation(() => {
				throw Object.assign(new Error("dns.lookup"), {
					code: "ERR_METHOD_NOT_IMPLEMENTED",
				});
			});
			const unhandled = vi.fn();
			process.on("unhandledRejection", unhandled);
			try {
				const controller = new AbortController();
				const pending = classifyResolvedHost("idp.example.com", {
					signal: controller.signal,
				});
				queueMicrotask(() => controller.abort(new Error("late abort")));

				await expect(pending).resolves.toEqual({ status: "no-resolver" });
				await new Promise((resolve) => setTimeout(resolve, 10));
				expect(unhandled).not.toHaveBeenCalled();
			} finally {
				process.off("unhandledRejection", unhandled);
			}
		});

		it("returns the answer when the lookup settles before the signal aborts", async () => {
			mocks.lookup.mockResolvedValue([PUBLIC_V4]);
			const controller = new AbortController();

			await expect(
				classifyResolvedHost("idp.example.com", { signal: controller.signal }),
			).resolves.toEqual({ status: "public", addresses: [PUBLIC_V4] });
			controller.abort();
		});

		it("removes its abort listener once the lookup settles", async () => {
			mocks.lookup.mockResolvedValue([PUBLIC_V4]);
			const controller = new AbortController();
			const remove = vi.spyOn(controller.signal, "removeEventListener");

			await classifyResolvedHost("idp.example.com", {
				signal: controller.signal,
			});
			expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
		});
	});
});
