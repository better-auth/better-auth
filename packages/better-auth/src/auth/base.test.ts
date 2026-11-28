import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";

/**
 * A plugin whose `endpoints` getter counts its reads. The handler reads it
 * once each time it builds a router, so the count is the number of routers
 * built.
 */
function routerProbe(beforeRespond: () => Promise<void> = async () => {}) {
	const builds = { count: 0 };
	const endpoints = {
		probe: createAuthEndpoint(
			"/probe",
			{ method: ["GET", "POST"] },
			async (ctx) => {
				await beforeRespond();
				return ctx.json({
					baseURL: ctx.context.baseURL,
					trustedOrigins: ctx.context.trustedOrigins,
					trustedProviders: ctx.context.trustedProviders,
				});
			},
		),
	};
	const plugin = {
		id: "router-probe",
		get endpoints() {
			builds.count++;
			return endpoints;
		},
	} satisfies BetterAuthPlugin;
	return { plugin, builds };
}

/**
 * Holds the first `size` callers until all of them are waiting, so that many
 * requests are in flight together. Later callers pass straight through.
 */
function overlap(size: number) {
	let waiting: Array<() => void> | undefined = [];
	return () =>
		new Promise<void>((resolve) => {
			if (!waiting) return resolve();
			waiting.push(resolve);
			if (waiting.length === size) {
				for (const release of waiting) release();
				waiting = undefined;
			}
		});
}

const tenantOf = (request?: Request) =>
	request?.headers.get("x-tenant") ?? "none";

type ProbeBody = {
	baseURL: string;
	trustedOrigins: string[];
	trustedProviders: string[];
};

