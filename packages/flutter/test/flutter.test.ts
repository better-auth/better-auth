/**
 * @see https://github.com/2keyapp/better-auth
 */
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { flutter } from "../src";

describe("flutter server plugin", () => {
	it("registers the flutter plugin id", async () => {
		const { auth } = await getTestInstance({
			plugins: [flutter()],
			trustedOrigins: ["myapp://"],
		});
		const ctx = await auth.$context;
		expect(ctx.options.plugins?.some((p) => p.id === "flutter")).toBe(true);
	});

	it("overrides origin from flutter-origin when Origin is missing", async () => {
		const { auth } = await getTestInstance({
			emailAndPassword: { enabled: true },
			plugins: [flutter()],
			trustedOrigins: ["myapp://"],
		});

		const res = await auth.handler(
			new Request("http://localhost:3000/api/auth/ok", {
				method: "GET",
				headers: {
					"flutter-origin": "myapp://",
				},
			}),
		);
		expect(res.status).toBe(200);
	});

	it("does not override an existing Origin header", async () => {
		const { auth } = await getTestInstance({
			emailAndPassword: { enabled: true },
			plugins: [flutter({ disableOriginOverride: false })],
			trustedOrigins: ["https://example.com", "myapp://"],
		});

		const res = await auth.handler(
			new Request("http://localhost:3000/api/auth/ok", {
				method: "GET",
				headers: {
					origin: "https://example.com",
					"flutter-origin": "myapp://",
				},
			}),
		);
		expect(res.status).toBe(200);
	});

	it("rejects same-origin authorizationURL on the proxy endpoint", async () => {
		const { auth } = await getTestInstance({
			plugins: [flutter()],
			trustedOrigins: ["myapp://"],
		});
		const ctx = await auth.$context;
		const base = ctx.baseURL;
		const res = await auth.handler(
			new Request(
				`${base}/flutter-authorization-proxy?authorizationURL=${encodeURIComponent(`${base}/sign-in`)}`,
				{ method: "GET" },
			),
		);
		expect(res.status).toBe(400);
	});

	it("rejects non-https authorizationURL on the proxy endpoint", async () => {
		const { auth } = await getTestInstance({
			plugins: [flutter()],
			trustedOrigins: ["myapp://"],
		});
		const ctx = await auth.$context;
		const res = await auth.handler(
			new Request(
				`${ctx.baseURL}/flutter-authorization-proxy?authorizationURL=${encodeURIComponent("http://evil.example/oauth")}`,
				{ method: "GET" },
			),
		);
		expect(res.status).toBe(400);
	});

	it("rejects authorizationURL containing a fragment", async () => {
		const { auth } = await getTestInstance({
			plugins: [flutter()],
			trustedOrigins: ["myapp://"],
		});
		const ctx = await auth.$context;
		const res = await auth.handler(
			new Request(
				`${ctx.baseURL}/flutter-authorization-proxy?authorizationURL=${encodeURIComponent("https://accounts.google.com/o/oauth2?x=1#frag")}`,
				{ method: "GET" },
			),
		);
		expect(res.status).toBe(400);
	});
});
