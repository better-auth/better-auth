import { describe, expect, expectTypeOf, it } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { inferAdditionalFields } from "../additional-fields/client";
import { admin } from "./admin";
import { adminClient } from "./client";

describe("admin plugin auth-config type inference (prototype)", async () => {
	const { auth, signInWithTestUser } = await getTestInstance({
		user: {
			additionalFields: {
				customField: { type: "string", required: false },
			},
		},
		plugins: [admin()],
	});

	type GetUserResult = Awaited<ReturnType<typeof auth.api.getUser>>;

	it("infers config additionalFields on getUser return type", () => {
		expectTypeOf<GetUserResult>().not.toBeAny();
		expectTypeOf<GetUserResult>().toHaveProperty("customField");
		expectTypeOf<GetUserResult>().toHaveProperty("role");
		expectTypeOf<GetUserResult>().toHaveProperty("banned");
	});

	it("returns the field at runtime", async () => {
		const { headers } = await signInWithTestUser();
		const ctx = await auth.$context;
		const me = await auth.api.getSession({ headers });
		await ctx.internalAdapter.updateUser(me!.user.id, {
			role: "admin",
			customField: "hello",
		} as Record<string, unknown>);
		const user = await auth.api.getUser({
			query: { id: me!.user.id },
			headers,
		});
		expect(user.customField).toBe("hello");
	});

	it("infers additionalFields on client getUser via inferAdditionalFields", async () => {
		const client = createAuthClient({
			plugins: [adminClient(), inferAdditionalFields<typeof auth>()],
		});

		const { data: user } = await client.admin.getUser({
			query: { id: "test" },
		});
		user?.customField;

		type ClientGetUserData = NonNullable<
			Awaited<ReturnType<typeof client.admin.getUser>>["data"]
		>;
		expectTypeOf<ClientGetUserData>().not.toBeAny();
		expectTypeOf<ClientGetUserData>().toMatchTypeOf<{
			customField?: string | null | undefined;
			role?: string | null | undefined;
			banned?: boolean | null | undefined;
		}>();
	});

	it("infers additionalFields on client getUser via $InferAuth", () => {
		const client = createAuthClient({
			plugins: [adminClient()],
			$InferAuth: {} as typeof auth,
		});

		type ClientGetUserData = NonNullable<
			Awaited<ReturnType<typeof client.admin.getUser>>["data"]
		>;
		expectTypeOf<ClientGetUserData>().not.toBeAny();
		expectTypeOf<ClientGetUserData>().toMatchTypeOf<{
			customField?: string | null | undefined;
			role?: string | null | undefined;
			banned?: boolean | null | undefined;
		}>();
	});
});