describe("handler router reuse", () => {
	it("builds the router once for repeated requests to the same base path", async () => {
		const { plugin, builds } = routerProbe();
		const { auth } = await getTestInstance(
			{ plugins: [plugin] },
			{ disableTestUser: true },
		);
		const request = () =>
			auth.handler(new Request("http://localhost:3000/api/auth/probe"));
		const before = builds.count;

		expect((await request()).status).toBe(200);
		expect(builds.count).toBe(before + 1);
		for (let i = 0; i < 4; i++) {
			expect((await request()).status).toBe(200);
		}
		expect(builds.count).toBe(before + 1);
	});

	it("builds one router per base path for a dynamic baseURL", async () => {
		const { plugin, builds } = routerProbe();
		const { auth } = await getTestInstance(
			{
				baseURL: {
					allowedHosts: ["a.example.com", "b.example.com"],
					fallback: "https://fallback.example.com/fallback-auth",
				},
				plugins: [plugin],
			},
			{ disableTestUser: true },
		);
		const baseURLOf = async (url: string) => {
			const response = await auth.handler(new Request(url));
			expect(response.status).toBe(200);
			return ((await response.json()) as ProbeBody).baseURL;
		};
		const before = builds.count;

		for (let round = 0; round < 2; round++) {
			expect(await baseURLOf("https://a.example.com/api/auth/probe")).toBe(
				"https://a.example.com/api/auth",
			);
			expect(await baseURLOf("https://b.example.com/api/auth/probe")).toBe(
				"https://b.example.com/api/auth",
			);
			expect(
				await baseURLOf("https://other.example.com/fallback-auth/probe"),
			).toBe("https://fallback.example.com/fallback-auth");
		}
		// A host outside allowedHosts resolves to the fallback, whose router
		// serves only the fallback's base path.
		expect(
			(
				await auth.handler(
					new Request("https://other.example.com/api/auth/probe"),
				)
			).status,
		).toBe(404);
		expect(builds.count).toBe(before + 2);
	});

	it("keeps each request's context to that request", async () => {
		const { plugin } = routerProbe(overlap(2));
		const { auth } = await getTestInstance(
			{
				trustedOrigins: (request) => [
					`https://${tenantOf(request)}.example.com`,
				],
				account: {
					accountLinking: {
						trustedProviders: (request) => [`${tenantOf(request)}-provider`],
					},
				},
				plugins: [
					plugin,
					{
						id: "tenant-context",
						async onRequest(request, ctx) {
							ctx.trustedOrigins = [
								...ctx.trustedOrigins,
								`https://${tenantOf(request)}.on-request.example.com`,
							];
						},
						async onResponse(response, ctx) {
							const headers = new Headers(response.headers);
							headers.set("x-trusted-origins", ctx.trustedOrigins.join(" "));
							return {
								response: new Response(response.body, {
									status: response.status,
									headers,
								}),
							};
						},
					} satisfies BetterAuthPlugin,
				],
			},
			{ disableTestUser: true },
		);
		const probe = async (tenant: string) => {
			const response = await auth.handler(
				new Request("http://localhost:3000/api/auth/probe", {
					headers: { "x-tenant": tenant },
				}),
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as ProbeBody;
			const tenantOrigins = (origins: string[]) =>
				origins.filter((origin) => origin.endsWith("example.com"));
			return {
				trustedOrigins: tenantOrigins(body.trustedOrigins),
				trustedProviders: body.trustedProviders,
				seenByOnResponse: tenantOrigins(
					response.headers.get("x-trusted-origins")?.split(" ") ?? [],
				),
			};
		};

		// Overlapping requests, then a third to check nothing carried over.
		const [a, b] = await Promise.all([probe("a"), probe("b")]);
		const c = await probe("c");
		for (const [tenant, seen] of [
			["a", a],
			["b", b],
			["c", c],
		] as const) {
			const own = [
				`https://${tenant}.example.com`,
				`https://${tenant}.on-request.example.com`,
			];
			expect(seen).toEqual({
				trustedOrigins: own,
				trustedProviders: [`${tenant}-provider`],
				seenByOnResponse: own,
			});
		}
	});

	it("checks each request's origin against that request's trusted origins", async () => {
		const { plugin } = routerProbe();
		const { auth } = await getTestInstance(
			{
				trustedOrigins: (request) => [
					`https://${tenantOf(request)}.example.com`,
				],
				advanced: { disableOriginCheck: false },
				plugins: [plugin],
			},
			{ disableTestUser: true },
		);
		const postFromTenantA = (tenant: string) =>
			auth.handler(
				new Request("http://localhost:3000/api/auth/probe", {
					method: "POST",
					headers: {
						"x-tenant": tenant,
						origin: "https://a.example.com",
						cookie: "session=1",
					},
				}),
			);

		expect((await postFromTenantA("a")).status).toBe(200);
		expect((await postFromTenantA("b")).status).toBe(403);
		expect((await postFromTenantA("a")).status).toBe(200);
	});
});

describe("handler without a runtime AsyncLocalStorage", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.doUnmock("@better-auth/core/async_hooks");
		vi.restoreAllMocks();
	});

	it("serves requests when AsyncLocalStorage is unavailable", async () => {
		vi.doMock("@better-auth/core/async_hooks", async (importOriginal) => ({
			...(await importOriginal<object>()),
			getAsyncLocalStorage: () =>
				Promise.reject(new Error("AsyncLocalStorage is unavailable")),
		}));
		const { getTestInstance } = await import("../test-utils/test-instance");
		const { plugin } = routerProbe();
		const { auth } = await getTestInstance(
			{ plugins: [plugin] },
			{ disableTestUser: true },
		);
		for (let i = 0; i < 2; i++) {
			const response = await auth.handler(
				new Request("http://localhost:3000/api/auth/probe"),
			);
			expect(response.status).toBe(200);
		}
	});

	it("keeps each overlapping request's trusted origins and origin check on the polyfill", async () => {
		// An edge or browser build without a runtime AsyncLocalStorage resolves
		// `@better-auth/core/async_hooks` to this polyfill.
		const getBuiltinModule = process.getBuiltinModule.bind(process);
		vi.spyOn(process, "getBuiltinModule").mockImplementation((id) =>
			id === "node:async_hooks" ? undefined : getBuiltinModule(id),
		);
		vi.doMock("@better-auth/core/async_hooks", () =>
			vi.importActual("../../../core/src/async_hooks/pure.index"),
		);
		const { getTestInstance } = await import("../test-utils/test-instance");
		const { plugin } = routerProbe();
		let hold = overlap(2);
		const { auth } = await getTestInstance(
			{
				trustedOrigins: (request) => [
					`https://${tenantOf(request)}.example.com`,
				],
				advanced: { disableOriginCheck: false },
				plugins: [
					plugin,
					{
						id: "hold-until-both-in-flight",
						async onRequest() {
							await hold();
						},
					} satisfies BetterAuthPlugin,
				],
			},
			{ disableTestUser: true },
		);
		const send = (tenant: string, method: "GET" | "POST") =>
			auth.handler(
				new Request("http://localhost:3000/api/auth/probe", {
					method,
					headers: {
						"x-tenant": tenant,
						origin: "https://a.example.com",
						cookie: "session=1",
					},
				}),
			);
		const trustedOriginsOf = async (response: Response) => {
			expect(response.status).toBe(200);
			const body = (await response.json()) as ProbeBody;
			return body.trustedOrigins.filter((origin) =>
				origin.endsWith("example.com"),
			);
		};

		// "b" starts first, so a store shared across requests would hand it
		// "a"'s context once "a" starts.
		const [b, a] = await Promise.all([send("b", "GET"), send("a", "GET")]);
		expect(await trustedOriginsOf(b)).toEqual(["https://b.example.com"]);
		expect(await trustedOriginsOf(a)).toEqual(["https://a.example.com"]);

		hold = overlap(2);
		const [fromB, fromA] = await Promise.all([
			send("b", "POST"),
			send("a", "POST"),
		]);
		expect(fromB.status).toBe(403);
		expect(await trustedOriginsOf(fromA)).toEqual(["https://a.example.com"]);
	});
});
