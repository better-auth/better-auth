import { globSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Structural lock for the adapter compare-and-swap class of bug.
 *
 * `DBAdapter.update` is documented as not guaranteed to return the updated row
 * when more than one `where` clause is provided, so a multi-clause `update`
 * whose truthy/`null` return is read as a winner/loser signal is non-portable:
 * it passes on the in-memory adapter but throws or misreports on Prisma. The
 * race-safe primitive for a guarded single-row transition is `incrementOne`
 * (`UPDATE ... SET ... WHERE <guard> RETURNING *`, returns the row or `null`).
 *
 * This test fails if any consumer calls `adapter.update` with a statically
 * multi-clause `where` array, so the pattern cannot silently return.
 *
 * @see https://github.com/better-auth/better-auth/issues/10082
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Adapter implementations own `update`; the test suite exercises it directly;
// the factory and the with-hooks layer forward an arbitrary caller `where`.
// None of these is a consumer choosing a multi-clause guard.
const EXCLUDED = [
	/\/packages\/[^/]*-adapter\//,
	/\/packages\/test-utils\//,
	/\/packages\/core\/src\/db\/adapter\/factory\.ts$/,
	/\/packages\/better-auth\/src\/db\/with-hooks\.ts$/,
	/\.test\.ts$/,
	/\.d\.ts$/,
];

/** Replace string/template/comment spans with equal-length blanks so brace and
 * bracket counting is not thrown off by punctuation inside them. */
function blankNonCode(src: string): string {
	let out = "";
	let i = 0;
	const n = src.length;
	while (i < n) {
		const c = src[i];
		const two = src.slice(i, i + 2);
		if (two === "//") {
			while (i < n && src[i] !== "\n") {
				out += " ";
				i++;
			}
			continue;
		}
		if (two === "/*") {
			while (i < n && src.slice(i, i + 2) !== "*/") {
				out += src[i] === "\n" ? "\n" : " ";
				i++;
			}
			out += "  ";
			i += 2;
			continue;
		}
		if (c === '"' || c === "'" || c === "`") {
			const quote = c;
			out += " ";
			i++;
			while (i < n) {
				if (src[i] === "\\") {
					out += "  ";
					i += 2;
					continue;
				}
				if (src[i] === quote) {
					out += " ";
					i++;
					break;
				}
				out += src[i] === "\n" ? "\n" : " ";
				i++;
			}
			continue;
		}
		out += c;
		i++;
	}
	return out;
}

/** Count top-level elements in the array literal that begins at `src[open]`
 * (which must be `[`), splitting on commas at the array's own nesting depth.
 * `[{...}, condition]` reads as two clauses even when an element is an
 * identifier or spread rather than an object literal. */
function whereClauseCount(src: string, open: number): number {
	let depth = 0;
	let clauses = 0;
	let segmentHasContent = false;
	for (let i = open; i < src.length; i++) {
		const c = src[i]!;
		if (c === "[" || c === "(" || c === "{") {
			depth++;
			if (!(depth === 1 && c === "[")) segmentHasContent = true;
		} else if (c === "]" || c === ")" || c === "}") {
			depth--;
			if (depth === 0) {
				if (segmentHasContent) clauses++;
				break;
			}
		} else if (c === "," && depth === 1) {
			if (segmentHasContent) clauses++;
			segmentHasContent = false;
		} else if (!/\s/.test(c)) {
			segmentHasContent = true;
		}
	}
	return clauses;
}

// Matches any receiver ending in `adapter`/`Adapter` then `.update`, but not
// `.updateMany` (the `\b` after `update` fails before `Many`). The optional
// type-argument list and the opening paren are resolved separately so nested
// generics like `update<Foo<Bar>>(` are handled.
const callRe = /\b\w*[Aa]dapter\.update\b/g;

/** From just past `.update`, skip whitespace and an optional balanced `<...>`
 * type-argument list, and return the index of the call's `(`, or -1 if this
 * `.update` is not a call. */
function callParenIndex(src: string, afterUpdate: number): number {
	let i = afterUpdate;
	while (i < src.length && /\s/.test(src[i]!)) i++;
	if (src[i] === "<") {
		let angle = 0;
		for (; i < src.length; i++) {
			if (src[i] === "<") angle++;
			else if (src[i] === ">" && --angle === 0) {
				i++;
				break;
			}
		}
		while (i < src.length && /\s/.test(src[i]!)) i++;
	}
	return src[i] === "(" ? i : -1;
}

function findViolations(file: string): { line: number; arity: number }[] {
	const raw = readFileSync(file, "utf8");
	const code = blankNonCode(raw);
	const violations: { line: number; arity: number }[] = [];
	for (const match of code.matchAll(callRe)) {
		const callStart = callParenIndex(code, match.index! + match[0].length);
		if (callStart === -1) continue; // a `.update` reference, not a call
		// Find the `where:` key directly inside the single argument object.
		let depth = 0;
		let whereArrayOpen = -1;
		for (let i = callStart; i < code.length; i++) {
			const c = code[i];
			if (c === "(" || c === "{" || c === "[") depth++;
			else if (c === ")" || c === "}" || c === "]") {
				depth--;
				if (depth === 0) break; // end of the call
			} else if (depth === 2 && code.startsWith("where", i)) {
				// depth 2 == inside the arg object `{` (depth 1 is the call `(`).
				const after = code.slice(i + 5).match(/^\s*:\s*/);
				if (after) {
					const valueAt = i + 5 + after[0].length;
					if (code[valueAt] === "[") whereArrayOpen = valueAt;
					break;
				}
			}
		}
		if (whereArrayOpen === -1) continue; // no inline `where` array literal
		const arity = whereClauseCount(code, whereArrayOpen);
		if (arity >= 2) {
			const line = raw.slice(0, match.index).split("\n").length;
			violations.push({ line, arity });
		}
	}
	return violations;
}

describe("adapter.update compare-and-swap lock", () => {
	it("no consumer calls adapter.update with a multi-clause where", () => {
		const files = globSync("packages/*/src/**/*.ts", {
			cwd: repoRoot,
		})
			.map((f) => resolve(repoRoot, f))
			.filter((f) => !EXCLUDED.some((re) => re.test(f)));

		const offenders: string[] = [];
		for (const file of files) {
			for (const { line, arity } of findViolations(file)) {
				offenders.push(
					`${relative(repoRoot, file)}:${line} (where has ${arity} clauses)`,
				);
			}
		}

		expect(
			offenders,
			offenders.length
				? `Multi-clause adapter.update is non-portable (issue #10082). Use adapter.incrementOne for a guarded single-row transition:\n${offenders.join("\n")}`
				: undefined,
		).toEqual([]);
	});
});
