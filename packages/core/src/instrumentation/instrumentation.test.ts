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
import { withSpan } from ".";
import { ATTR_DB_COLLECTION_NAME, ATTR_DB_OPERATION_NAME } from "./attributes";

const spanWaitDefaults = { timeout: 10_000, interval: 5 } as const;

describe("instrumentation", () => {
	let provider: NodeTracerProvider;
	let exporter: InMemorySpanExporter;

	async function waitForSpan(
		predicate: (s: ReadableSpan) => boolean,
	): Promise<ReadableSpan> {
		return vi.waitUntil(
			() => exporter.getFinishedSpans().find(predicate),
			spanWaitDefaults,
		);
	}

	async function waitForFinishedSpanCount(
		count: number,
	): Promise<ReadableSpan[]> {
		return vi.waitUntil(() => {
			const spans = exporter.getFinishedSpans();
			return spans.length === count ? spans : undefined;
		}, spanWaitDefaults);
	}

	beforeAll(async () => {
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
		vi.resetAllMocks();
	});

	it("creates a span with name and attributes for sync function", async () => {
		const result = withSpan(
			"test.sync",
			{
				[ATTR_DB_OPERATION_NAME]: "findOne",
				[ATTR_DB_COLLECTION_NAME]: "user",
			},
			() => 42,
		);

		expect(result).toBe(42);

		const span = await waitForSpan((s) => s.name === "test.sync");
		expect(span.attributes).toMatchObject({
			[ATTR_DB_OPERATION_NAME]: "findOne",
			[ATTR_DB_COLLECTION_NAME]: "user",
		});
	});

	it("creates a span for async function", async () => {
		const result = await withSpan(
			"test.async",
			{ endpoint: "getSession" },
			async () => {
				await new Promise((r) => setTimeout(r, 5));
				return "session-id";
			},
		);

		expect(result).toBe("session-id");

		const span = await waitForSpan((s) => s.name === "test.async");
		expect(span.attributes).toMatchObject({ endpoint: "getSession" });
	});

	it("records error status and exception when sync function throws", async () => {
		const err = new Error("sync failure");

		expect(() =>
			withSpan("test.sync.error", { foo: "bar" }, () => {
				throw err;
			}),
		).toThrow("sync failure");

		const span = await waitForSpan((s) => s.name === "test.sync.error");
		expect(span.status).toMatchObject({
			code: 2,
			message: "sync failure",
		});
	});

	it("records error status and exception when async function rejects", async () => {
		const err = new Error("async failure");

		await expect(
			withSpan("test.async.error", { baz: 1 }, async () => {
				await Promise.resolve();
				throw err;
			}),
		).rejects.toThrow("async failure");

		const span = await waitForSpan((s) => s.name === "test.async.error");
		expect(span.status).toMatchObject({
			code: 2,
			message: "async failure",
		});
	});

	it("creates multiple sequential spans", async () => {
		void withSpan("first", { order: 1 }, () => 1);
		void withSpan("second", { order: 2 }, () => 2);

		const spans = await waitForFinishedSpanCount(2);
		expect(spans.map((s) => s.name)).toEqual(
			expect.arrayContaining(["first", "second"]),
		);
	});

	it("creates nested spans when withSpan is composed", async () => {
		const result = withSpan("outer", { depth: 0 }, () => {
			return withSpan("inner", { depth: 1 }, () => "ok");
		});

		expect(result).toBe("ok");

		const spans = await waitForFinishedSpanCount(2);
		expect(spans.map((s) => s.name).sort()).toEqual(["inner", "outer"]);
	});

	it("uses better-auth instrumentation scope", async () => {
		void withSpan("scope.check", {}, () => undefined);

		const span = await waitForSpan((s) => s.name === "scope.check");
		expect(span.instrumentationLibrary?.name).toBe("better-auth");
	});

	it("does not record error status for redirect APIErrors (sync)", async () => {
		const redirectError = Object.assign(new Error("Found"), {
			name: "APIError",
			statusCode: 302,
		});

		expect(() =>
			withSpan("test.redirect.sync", {}, () => {
				throw redirectError;
			}),
		).toThrow();

		const span = await waitForSpan((s) => s.name === "test.redirect.sync");
		expect(span.status.code).toBe(1); // SpanStatusCode.OK
		expect(span.attributes["http.response.status_code"]).toBe(302);
	});

	it("does not record error status for redirect APIErrors (async)", async () => {
		const redirectError = Object.assign(new Error("Found"), {
			name: "APIError",
			statusCode: 302,
		});

		await expect(
			withSpan("test.redirect.async", {}, async () => {
				throw redirectError;
			}),
		).rejects.toThrow();

		const span = await waitForSpan((s) => s.name === "test.redirect.async");
		expect(span.status.code).toBe(1); // SpanStatusCode.OK
		expect(span.attributes["http.response.status_code"]).toBe(302);
	});

	it("still records error status for non-redirect APIErrors", async () => {
		const apiError = Object.assign(new Error("Not Found"), {
			name: "APIError",
			statusCode: 404,
		});

		expect(() =>
			withSpan("test.apierror.404", {}, () => {
				throw apiError;
			}),
		).toThrow();

		const span = await waitForSpan((s) => s.name === "test.apierror.404");
		expect(span.status.code).toBe(2); // SpanStatusCode.ERROR
	});

	it("withSpan runs without throwing when the package fails to load", async () => {
		vi.resetModules();
		vi.doMock("@opentelemetry/api", () => {
			throw new Error("simulated missing optional peer");
		});

		const { withSpan } = await import("./tracer");
		expect(withSpan("fallback", { k: 1 }, () => 99)).toBe(99);
	});
});
