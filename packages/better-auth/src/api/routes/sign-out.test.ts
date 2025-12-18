import { describe, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("sign-out", async (it) => {
	const afterSessionDeleted = vi.fn();
	const { signInWithTestUser, client } = await getTestInstance({
		databaseHooks: {
			session: {
				delete: {
					after: afterSessionDeleted,
				},
			},
		},
	});

	it("should sign out", async () => {
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async () => {
			const res = await client.signOut();
			expect(res.data).toMatchObject({
				success: true,
			});

			expect(afterSessionDeleted).toHaveBeenCalled();
		});
	});
});
