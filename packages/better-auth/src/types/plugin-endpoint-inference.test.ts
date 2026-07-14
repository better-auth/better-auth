import { describe, expectTypeOf, it } from "vitest";
import { createAuthClient } from "../client";
import { inferAdditionalFields } from "../plugins/additional-fields/client";
import { admin } from "../plugins/admin";
import { adminClient } from "../plugins/admin/client";
import { username } from "../plugins/username";
import { usernameClient } from "../plugins/username/client";
import { getTestInstance } from "../test-utils/test-instance";

type ClientGetUserData<C> = C extends {
	admin: {
		getUser: infer GetUser;
	};
}
	? GetUser extends (...args: never[]) => Promise<{ data: infer Data }>
		? NonNullable<Data>
		: never
	: never;

describe("plugin endpoint auth-config type inference", () => {
	describe("admin + user.additionalFields", () => {
		it("infers customField on server getUser", async () => {
			const { auth } = await getTestInstance({
				user: {
					additionalFields: {
						customField: { type: "string", required: false },
					},
				},
				plugins: [admin()],
			});

			type GetUserResult = Awaited<ReturnType<typeof auth.api.getUser>>;
			type SessionUser = (typeof auth)["$Infer"]["Session"]["user"];

			expectTypeOf<GetUserResult>().not.toBeAny();
			expectTypeOf<GetUserResult>().toMatchTypeOf<{
				customField?: string | null | undefined;
				role?: string | null | undefined;
				banned?: boolean | null | undefined;
			}>();
			expectTypeOf<SessionUser>().toHaveProperty("customField");
		});

		it("infers customField on client getUser via inferAdditionalFields", async () => {
			const { auth } = await getTestInstance({
				user: {
					additionalFields: {
						customField: { type: "string", required: false },
					},
				},
				plugins: [admin()],
			});

			const client = createAuthClient({
				plugins: [adminClient(), inferAdditionalFields<typeof auth>()],
			});

			type Data = ClientGetUserData<typeof client>;
			expectTypeOf<Data>().not.toBeAny();
			expectTypeOf<Data>().toMatchTypeOf<{
				customField?: string | null | undefined;
				role?: string | null | undefined;
				banned?: boolean | null | undefined;
			}>();
		});

		it("infers customField on client getUser via $InferAuth", async () => {
			const { auth } = await getTestInstance({
				user: {
					additionalFields: {
						customField: { type: "string", required: false },
					},
				},
				plugins: [admin()],
			});

			const client = createAuthClient({
				plugins: [adminClient()],
				$InferAuth: {} as typeof auth,
			});

			type Data = ClientGetUserData<typeof client>;
			expectTypeOf<Data>().not.toBeAny();
			expectTypeOf<Data>().toMatchTypeOf<{
				customField?: string | null | undefined;
				role?: string | null | undefined;
				banned?: boolean | null | undefined;
			}>();
		});
	});

	describe("admin + username plugin", () => {
		it("infers username fields on server getUser", async () => {
			const { auth } = await getTestInstance({
				plugins: [admin(), username()],
			});

			type GetUserResult = Awaited<ReturnType<typeof auth.api.getUser>>;
			type SessionUser = (typeof auth)["$Infer"]["Session"]["user"];

			expectTypeOf<GetUserResult>().not.toBeAny();
			expectTypeOf<GetUserResult>().toMatchTypeOf<{
				username?: string | null | undefined;
				displayUsername?: string | null | undefined;
				role?: string | null | undefined;
				banned?: boolean | null | undefined;
			}>();
			expectTypeOf<SessionUser>().toHaveProperty("username");
			expectTypeOf<SessionUser>().toHaveProperty("displayUsername");
		});

		it("infers username fields on client getUser via matching client plugins", () => {
			const client = createAuthClient({
				plugins: [adminClient(), usernameClient()],
			});

			type Data = ClientGetUserData<typeof client>;
			expectTypeOf<Data>().not.toBeAny();
			expectTypeOf<Data>().toMatchTypeOf<{
				username?: string | null | undefined;
				displayUsername?: string | null | undefined;
				role?: string | null | undefined;
				banned?: boolean | null | undefined;
			}>();
		});

		it("infers username fields on client getUser via $InferAuth", async () => {
			const { auth } = await getTestInstance({
				plugins: [admin(), username()],
			});

			const client = createAuthClient({
				plugins: [adminClient(), usernameClient()],
				$InferAuth: {} as typeof auth,
			});

			type Data = ClientGetUserData<typeof client>;
			expectTypeOf<Data>().not.toBeAny();
			expectTypeOf<Data>().toMatchTypeOf<{
				username?: string | null | undefined;
				displayUsername?: string | null | undefined;
				role?: string | null | undefined;
				banned?: boolean | null | undefined;
			}>();
		});
	});

	describe("admin + username + user.additionalFields", () => {
		it("infers both plugin and config fields on server getUser", async () => {
			const { auth } = await getTestInstance({
				user: {
					additionalFields: {
						customField: { type: "string", required: false },
					},
				},
				plugins: [admin(), username()],
			});

			type GetUserResult = Awaited<ReturnType<typeof auth.api.getUser>>;

			expectTypeOf<GetUserResult>().not.toBeAny();
			expectTypeOf<GetUserResult>().toMatchTypeOf<{
				customField?: string | null | undefined;
				username?: string | null | undefined;
				displayUsername?: string | null | undefined;
				role?: string | null | undefined;
			}>();
		});

		it("infers both on client getUser via inferAdditionalFields + usernameClient", async () => {
			const { auth } = await getTestInstance({
				user: {
					additionalFields: {
						customField: { type: "string", required: false },
					},
				},
				plugins: [admin(), username()],
			});

			const client = createAuthClient({
				plugins: [
					adminClient(),
					usernameClient(),
					inferAdditionalFields<typeof auth>(),
				],
			});

			type Data = ClientGetUserData<typeof client>;
			expectTypeOf<Data>().not.toBeAny();
			expectTypeOf<Data>().toMatchTypeOf<{
				customField?: string | null | undefined;
				username?: string | null | undefined;
				displayUsername?: string | null | undefined;
				role?: string | null | undefined;
			}>();
		});
	});
});
