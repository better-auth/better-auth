import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import {
	ATTR_CONTEXT,
	ATTR_HOOK_TYPE,
	ATTR_HTTP_RESPONSE_STATUS_CODE,
	ATTR_HTTP_ROUTE,
	ATTR_OPERATION_ID,
} from "@better-auth/core/instrumentation";
import { trace } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import {
	InMemorySpanExporter,
	SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { createAuthMiddleware } from "./api";
import { getTestInstance } from "./test-utils";

let exporter: InMemorySpanExporter;
let provider: NodeTracerProvider;

const PLUGIN_ID = "test-plugin";

async function createTestInstance(options: BetterAuthOptions = {}) {
	const otelPlugin: BetterAuthPlugin = {
		id: PLUGIN_ID,
		endpoints: {
			routeWithParams: createAuthEndpoint(
				"/route-with-params/:slug",
				{
					method: "GET",
					operationId: "routeWithParams",
				},
				async () => ({ ok: true as const }),
			),
		},
		middlewares: [
			{
				path: "/**",
				middleware: createAuthMiddleware(async () => {}),
			},
		],
		async onRequest() {
			return;
		},
		async onResponse() {
			return;
		},
	};

	return await getTestInstance({
		hooks: {
			before: createAuthMiddleware(async () => {}),
			after: createAuthMiddleware(async () => {}),
		},
		plugins: [otelPlugin],
		...options,
	});
}

async function waitForSpan(
	predicate: (s: ReadableSpan) => boolean,
): Promise<ReadableSpan> {
	return vi.waitUntil(() => exporter.getFinishedSpans().find(predicate), {
		timeout: 10_000,
		interval: 5,
	});
}

describe("endpoints instrumentation", () => {
	beforeAll(() => {
		exporter = new InMemorySpanExporter();
		provider = new NodeTracerProvider({
			spanProcessors: [new SimpleSpanProcessor(exporter)],
		});
		trace.setGlobalTracerProvider(provider);
	});

	afterAll(async () => {
		await provider.shutdown();
	});

	beforeEach(() => {
		exporter.reset();
	});

	it("disables instrumentation per instance while preserving application spans", async () => {
		const enabled = await createTestInstance();
		await enabled.client.getSession();
		await waitForSpan((span) => span.name === "GET /get-session");
		exporter.reset();
		const getTracer = vi.spyOn(trace, "getTracer");
		const disabled = await createTestInstance({
			experimental: { instrumentation: { enabled: false } },
			databaseHooks: {
				user: {
					create: {
						before: async (data) => ({ data }),
						after: async () => {},
					},
				},
			},
		});
		const tracer = provider.getTracer("application");
		await tracer.startActiveSpan("server request", async (span) => {
			try {
				const response = await disabled.client.signUp.email({
					email: "disabled@example.com",
					password: "password123456",
					name: "Disabled tracing",
				});
				expect(response.error).toBeNull();
				expect(
					await disabled.auth.api.getSession({ headers: new Headers() }),
				).toBeNull();
				await disabled.auth.$context.then((ctx) =>
					ctx.adapter.findMany({ model: "user" }),
				);
			} finally {
				span.end();
			}
		});
		expect(getTracer).not.toHaveBeenCalled();
		getTracer.mockRestore();
		await provider.forceFlush();
		expect(exporter.getFinishedSpans().map((span) => span.name)).toEqual([
			"server request",
		]);

		exporter.reset();
		await Promise.all([
			enabled.client.getSession(),
			disabled.client.getSession(),
		]);
		await provider.forceFlush();
		expect(
			exporter
				.getFinishedSpans()
				.filter((span) => span.name === "GET /get-session"),
		).toHaveLength(1);
	});

	it("emits a parent span for each endpoint", async () => {
		const instance = await createTestInstance();
		await instance.client.getSession();

		const span = await waitForSpan((s) => s.name === "GET /get-session");
		expect(span.attributes).toMatchObject({
			[ATTR_OPERATION_ID]: "getSession",
			[ATTR_HTTP_ROUTE]: expect.any(String),
		});
	});

	it("emits a span for the endpoint handler", async () => {
		const instance = await createTestInstance();
		await instance.client.getSession();

		const span = await waitForSpan((s) => s.name === "handler /get-session");
		expect(span.attributes).toMatchObject({
			[ATTR_HTTP_ROUTE]: expect.any(String),
			[ATTR_OPERATION_ID]: "getSession",
		});
	});

	it("emits spans for plugin-originated hooks", async () => {
		const instance = await createTestInstance();
		await instance.client.getSession();

		const afterHookSpan = await waitForSpan(
			(s) => s.name === "hook after /get-session plugin:bearer",
		);
		expect(afterHookSpan.attributes).toMatchObject({
			[ATTR_HOOK_TYPE]: "after",
			[ATTR_CONTEXT]: "plugin:bearer",
			[ATTR_OPERATION_ID]: "getSession",
		});
	});

	it("emits spans for global hooks", async () => {
		const instance = await createTestInstance();
		await instance.client.getSession();

		const beforeHookSpan = await waitForSpan(
			(s) => s.name === "hook before /get-session user",
		);
		expect(beforeHookSpan.attributes).toMatchObject({
			[ATTR_HOOK_TYPE]: "before",
			[ATTR_CONTEXT]: "user",
			[ATTR_OPERATION_ID]: "getSession",
		});

		const afterHookSpan = await waitForSpan(
			(s) => s.name === "hook after /get-session user",
		);
		expect(afterHookSpan.attributes).toMatchObject({
			[ATTR_HOOK_TYPE]: "after",
			[ATTR_CONTEXT]: "user",
			[ATTR_OPERATION_ID]: "getSession",
		});
	});

	it("emits a span for each middleware", async () => {
		const instance = await createTestInstance();
		await instance.client.getSession();

		const middlewareSpan = await waitForSpan(
			(s) => s.name === "middleware /** test-plugin",
		);
		expect(middlewareSpan.attributes).toMatchObject({
			[ATTR_HOOK_TYPE]: "middleware",
			[ATTR_CONTEXT]: `plugin:${PLUGIN_ID}`,
			[ATTR_HTTP_ROUTE]: expect.any(String),
		});
	});

	it("emits a span for onRequest hooks", async () => {
		const instance = await createTestInstance();
		await instance.client.getSession();

		const onRequestSpan = await waitForSpan(
			(s) => s.name === "onRequest test-plugin",
		);
		expect(onRequestSpan.attributes).toMatchObject({
			[ATTR_HOOK_TYPE]: "onRequest",
			[ATTR_CONTEXT]: `plugin:${PLUGIN_ID}`,
		});
		expect(onRequestSpan.attributes[ATTR_HTTP_ROUTE]).toBeUndefined();
	});

	it("emits a span for onResponse hooks", async () => {
		const instance = await createTestInstance();
		await instance.client.getSession();

		const onResponseSpan = await waitForSpan(
			(s) => s.name === "onResponse test-plugin",
		);
		expect(onResponseSpan.attributes).toMatchObject({
			[ATTR_HOOK_TYPE]: "onResponse",
			[ATTR_CONTEXT]: `plugin:${PLUGIN_ID}`,
			[ATTR_HTTP_RESPONSE_STATUS_CODE]: expect.any(Number),
		});
		expect(onResponseSpan.attributes[ATTR_HTTP_ROUTE]).toBeUndefined();
	});

	it("uses the route template for http.route on parameterized endpoints", async () => {
		const instance = await createTestInstance();
		await instance.client.$fetch("/route-with-params/acme-segment", {
			method: "GET",
		});

		const span = await waitForSpan(
			(s) => s.name === "GET /route-with-params/:slug",
		);
		expect(span.attributes[ATTR_HTTP_ROUTE]).toBe("/route-with-params/:slug");
	});
});
