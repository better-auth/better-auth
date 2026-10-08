import { describe, expect, it, vi } from "vitest";

/**
 * @see https://opentelemetry.io/docs/specs/semconv/registry/attributes/db/
 * @see https://opentelemetry.io/docs/specs/semconv/registry/attributes/http/
 */
describe("instrumentation attributes", () => {
	it("preserves semantic convention keys without loading the conventions package", async () => {
		vi.resetModules();
		const loadConventions = vi.fn(() => {
			throw new Error("Semantic conventions package is unavailable");
		});
		vi.doMock("@opentelemetry/semantic-conventions", loadConventions);
		try {
			const attributes = await import("./attributes");
			expect(attributes).toMatchObject({
				ATTR_DB_COLLECTION_NAME: "db.collection.name",
				ATTR_DB_OPERATION_NAME: "db.operation.name",
				ATTR_HTTP_RESPONSE_STATUS_CODE: "http.response.status_code",
				ATTR_HTTP_ROUTE: "http.route",
			});
			expect(loadConventions).not.toHaveBeenCalled();
		} finally {
			vi.doUnmock("@opentelemetry/semantic-conventions");
			vi.resetModules();
		}
	});
});
