import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("sign-out", async () => {
	const afterSessionDeleted = vi.fn();
	const mockOnLogout = vi.fn();
	const { signInWithTestUser, client } = await getTestInstance({
		onLogout: async ({ userId }) => {
			await mockOnLogout(userId);
		},
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

	it("should call onLogout with userId after sign out", async () => {
		mockOnLogout.mockClear();
		const { runWithUser, user } = await signInWithTestUser();
		await runWithUser(async () => {
			await client.signOut();
			expect(mockOnLogout).toHaveBeenCalledWith(user.id);
		});
	});
});
