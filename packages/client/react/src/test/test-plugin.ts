import { atom, computed } from "nanostores";
import type {
	BetterAuthClientPlugin,
	useAuthQuery,
} from "@better-auth/client-core";

export const testClientPlugin = () => {
	const $test = atom(false);
	let testValue = 0;
	const computedAtom = computed($test, () => {
		return testValue++;
	});
	return {
		id: "test" as const,
		getActions($fetch: any) {
			return {
				setTestAtom(value: boolean) {
					$test.set(value);
				},
				test: {
					signOut: async () => {},
				},
			};
		},
		getAtoms($fetch: any) {
			const $signal = atom(false);
			// Note: In real usage, useAuthQuery would be imported properly
			const queryAtom = atom({ data: null, error: null, isPending: false });
			return {
				$test,
				$signal,
				computedAtom,
				queryAtom,
			};
		},
		$InferServerPlugin: {} as any,
		atomListeners: [
			{
				matcher: (path: string) => path === "/test",
				signal: "$test",
			},
			{
				matcher: (path: string) => path === "/test2/sign-out",
				signal: "$sessionSignal",
			},
		],
	} satisfies BetterAuthClientPlugin;
};
