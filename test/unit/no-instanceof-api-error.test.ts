import { globSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Structural lock for cross-copy `APIError` detection.
 *
 * An app can install more than one copy of `better-call`, so an `APIError`
 * thrown by one copy fails `instanceof` against another. Package code must
 * recognize it with `isAPIError` from `@better-auth/core/utils/is-api-error`
 * (re-exported from `better-auth/api`), which also matches by name.
 *
 * @see https://github.com/better-auth/better-auth/issues/9012
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const EXCLUDED = [
	/\/packages\/core\/src\/utils\/is-api-error\.ts$/,
	/\.test\.ts$/,
	/\.d\.ts$/,
];

const INSTANCEOF_API_ERROR = /\binstanceof\s+\w*APIError\b/;

function stripComments(line: string): string {
	return line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
}

describe("APIError detection", () => {
	it("uses isAPIError instead of instanceof APIError in package code", () => {
		const files = globSync("packages/*/src/**/*.{ts,tsx}", {
			cwd: repoRoot,
		})
			.map((file) => resolve(repoRoot, file))
			.filter(
				(file) =>
					!EXCLUDED.some((pattern) => pattern.test(file.split(sep).join("/"))),
			);

		const offenders: string[] = [];
		for (const file of files) {
			const lines = readFileSync(file, "utf8").split("\n");
			lines.forEach((line, index) => {
				if (INSTANCEOF_API_ERROR.test(stripComments(line))) {
					const path = relative(repoRoot, file).split(sep).join("/");
					offenders.push(`${path}:${index + 1}`);
				}
			});
		}

		expect(files.length).toBeGreaterThan(0);
		expect(offenders).toEqual([]);
	});
});
