import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAuthClient } from "../../client";

describe("signIn", async () => {
	const auth = await getTestInstance();
	const client = createAuthClient<typeof auth>({
		customFetchImpl: async (url, init) => {
			const req = new Request(url.toString(), init);
			const res = await auth.handler(req);
			return res;
		},
		csrfPlugin: false,
	});

	it("should sign up with email and password", async () => {
		// const res = await client.signUp.credential({
		// 	email: "test@test.com",
		// 	password: "test",
		// 	name: "test",
		// });
		// console.log(res);
	});
});
