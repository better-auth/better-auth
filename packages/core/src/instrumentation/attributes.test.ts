import * as semanticConventions from "@opentelemetry/semantic-conventions";
import { describe, expect, it } from "vitest";
import * as attributes from "./attributes";

/**
 * @see https://opentelemetry.io/docs/specs/semconv/registry/attributes/db/
 * @see https://opentelemetry.io/docs/specs/semconv/registry/attributes/http/
 */
describe("instrumentation attributes", () => {
	it.each([
		"ATTR_DB_COLLECTION_NAME",
		"ATTR_DB_OPERATION_NAME",
		"ATTR_HTTP_RESPONSE_STATUS_CODE",
		"ATTR_HTTP_ROUTE",
	] as const)("%s matches OpenTelemetry", (name) => {
		expect(attributes[name]).toBe(semanticConventions[name]);
	});
});
