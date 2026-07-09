import { describe, expect, it } from "vitest";
import type { DeviceAuthorizationOptions } from ".";
import {
	parseStoredResource,
	resolveResourceAudience,
	serializeResource,
} from "./resource";

const opts = (allowedResources?: string[]): DeviceAuthorizationOptions =>
	({ allowedResources }) as unknown as DeviceAuthorizationOptions;

const errorOf = (fn: () => unknown): string | undefined => {
	try {
		fn();
	} catch (e) {
		return (e as { body?: { error?: string } }).body?.error;
	}
	return undefined;
};

describe("resolveResourceAudience", () => {
	const allowed = ["https://api.example.com", "https://other.example.com"];

	it("returns undefined when no resource is present", () => {
		expect(
			resolveResourceAudience({
				opts: opts(allowed),
				boundResource: undefined,
				requestedResource: undefined,
			}),
		).toBeUndefined();
		// An empty array normalizes to "no resource" (opaque-token path).
		expect(
			resolveResourceAudience({
				opts: opts(allowed),
				boundResource: undefined,
				requestedResource: [],
			}),
		).toBeUndefined();
	});

	it("collapses duplicate requested resources to a single string audience", () => {
		expect(
			resolveResourceAudience({
				opts: opts(allowed),
				boundResource: undefined,
				requestedResource: [
					"https://api.example.com",
					"https://api.example.com",
				],
			}),
		).toBe("https://api.example.com");
	});

	it("returns a single string audience for one allowed resource", () => {
		expect(
			resolveResourceAudience({
				opts: opts(allowed),
				boundResource: undefined,
				requestedResource: "https://api.example.com",
			}),
		).toBe("https://api.example.com");
	});

	it("rejects a resource that is not in the allow-list", () => {
		expect(
			errorOf(() =>
				resolveResourceAudience({
					opts: opts(allowed),
					boundResource: undefined,
					requestedResource: "https://evil.example.com",
				}),
			),
		).toBe("invalid_target");
	});

	it("rejects a non-absolute-URI resource", () => {
		expect(
			errorOf(() =>
				resolveResourceAudience({
					opts: opts(["/relative"]),
					boundResource: undefined,
					requestedResource: "/relative",
				}),
			),
		).toBe("invalid_target");
	});

	it("rejects a resource with a fragment", () => {
		expect(
			errorOf(() =>
				resolveResourceAudience({
					opts: opts(["https://api.example.com#x"]),
					boundResource: undefined,
					requestedResource: "https://api.example.com#x",
				}),
			),
		).toBe("invalid_target");
		// A bare trailing `#` (empty fragment) is also rejected.
		expect(
			errorOf(() =>
				resolveResourceAudience({
					opts: opts(["https://api.example.com/#"]),
					boundResource: undefined,
					requestedResource: "https://api.example.com/#",
				}),
			),
		).toBe("invalid_target");
	});

	it("enforces the subset rule when bound and requested both present", () => {
		expect(
			resolveResourceAudience({
				opts: opts(allowed),
				boundResource: ["https://api.example.com", "https://other.example.com"],
				requestedResource: "https://api.example.com",
			}),
		).toBe("https://api.example.com");

		expect(
			errorOf(() =>
				resolveResourceAudience({
					opts: opts(allowed),
					boundResource: ["https://api.example.com"],
					requestedResource: "https://other.example.com",
				}),
			),
		).toBe("invalid_target");
	});

	it("inherits the bound resource when none requested at token time", () => {
		expect(
			resolveResourceAudience({
				opts: opts(allowed),
				boundResource: "https://api.example.com",
				requestedResource: undefined,
			}),
		).toBe("https://api.example.com");
	});

	it("rejects a requested resource with no binding when requireBinding is set", () => {
		expect(
			errorOf(() =>
				resolveResourceAudience({
					opts: opts(allowed),
					boundResource: undefined,
					requestedResource: "https://api.example.com",
					requireBinding: true,
				}),
			),
		).toBe("invalid_target");
	});
});

describe("serializeResource / parseStoredResource round-trip", () => {
	it("round-trips a single resource", () => {
		expect(parseStoredResource(serializeResource("https://a"))).toBe(
			"https://a",
		);
	});
	it("round-trips multiple resources", () => {
		expect(
			parseStoredResource(serializeResource(["https://a", "https://b"])),
		).toEqual(["https://a", "https://b"]);
	});
	it("returns undefined for empty stored values", () => {
		expect(parseStoredResource(null)).toBeUndefined();
		expect(parseStoredResource(undefined)).toBeUndefined();
	});
});
