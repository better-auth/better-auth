import type { Atom } from "nanostores";

export function isAtom(value: unknown): value is Atom<unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		"get" in value &&
		typeof (value as any).get === "function" &&
		"lc" in value &&
		typeof (value as any).lc === "number"
	);
}
