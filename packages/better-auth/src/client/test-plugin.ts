import { atom, computed } from "nanostores";
import type { BetterAuthClientPlugin } from "./types";
import type { AuthPluginSchema, BetterAuthPlugin } from "../types/plugins";
import { createAuthEndpoint } from "../api/call";
import { useAuthQuery } from "./query";
import z from "zod";
import { field, type schema } from "../db";

const dbSchema = {
	user: {
		fields: {
			testField: field("string", {
				required: false,
			}),
			testField2: field("number", {
				required: false,
			}),
			testField3: field("string", {
				returned: false,
			}),
			testField4: field("string", {
				defaultValue: "test",
			}),
		},
	},
} satisfies AuthPluginSchema;

const serverPlugin = {
	id: "test",
	endpoints: {
		test: createAuthEndpoint(
			"/test",
			{
				method: "GET",
				error: z.object({
					code: z.number(),
					message: z.string(),
					test: z.boolean(),
				}),
			},
			async (c) => {
				c.context.adapter.create({
					model: "user",
					data: {
						testField4: "abc",
						r: true,
					},
				});
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
	schema: dbSchema,
} satisfies BetterAuthPlugin<typeof dbSchema>;

export const testClientPlugin = () => {
	const $test = atom(false);
	let testValue = 0;
	const computedAtom = computed($test, () => {
		return testValue++;
	});
	return {
		id: "test" as const,
		getActions($fetch) {
			return {
				setTestAtom(value: boolean) {
					$test.set(value);
				},
				test: {
					signOut: async () => {},
				},
			};
		},
		getAtoms($fetch) {
			const $signal = atom(false);
			const queryAtom = useAuthQuery<any>($signal, "/test", $fetch, {
				method: "GET",
			});
			return {
				$test,
				$signal,
				computedAtom,
				queryAtom,
			};
		},
		$InferServerPlugin: {} as typeof serverPlugin,
		atomListeners: [
			{
				matcher: (path) => path === "/test",
				signal: "$test",
			},
			{
				matcher: (path) => path === "/test2/sign-out",
				signal: "$sessionSignal",
			},
		],
	} satisfies BetterAuthClientPlugin;
};

export const testClientPlugin2 = () => {
	const $test2 = atom(false);
	let testValue = 0;
	const anotherAtom = computed($test2, () => {
		return testValue++;
	});
	return {
		id: "test",
		getAtoms($fetch) {
			return {
				$test2,
				anotherAtom,
			};
		},
		atomListeners: [
			{
				matcher: (path) => path === "/test",
				signal: "$test",
			},
			{
				matcher: (path) => path === "/test2/sign-out",
				signal: "$sessionSignal",
			},
		],
	} satisfies BetterAuthClientPlugin;
};
