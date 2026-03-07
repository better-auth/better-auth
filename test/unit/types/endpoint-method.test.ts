import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { Auth } from "better-auth";
import { createAuthClient, InferPlugin } from "better-auth/client";
import { customSession } from "better-auth/plugins/custom-session";
import { describe, expectTypeOf, test } from "vitest";

describe("Endpoint method types", () => {
	test("createAuthEndpoint preserves literal method for POST", () => {
		const endpoint = createAuthEndpoint(
			"/test",
			{ method: "POST" },
			async () => ({ ok: true }),
		);
		type Method = (typeof endpoint)["options"]["method"];
		expectTypeOf<Method>().toEqualTypeOf<"POST">();
	});

	test("createAuthEndpoint preserves literal method for GET", () => {
		const endpoint = createAuthEndpoint(
			"/test-get",
			{ method: "GET" },
			async () => ({ ok: true }),
		);
		type Method = (typeof endpoint)["options"]["method"];
		expectTypeOf<Method>().toEqualTypeOf<"GET">();
	});

	test("createAuthEndpoint normalizes array methods to mutable array", () => {
		const endpoint = createAuthEndpoint(
			"/test-multi",
			{ method: ["GET", "POST"] },
			async () => ({ ok: true }),
		);
		type Method = (typeof endpoint)["options"]["method"];
		// Should be a mutable union array, not a readonly tuple
		expectTypeOf<Method>().toEqualTypeOf<("GET" | "POST")[]>();
	});

	test("path-less overload preserves method type", () => {
		const endpoint = createAuthEndpoint({ method: "DELETE" }, async () => ({
			deleted: true,
		}));
		type Method = (typeof endpoint)["options"]["method"];
		expectTypeOf<Method>().toEqualTypeOf<"DELETE">();
	});
});

describe("Plugin endpoint override types", () => {
	test("server-side Auth api reflects custom session plugin override", () => {
		const options = {
			plugins: [
				customSession(async ({ user, session }) => {
					return {
						user: { firstName: user.name.split(" ")[0] },
						custom: { data: "test" },
						session,
					};
				}),
			],
		} satisfies BetterAuthOptions;

		type TestAuth = Auth<typeof options>;

		// getSession should exist on the Auth api
		expectTypeOf<TestAuth["api"]>().toHaveProperty("getSession");
	});

	test("$Infer.Session reflects custom session return type", () => {
		const options = {
			plugins: [
				customSession(async ({ user, session }) => {
					return {
						extra: { field: "value" },
					};
				}),
			],
		} satisfies BetterAuthOptions;

		type TestAuth = Auth<typeof options>;
		type Session = TestAuth["$Infer"]["Session"];

		expectTypeOf<Session>().toEqualTypeOf<{
			extra: { field: string };
		}>();
	});

	test("plugin with custom endpoints preserves base api methods", () => {
		const testPlugin = {
			id: "test-plugin",
			endpoints: {
				customEndpoint: createAuthEndpoint(
					"/custom",
					{ method: "POST" },
					async () => ({ result: true }),
				),
			},
		} satisfies BetterAuthPlugin;

		type TestAuth = Auth<{
			plugins: [typeof testPlugin];
		}>;

		// Base methods should still exist on server api
		expectTypeOf<TestAuth["api"]>().toHaveProperty("getSession");
		expectTypeOf<TestAuth["api"]>().toHaveProperty("signOut");
		expectTypeOf<TestAuth["api"]>().toHaveProperty("signUpEmail");
		expectTypeOf<TestAuth["api"]>().toHaveProperty("signInEmail");
	});

	test("plugin overriding getSession replaces base type cleanly", () => {
		const plugin = {
			id: "override-plugin",
			endpoints: {
				getSession: createAuthEndpoint(
					"/get-session",
					{ method: "GET" },
					async () => ({ custom: true }),
				),
			},
		} satisfies BetterAuthPlugin;

		type TestAuth = Auth<{
			plugins: [typeof plugin];
		}>;

		// getSession should exist (not broken by method type conflict)
		expectTypeOf<TestAuth["api"]>().toHaveProperty("getSession");
		// Other endpoints should still exist
		expectTypeOf<TestAuth["api"]>().toHaveProperty("signOut");
	});
});

describe("Client getSession return type", () => {
	test("client getSession returns custom session data with customSession plugin", () => {
		const options = {
			plugins: [
				customSession(async ({ user, session }) => {
					return {
						user: {
							firstName: user.name.split(" ")[0],
							lastName: user.name.split(" ")[1],
						},
						newData: { message: "Hello, World!" },
						session,
					};
				}),
			],
		} satisfies BetterAuthOptions;

		// Extract the plugin type to feed into InferPlugin
		type CustomSessionPlugin = (typeof options)["plugins"][0];

		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [InferPlugin<CustomSessionPlugin>()],
		});

		// getSession should exist on the client
		expectTypeOf(client).toHaveProperty("getSession");
	});

	test("server-side getSession return type is not any with custom session", () => {
		const options = {
			plugins: [
				customSession(async ({ user, session }) => {
					return {
						customField: "value",
						user,
					};
				}),
			],
		} satisfies BetterAuthOptions;

		type TestAuth = Auth<typeof options>;
		type GetSession = TestAuth["api"]["getSession"];
		// Call the server-side getSession and check the return type
		type Result = NonNullable<Awaited<ReturnType<GetSession>>>;

		// Result must NOT be `any`
		expectTypeOf<Result>().not.toBeAny();

		// Should include customField from the custom session handler
		expectTypeOf<Result>().toHaveProperty("customField");
	});

	test("client preserves base methods when custom session plugin is used", () => {
		const options = {
			plugins: [
				customSession(async ({ user, session }) => {
					return { extra: true };
				}),
			],
		} satisfies BetterAuthOptions;

		type CustomSessionPlugin = (typeof options)["plugins"][0];

		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [InferPlugin<CustomSessionPlugin>()],
		});

		// All base methods should be present
		expectTypeOf(client).toHaveProperty("getSession");
		expectTypeOf(client).toHaveProperty("signUp");
		expectTypeOf(client).toHaveProperty("signOut");
		expectTypeOf(client).toHaveProperty("signIn");
	});
});
