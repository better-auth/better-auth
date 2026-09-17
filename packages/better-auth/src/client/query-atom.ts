import { atom } from "nanostores";

export const kAuthQueryServerSnapshot = Symbol(
	"better-auth:query-server-snapshot",
);

export function createAuthQueryAtom<T>(initialValue: T) {
	return Object.assign(atom(initialValue), {
		[kAuthQueryServerSnapshot]: () => initialValue,
	});
}
