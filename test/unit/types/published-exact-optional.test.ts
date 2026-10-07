import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { expect, it } from "vitest";

/** @see https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html */
it("publishes organization and OAuth declarations that pass exact optional checking", () => {
	const fixture = fileURLToPath(
		new URL(
			"../../../packages/oauth-provider/test/fixtures/published-exact-optional.ts",
			import.meta.url,
		),
	);
	const program = ts.createProgram([fixture], {
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		strict: true,
		noEmit: true,
		exactOptionalPropertyTypes: true,
		noUncheckedIndexedAccess: true,
		skipLibCheck: false,
		types: ["node", "bun"],
	});
	expect(
		ts
			.getPreEmitDiagnostics(program)
			.map((diagnostic) =>
				ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
			),
	).toEqual([]);
});
