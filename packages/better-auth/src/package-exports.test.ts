import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pkgDir = path.resolve(import.meta.dirname, "..");
const pkg: {
	exports: Record<string, { "dev-source": string; types: string }>;
	typesVersions: { "*": Record<string, string[]> };
} = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
const entries = [
	...readFileSync(path.join(pkgDir, "tsdown.config.ts"), "utf8").matchAll(
		/"(\.\/src\/[^"]+\.ts)"/g,
	),
].map((match) => match[1]!);

/**
 * Build entries that intentionally have no subpath export.
 */
const internalEntries = new Set([
	// Lazy-loaded by the built-in Kysely adapter; users import `@better-auth/kysely-adapter`.
	"./src/adapters/kysely-adapter/index.ts",
]);

const toTypes = (entry: string) =>
	entry.replace("./src/", "./dist/").replace(/\.ts$/, ".d.mts");

/**
 * @see https://github.com/better-auth/better-auth/issues/10172
 */
describe("package.json subpaths", () => {
	it("reads the build entries from tsdown.config.ts", () => {
		expect(entries).toContain("./src/index.ts");
	});

	it.each(entries.filter((entry) => !internalEntries.has(entry)))(
		"exposes %s through exports and typesVersions",
		(entry) => {
			const subpath = Object.keys(pkg.exports).find(
				(key) => pkg.exports[key]!["dev-source"] === entry,
			);
			expect(subpath, `no exports entry for ${entry}`).toBeDefined();
			expect(pkg.exports[subpath!]!.types).toBe(toTypes(entry));
			expect(
				pkg.typesVersions["*"][subpath === "." ? "*" : subpath!.slice(2)],
			).toEqual([toTypes(entry)]);
		},
	);

	it("builds every exported subpath", () => {
		for (const [subpath, target] of Object.entries(pkg.exports)) {
			expect(entries, `${subpath} is not a build entry`).toContain(
				target["dev-source"],
			);
		}
	});
});
