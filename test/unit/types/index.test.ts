import type { BetterAuthOptions } from "@better-auth/core";
import type { Auth, InferUser } from "better-auth";
import type { AuthClient } from "better-auth/client";
import { expectTypeOf, test } from "vitest";

test("expect imports", async () => {
	expectTypeOf<AuthClient<{}>>().not.toBeUndefined();
});

test("infer user type correctly", async () => {
	const config = {
		user: {
			additionalFields: {
				onboardingCompleted: {
					type: "boolean",
					required: false,
					defaultValue: false,
					input: false,
					returned: true,
				},
			},
		},
	} satisfies BetterAuthOptions;
	type MyAuth = Auth<typeof config>;
	type User = InferUser<typeof config>;
	type Res = {
		id: string;
		createdAt: Date;
		updatedAt: Date;
		email: string;
		emailVerified: boolean;
		name?: string | null | undefined;
		image?: string | null | undefined;
		onboardingCompleted?: boolean | null | undefined;
	};
	expectTypeOf<User>().toMatchTypeOf<Res>();
	const { api } = {
		api:
			// use proxy to avoid runtime error
			new Proxy(
				{},
				{
					get: () => () => Promise.resolve({}),
				},
			),
	} as MyAuth;
	{
		const { user } = await api.signUpEmail({
			body: {
				name: "test",
				email: "",
				password: "",
			},
		});
		expectTypeOf(user).toMatchTypeOf<Res>();
	}
	{
		const { user } = await api.signInEmail({
			body: {
				email: "",
				password: "",
			},
		});
		expectTypeOf(user).toMatchTypeOf<Res>();
	}
});
