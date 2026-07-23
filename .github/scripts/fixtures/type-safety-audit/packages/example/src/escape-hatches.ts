// biome-ignore lint/suspicious/noTsIgnore: the audit fixture must contain a real directive
// @ts-ignore fixture suppression
// @ts-expect-error fixture suppression
// @ts-nocheck fixture suppression
declare const value: unknown;

export const doubleAssertion = value as unknown as { id: string };
export const anyAssertion = value as any;
export const broadAssertion = value as { id: string };
export const nonNullAssertion = (value as { id?: string }).id!;

export type Unsafe<T = any> = T;

export function isString(input: unknown): input is string {
	return typeof input === "string";
}

export function assertString(input: unknown): asserts input is string {
	if (!isString(input)) throw new Error("expected string");
}

// biome-ignore lint/correctness/noUnusedVariables: the audit fixture needs declaration merging
interface MergedFixture {
	first: string;
}

// biome-ignore lint/correctness/noUnusedVariables: the audit fixture needs declaration merging
interface MergedFixture {
	second: string;
}

declare module "fixture-package" {
	interface FixtureExtension {
		id: string;
	}
}
