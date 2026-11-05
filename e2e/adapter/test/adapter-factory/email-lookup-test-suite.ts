import type { User } from "@better-auth/core/db";
import { createTestSuite } from "@better-auth/test-utils/adapter";
import { expect } from "vitest";

/**
 * `findUserByEmail` must return only the stored address, even where the
 * collation folds accents, such as MySQL's default `utf8mb4_0900_ai_ci`.
 */
export const emailLookupTestSuite = createTestSuite(
	"email lookup",
	{},
	({ adapter, getAuth, generate }) => {
		const setup = async () => {
			const auth = await getAuth();
			const { internalAdapter } = await auth.$context;
			const { id: _, ...data } = await generate("user");
			const local = `user-${crypto.randomUUID()}`;
			const user = await adapter.create<User>({
				model: "user",
				data: {
					...data,
					email: `${local}@example.com`,
				},
			});
			return { internalAdapter, local, user };
		};
		return {
			"findUserByEmail does not resolve an accented look-alike address":
				async () => {
					const { internalAdapter, local } = await setup();

					await expect(
						internalAdapter.findUserByEmail(
							`${local}@${"example.com".replace("a", "\u00e1")}`,
						),
					).resolves.toBeNull();
				},
			"findUserByEmail resolves the stored address in another case":
				async () => {
					const { internalAdapter, local, user } = await setup();

					await expect(
						internalAdapter.findUserByEmail(
							`${local.toUpperCase()}@EXAMPLE.COM`,
						),
					).resolves.toMatchObject({ user: { id: user.id } });
				},
		};
	},
);
