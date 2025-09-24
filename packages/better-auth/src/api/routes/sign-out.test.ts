import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("sign-out", async (it) => {
	const { signInWithTestUser, client } = await getTestInstance();

	it("should sign out", async () => {
		const { runWithDefaultUser } = await signInWithTestUser();
		await runWithDefaultUser(async () => {
			const res = await client.signOut();
			expect(res.data).toMatchObject({
				success: true,
			});
		});
	});
});
