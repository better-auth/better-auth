import { atom, computed } from "nanostores";
import type { AuthClientPlugin } from "./types";
import type { BetterAuthPlugin } from "../types/plugins";
import { createAuthEndpoint } from "../api/call";

const serverPlugin = {
	id: "test",
	endpoints: {
		test: createAuthEndpoint(
			"/test",
			{
				method: "GET",
			},
			async (c) => {
				return {
					data: "test",
				};
			},
		),
		testSignOut2: createAuthEndpoint(
			"/test-2/sign-out",
			{
				method: "POST",
			},
			async (c) => {
				return null;
			},
		),
	},
	schema: {
		user: {
			fields: {
				testField: {
					type: "string",
					required: false,
				},
				testField2: {
					type: "number",
					required: false,
				},
				testField3: {
					type: "string",
					returned: false,
				},
				testField4: {
					type: "string",
					defaultValue: "test",
				},
			},
		},
	},
} satisfies BetterAuthPlugin;

export const testClientPlugin = () => {
	const _test = atom(false);
	let testValue = 0;
	const computedAtom = computed(_test, () => {
		return testValue++;
	});
	return {
		id: "test",
		getActions($fetch) {
			return {
				setTestAtom(value: boolean) {
					_test.set(value);
				},
			};
		},
		getAtoms($fetch) {
			return {
				_test,
				computedAtom,
			};
		},
		$InferServerPlugin: {} as typeof serverPlugin,
		atomListeners: [
			{
				matcher: (path) => path === "/test",
				signal: "_test",
			},
			{
				matcher: (path) => path === "/test2/sign-out",
				signal: "_sessionSignal",
			},
		],
	} satisfies AuthClientPlugin;
};
