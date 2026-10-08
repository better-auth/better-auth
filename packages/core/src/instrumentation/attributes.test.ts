import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
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

	it("loads the attribute constants without installed dependencies", () => {
		const source = readFileSync(
			new URL("./attributes.ts", import.meta.url),
			"utf8",
		);
		// A data URL has no package-resolution base, so installed dev dependencies
		// cannot mask a runtime import of the semantic conventions package.
		const moduleURL = `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source))}`;
		const output = execFileSync(
			process.execPath,
			[
				"--input-type=module",
				"--eval",
				"const attributes = await import(process.argv[1]); console.log(JSON.stringify(attributes));",
				moduleURL,
			],
			{ encoding: "utf8", timeout: 5_000 },
		);
		expect(JSON.parse(output)).toEqual({ ...attributes });
	});
});
