import { describe, expect, it } from "vitest";
import { isAuthPath, svelteKitHandler } from "./svelte-kit";

type HandlerEvent = Parameters<typeof svelteKitHandler>[0]["event"];

const toEvent = (url: string): HandlerEvent =>
	({
		url: new URL(url),
		request: new Request(url),
	}) as unknown as HandlerEvent;

/**
 * Auth-route detection must not depend on the request scheme. Behind a
 * TLS-terminating proxy, tunnel (ngrok), or adapter-node's default scheme,
 * SvelteKit reports the request as `http://<host>` even though `baseURL` is
 * configured as `https://<host>`. Comparing full origins made Better Auth
 * miss the route and fall through to SvelteKit's router, returning 404 for
 * every `/api/auth/*` request.
 *
 * @see https://github.com/better-auth/better-auth/issues/11756
 * @see https://github.com/better-auth/better-auth/issues/11679
 * @see https://github.com/better-auth/better-auth/issues/10115
 */
describe("isAuthPath behind a TLS-terminating proxy", () => {
	it("matches an auth route when only the scheme differs", () => {
		expect(
			isAuthPath("http://example.com/api/auth/sign-in/email", {
				baseURL: "https://example.com",
			}),
		).toBe(true);
	});

	it("matches an auth route when the proxy reports https and baseURL is http", () => {
		expect(
			isAuthPath("https://localhost:3000/api/auth/sign-in/email", {
				baseURL: "http://localhost:3000",
			}),
		).toBe(true);
	});

	it("matches the auth route under a dynamic baseURL config", () => {
		expect(
			isAuthPath("http://preview-123.ngrok-free.app/api/auth/sign-in/email", {
				baseURL: { allowedHosts: ["preview-123.ngrok-free.app"] },
			}),
		).toBe(true);
	});

	it("does not match a different host", () => {
		expect(
			isAuthPath("http://evil.com/api/auth/sign-in/email", {
				baseURL: "https://example.com",
			}),
		).toBe(false);
	});

	it("does not match a different port", () => {
		expect(
			isAuthPath("https://example.com:8080/api/auth/sign-in/email", {
				baseURL: "https://example.com",
			}),
		).toBe(false);
	});

	it("does not match paths outside the base path", () => {
		expect(
			isAuthPath("https://example.com/api/authz/sign-in/email", {
				baseURL: "https://example.com",
			}),
		).toBe(false);
	});

	it("honors a custom base path", () => {
		expect(
			isAuthPath("http://example.com/auth/sign-in/email", {
				baseURL: "https://example.com",
				basePath: "/auth",
			}),
		).toBe(true);
	});
});

describe("svelteKitHandler behind a TLS-terminating proxy", () => {
	it("delegates a scheme-mismatched auth request to the auth handler", async () => {
		let handledRequest: Request | undefined;
		const response = await svelteKitHandler({
			auth: {
				handler: (request: Request) => {
					handledRequest = request;
					return new Response("auth", { status: 200 });
				},
				options: { baseURL: "https://example.com" },
			},
			event: toEvent("http://example.com/api/auth/sign-in/email"),
			resolve: () => new Response("sveltekit 404", { status: 404 }),
			building: false,
		});

		expect(handledRequest).toBeInstanceOf(Request);
		expect(response.status).toBe(200);
		await expect(response.text()).resolves.toBe("auth");
	});

	it("falls through to SvelteKit for non-auth routes", async () => {
		const response = await svelteKitHandler({
			auth: {
				handler: () => new Response("auth", { status: 200 }),
				options: { baseURL: "https://example.com" },
			},
			event: toEvent("http://example.com/dashboard"),
			resolve: () => new Response("page", { status: 200 }),
			building: false,
		});

		expect(response.status).toBe(200);
		await expect(response.text()).resolves.toBe("page");
	});
});
