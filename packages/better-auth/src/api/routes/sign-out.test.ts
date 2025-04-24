import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("sign-out", async (it) => {
	const { signInWithTestUser, client } = await getTestInstance();

	it("should sign out", async () => {
		const { headers } = await signInWithTestUser();
		const res = await client.signOut({
			fetchOptions: {
				headers,
			},
		});
		expect(res.data).toMatchObject({
			success: true,
		});
	});
});
