import { trace } from "@opentelemetry/api";
import {
	InMemorySpanExporter,
	SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withSpan } from ".";
import { ATTR_DB_COLLECTION_NAME, ATTR_DB_OPERATION_NAME } from "./attributes";

describe("instrumentation", () => {
	let provider: NodeTracerProvider;
	let exporter: InMemorySpanExporter;

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
	});

	it("creates a span with name and attributes for sync function", () => {
		const result = withSpan(
			"test.sync",
			{
				[ATTR_DB_OPERATION_NAME]: "findOne",
				[ATTR_DB_COLLECTION_NAME]: "user",
			},
			() => 42,
		);

		expect(result).toBe(42);

		const spans = exporter.getFinishedSpans();
		expect(spans).toHaveLength(1);
		expect(spans[0]?.name).toBe("test.sync");
		expect(spans[0]?.attributes).toMatchObject({
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

		const spans = exporter.getFinishedSpans();
		expect(spans).toHaveLength(1);
		expect(spans[0]?.name).toBe("test.async");
		expect(spans[0]?.attributes).toMatchObject({ endpoint: "getSession" });
	});

	it("records error status and exception when sync function throws", () => {
		const err = new Error("sync failure");

		expect(() =>
			withSpan("test.sync.error", { foo: "bar" }, () => {
				throw err;
			}),
		).toThrow("sync failure");

		const spans = exporter.getFinishedSpans();
		expect(spans).toHaveLength(1);
		expect(spans[0]?.name).toBe("test.sync.error");
		expect(spans[0]?.status).toMatchObject({
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

		const spans = exporter.getFinishedSpans();
		expect(spans).toHaveLength(1);
		expect(spans[0]?.name).toBe("test.async.error");
		expect(spans[0]?.status).toMatchObject({
			code: 2,
			message: "async failure",
		});
	});

	it("creates multiple sequential spans", () => {
		void withSpan("first", { order: 1 }, () => 1);
		void withSpan("second", { order: 2 }, () => 2);

		const spans = exporter.getFinishedSpans();
		expect(spans).toHaveLength(2);
		expect(spans.map((s) => s.name)).toEqual(
			expect.arrayContaining(["first", "second"]),
		);
	});

	it("creates nested spans when withSpan is composed", () => {
		const result = withSpan("outer", { depth: 0 }, () => {
			return withSpan("inner", { depth: 1 }, () => "ok");
		});

		expect(result).toBe("ok");

		const spans = exporter.getFinishedSpans();
		expect(spans).toHaveLength(2);
		expect(spans.map((s) => s.name).sort()).toEqual(["inner", "outer"]);
	});

	it("uses better-auth instrumentation scope", () => {
		void withSpan("scope.check", {}, () => undefined);

		const spans = exporter.getFinishedSpans();
		expect(spans).toHaveLength(1);

		const span = spans[0];
		expect(span?.instrumentationLibrary?.name).toBe("better-auth");
	});

	it("does not record error status for redirect APIErrors (sync)", () => {
		const redirectError = Object.assign(new Error("Found"), {
			name: "APIError",
			statusCode: 302,
		});

		expect(() =>
			withSpan("test.redirect.sync", {}, () => {
				throw redirectError;
			}),
		).toThrow();

		const spans = exporter.getFinishedSpans();
		expect(spans).toHaveLength(1);
		expect(spans[0]?.status.code).toBe(1); // SpanStatusCode.OK
		expect(spans[0]?.attributes["http.response.status_code"]).toBe(302);
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

		const spans = exporter.getFinishedSpans();
		expect(spans).toHaveLength(1);
		expect(spans[0]?.status.code).toBe(1); // SpanStatusCode.OK
		expect(spans[0]?.attributes["http.response.status_code"]).toBe(302);
	});

	it("still records error status for non-redirect APIErrors", () => {
		const apiError = Object.assign(new Error("Not Found"), {
			name: "APIError",
			statusCode: 404,
		});

		expect(() =>
			withSpan("test.apierror.404", {}, () => {
				throw apiError;
			}),
		).toThrow();

		const spans = exporter.getFinishedSpans();
		expect(spans).toHaveLength(1);
		expect(spans[0]?.status.code).toBe(2); // SpanStatusCode.ERROR
	});
});
