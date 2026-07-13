import { describe, expect, expectTypeOf, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { admin } from "./admin";

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
});
