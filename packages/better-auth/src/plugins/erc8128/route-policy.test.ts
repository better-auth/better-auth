import { describe, expect, it } from "vitest";
import {
	resolveRequestRoutePolicy,
	resolveRoutePolicy,
} from "./route-policy";

function fakeRequest(method: string, path: string): Request {
	return new Request(`https://example.com${path}`, { method });
}

describe("resolveRoutePolicy", () => {
	it("matches exact paths with method-specific entries", () => {
		const routePolicy = {
			"/api/orders": [
				{ methods: ["POST"], replayable: false },
				{ methods: ["GET"], replayable: true },
			],
		};

		const post = resolveRoutePolicy(
			routePolicy,
			fakeRequest("POST", "/api/orders"),
		);
		const get = resolveRoutePolicy(
			routePolicy,
			fakeRequest("GET", "/api/orders"),
		);

		expect(post.requireAuth).toBe(true);
		expect(post.policy?.replayable).toBe(false);
		expect(get.requireAuth).toBe(true);
		expect(get.policy?.replayable).toBe(true);
	});

	it("falls back to the methodless entry on the same path", () => {
		const routePolicy = {
			"/api/orders": [
				{ methods: ["POST"], replayable: false },
				{ replayable: true },
			],
		};

		const resolved = resolveRoutePolicy(
			routePolicy,
			fakeRequest("GET", "/api/orders"),
		);

		expect(resolved.requireAuth).toBe(true);
		expect(resolved.policy?.replayable).toBe(true);
	});

	it("does not fall through to default when a matched path has no applicable method", () => {
		const routePolicy = {
			"/api/orders": [{ methods: ["POST"], replayable: false }],
			default: { replayable: true },
		};

		const resolved = resolveRoutePolicy(
			routePolicy,
			fakeRequest("GET", "/api/orders"),
		);

		expect(resolved.requireAuth).toBe(false);
		expect(resolved.skipVerification).toBe(false);
		expect(resolved.policy).toBeUndefined();
	});

	it("matches the longest wildcard path", () => {
		const routePolicy = {
			"/api/*": { replayable: true },
			"/api/orders/*": { replayable: false },
		};

		const resolved = resolveRoutePolicy(
			routePolicy,
			fakeRequest("GET", "/api/orders/123"),
		);

		expect(resolved.requireAuth).toBe(true);
		expect(resolved.policy?.replayable).toBe(false);
	});

	it("supports false to skip verification on exact paths", () => {
		const routePolicy = {
			"/api/public": false as const,
			default: { replayable: false },
		};

		const resolved = resolveRoutePolicy(
			routePolicy,
			fakeRequest("GET", "/api/public"),
		);

		expect(resolved.skipVerification).toBe(true);
		expect(resolved.requireAuth).toBe(false);
	});

	it("supports false to skip verification on wildcard paths", () => {
		const routePolicy = {
			"/api/public/*": false as const,
			default: { replayable: false },
		};

		const resolved = resolveRoutePolicy(
			routePolicy,
			fakeRequest("GET", "/api/public/asset"),
		);

		expect(resolved.skipVerification).toBe(true);
		expect(resolved.requireAuth).toBe(false);
	});

	it("uses default when no path entry matches", () => {
		const routePolicy = {
			default: {
				replayable: true,
				classBoundPolicies: [["@authority"]],
			},
		};

		const resolved = resolveRoutePolicy(
			routePolicy,
			fakeRequest("POST", "/api/other"),
		);

		expect(resolved.requireAuth).toBe(true);
		expect(resolved.policy).toEqual(routePolicy.default);
	});

	it("uses a single object value as an all-method path policy", () => {
		const routePolicy = {
			"/api/orders": { replayable: false },
		};

		const resolved = resolveRoutePolicy(
			routePolicy,
			fakeRequest("DELETE", "/api/orders"),
		);

		expect(resolved.requireAuth).toBe(true);
		expect(resolved.policy?.replayable).toBe(false);
	});

	it("matches auth-relative paths when Better Auth uses a custom basePath", () => {
		const routePolicy = {
			"/session": { replayable: false },
		};

		const resolved = resolveRoutePolicy(
			routePolicy,
			fakeRequest("GET", "/custom-auth/session"),
			"http://example.com/custom-auth",
		);

		expect(resolved.requireAuth).toBe(true);
		expect(resolved.policy?.replayable).toBe(false);
	});

	it("accepts legacy basePath-prefixed route keys and normalizes them", () => {
		const routePolicy = {
			"/custom-auth/session": { replayable: false },
		};

		const resolved = resolveRoutePolicy(
			routePolicy,
			fakeRequest("GET", "/custom-auth/session"),
			"http://example.com/custom-auth",
		);

		expect(resolved.requireAuth).toBe(true);
		expect(resolved.policy?.replayable).toBe(false);
	});

	it("exports a helper that returns only the resolved policy", () => {
		const routePolicy = {
			"/session": { replayable: false, methods: ["GET"] },
		};

		const resolved = resolveRequestRoutePolicy(
			routePolicy,
			fakeRequest("GET", "/custom-auth/session"),
			"http://example.com/custom-auth",
		);

		expect(resolved).toEqual(routePolicy["/session"]);
	});
});
