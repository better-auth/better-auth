import { type Session } from "./../../db/schema";
import { describe, expect, expectTypeOf, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAuthClient } from "../../client";
import { inferAdditionalFields } from "./client";

describe("additionalFields", async () => {
	const { auth, signInWithTestUser } = await getTestInstance({
		user: {
			additionalFields: {
				newField: {
					type: "string",
					defaultValue: "test",
				},
				nonRequiredFiled: {
					type: "string",
					required: false,
				},
			},
		},
	});
	it("should extends fields", async () => {
		const { headers } = await signInWithTestUser();
		const res = await auth.api.getSession({
			headers,
		});
		expect(res?.user.newField).toBeDefined();
		expect(res?.user.nonRequiredFiled).toBeNull();
	});

	it("should require additional fields on signUp", async () => {
		await auth.api.signUpEmail({
			body: {
				email: "test@test.com",
				password: "test",
				name: "test",
				additionalFields: {
					nonRequiredFiled: "test",
					newField: "test",
				},
			},
		});
	});

	it("should infer it on the client", async () => {
		const client = createAuthClient({
			plugins: [inferAdditionalFields<typeof auth>()],
		});
		type t = Awaited<ReturnType<typeof client.session>>["data"];
		expectTypeOf<t>().toMatchTypeOf<{
			user: {
				id: string;
				email: string;
				emailVerified: boolean;
				name: string;
				createdAt: Date;
				updatedAt: Date;
				image?: string | undefined;
				newField: string;
				nonRequiredFiled?: string | undefined;
			};
			session: Session;
		} | null>;
	});
});
