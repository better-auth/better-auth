import { Agent } from "@atproto/api";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	atprotoPlaceholderEmail,
	fetchAtprotoProfilePublic,
	fetchProfileWithAgent,
	isLocalhost,
	resolveBaseURL,
} from "./utils";

vi.mock("@atproto/api", () => ({
	Agent: vi.fn(),
}));

describe("isLocalhost", () => {
	it("returns true for http://localhost", () => {
		expect(isLocalhost("http://localhost")).toBe(true);
	});
	it("returns true for http://localhost:3000", () => {
		expect(isLocalhost("http://localhost:3000")).toBe(true);
	});
	it("returns true for http://127.0.0.1", () => {
		expect(isLocalhost("http://127.0.0.1")).toBe(true);
	});
	it("returns true for http://127.0.0.1:8080", () => {
		expect(isLocalhost("http://127.0.0.1:8080")).toBe(true);
	});
	it("returns true for http://[::1]:3000", () => {
		expect(isLocalhost("http://[::1]:3000")).toBe(true);
	});
	it("returns false for https://example.com", () => {
		expect(isLocalhost("https://example.com")).toBe(false);
	});
	it("returns false for invalid URL", () => {
		expect(isLocalhost("not-a-url")).toBe(false);
	});
});

describe("atprotoPlaceholderEmail", () => {
	it("converts did:plc to a valid email", () => {
		expect(atprotoPlaceholderEmail("did:plc:abc123")).toBe(
			"did_plc_abc123@atproto.invalid",
		);
	});
	it("converts did:web to a valid email", () => {
		expect(atprotoPlaceholderEmail("did:web:example.com")).toBe(
			"did_web_example_com@atproto.invalid",
		);
	});
	it("is deterministic", () => {
		const did = "did:plc:xyz789";
		expect(atprotoPlaceholderEmail(did)).toBe(atprotoPlaceholderEmail(did));
	});
	it("produces distinct emails for distinct DIDs", () => {
		expect(atprotoPlaceholderEmail("did:plc:aaa")).not.toBe(
			atprotoPlaceholderEmail("did:plc:bbb"),
		);
	});
});

describe("fetchAtprotoProfilePublic", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});
	it("returns profile data on success", async () => {
		const mockProfile = {
			handle: "alice.bsky.social",
			displayName: "Alice",
			avatar: "https://cdn/avatar.jpg",
			banner: "https://cdn/banner.jpg",
			description: "hi",
		};
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify(mockProfile), { status: 200 }),
		);
		const profile = await fetchAtprotoProfilePublic("did:plc:abc");
		expect(profile.did).toBe("did:plc:abc");
		expect(profile.handle).toBe("alice.bsky.social");
		expect(profile.displayName).toBe("Alice");
	});
	it("returns fallback on HTTP error", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response("Not Found", { status: 404 }),
		);
		const profile = await fetchAtprotoProfilePublic("did:plc:x");
		expect(profile.did).toBe("did:plc:x");
		expect(profile.handle).toBe("did:plc:x");
	});
	it("returns fallback on network failure", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("net"));
		const profile = await fetchAtprotoProfilePublic("did:plc:y");
		expect(profile.did).toBe("did:plc:y");
		expect(profile.handle).toBe("did:plc:y");
	});
	it("URL-encodes the DID", async () => {
		const spy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ handle: "x" }), { status: 200 }),
			);
		await fetchAtprotoProfilePublic("did:plc:abc");
		expect(spy).toHaveBeenCalledWith(
			"https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=did%3Aplc%3Aabc",
			expect.objectContaining({ signal: expect.any(Object) }),
		);
	});
});

describe("fetchProfileWithAgent", () => {
	beforeEach(() => {
		vi.mocked(Agent).mockReset();
	});
	it("returns profile from authenticated agent on success", async () => {
		const getProfile = vi.fn().mockResolvedValue({
			data: {
				handle: "alice.bsky.social",
				displayName: "Alice",
				avatar: "https://cdn/avatar.jpg",
				banner: "https://cdn/banner.jpg",
				description: "hi",
			},
		});
		vi.mocked(Agent).mockImplementation(function () {
			return { getProfile } as unknown as InstanceType<typeof Agent>;
		});
		const profile = await fetchProfileWithAgent({
			did: "did:plc:abc",
		} as unknown as OAuthSession);
		expect(profile.handle).toBe("alice.bsky.social");
		expect(profile.displayName).toBe("Alice");
	});
	it("falls back to public API on agent failure", async () => {
		vi.mocked(Agent).mockImplementation(function () {
			return {
				getProfile: vi.fn().mockRejectedValue(new Error("nope")),
			} as unknown as InstanceType<typeof Agent>;
		});
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify({ handle: "fallback" }), { status: 200 }),
		);
		const profile = await fetchProfileWithAgent({
			did: "did:plc:abc",
		} as unknown as OAuthSession);
		expect(profile.handle).toBe("fallback");
	});
});

describe("resolveBaseURL", () => {
	it("returns string baseURL as-is", () => {
		expect(resolveBaseURL("http://localhost:3000")).toBe(
			"http://localhost:3000",
		);
	});
	it("returns fallback for DynamicBaseURLConfig", () => {
		expect(
			resolveBaseURL({
				allowedHosts: ["example.com"],
				fallback: "http://127.0.0.1:3000",
			}),
		).toBe("http://127.0.0.1:3000");
	});
	it("throws if undefined", () => {
		expect(() => resolveBaseURL(undefined)).toThrow("baseURL is required");
	});
	it("throws if DynamicBaseURLConfig has no fallback", () => {
		expect(() => resolveBaseURL({ allowedHosts: ["example.com"] })).toThrow(
			"must be a string or have a fallback URL",
		);
	});
});
