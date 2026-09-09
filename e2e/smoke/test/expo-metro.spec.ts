import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseSync } from "@babel/core";

type CollectDependencies =
	typeof import("@expo/metro-config/build/transform-worker/collect-dependencies.js").default;

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const require = createRequire(import.meta.url);
const { default: collectDependencies } =
	require("@expo/metro-config/build/transform-worker/collect-dependencies.js") as {
		default: CollectDependencies;
	};

/**
 * @see https://github.com/better-auth/better-auth/issues/11197
 */
it("marks the OpenTelemetry import as optional for Metro", async () => {
	const instrumentationPath = join(
		repositoryRoot,
		"packages/core/dist/instrumentation/api.mjs",
	);
	const source = await readFile(instrumentationPath, "utf8");
	const ast = parseSync(source, { sourceType: "module" });

	assert.ok(ast);

	const { dependencies } = collectDependencies(ast, {
		allowOptionalDependencies: true,
		asyncRequireModulePath: "metro-runtime/src/modules/asyncRequire",
		collectOnly: true,
		dynamicRequires: "reject",
		inlineableCalls: ["require"],
		keepRequireNames: false,
		unstable_allowRequireContext: false,
		unstable_isESMImportAtSource: null,
	});
	const openTelemetryDependency = dependencies.find(
		(dependency) => dependency.name === "@opentelemetry/api",
	);

	assert.ok(
		openTelemetryDependency,
		"Metro should discover the OpenTelemetry import",
	);
	assert.equal(
		openTelemetryDependency.data.isOptional,
		true,
		"Metro should treat the OpenTelemetry import as optional",
	);
});
