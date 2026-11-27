import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as semanticConventions from "@opentelemetry/semantic-conventions";
import { describe, expect, it } from "vitest";
import * as attributes from "./attributes";

const SEMANTIC_CONVENTIONS = "@opentelemetry/semantic-conventions";

/**
 * @see https://opentelemetry.io/docs/specs/semconv/registry/attributes/db/
 * @see https://opentelemetry.io/docs/specs/semconv/registry/attributes/http/
 */
describe("instrumentation attributes", () => {
	it.for([
		"ATTR_DB_COLLECTION_NAME",
		"ATTR_DB_OPERATION_NAME",
		"ATTR_HTTP_RESPONSE_STATUS_CODE",
		"ATTR_HTTP_ROUTE",
	] as const)("%s matches the OpenTelemetry semantic convention", (name) => {
		expect(attributes[name]).toBe(semanticConventions[name]);
	});

	it("keeps the semantic conventions package out of production source", () => {
		const srcDir = fileURLToPath(new URL("..", import.meta.url));
		const importers = readdirSync(srcDir, { recursive: true, encoding: "utf8" })
			.filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
			.filter((file) =>
				readFileSync(join(srcDir, file), "utf8").includes(
					`"${SEMANTIC_CONVENTIONS}"`,
				),
			);

		expect(importers).toEqual([]);
	});
});
