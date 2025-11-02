import { assert, expect } from "vitest";
import { createTestSuite } from "../create-test-suite";

/**
 * This test suite tests the performance of the adapter and logs the results.
 */
export const performanceTestSuite = createTestSuite(
	"performance",
	{},
	(
		{ adapter, generate, cleanup },
		config?: { iterations?: number; userSeedCount?: number; dialect?: string },
	) => {
		const tests = {
			create: [] as number[],
			update: [] as number[],
			delete: [] as number[],
			count: [] as number[],
			findOne: [] as number[],
			findMany: [] as number[],
		};

		const iterations = config?.iterations ?? 10;
		const userSeedCount = config?.userSeedCount ?? 15;

		assert(
			userSeedCount >= iterations,
			"userSeedCount must be greater than iterations",
		);

		const seedUser = async () => {
			const user = await generate("user");
			return await adapter.create({
				model: "user",
				data: user,
				forceAllowId: true,
			});
		};
		const seedManyUsers = async () => {
			const users = [];
			for (let i = 0; i < userSeedCount; i++) {
				users.push(await seedUser());
			}
			return users;
		};

		const performanceTests = {
			create: async () => {
				for (let i = 0; i < iterations; i++) {
					const start = performance.now();
					await seedUser();
					const end = performance.now();
					tests.create.push(end - start);
				}
			},
			update: async () => {
				const users = await seedManyUsers();
				for (let i = 0; i < iterations; i++) {
					const start = performance.now();
					await adapter.update({
						model: "user",
						where: [{ field: "id", value: users[i]!.id }],
						update: {
							name: `user-${i}`,
						},
					});
					const end = performance.now();
					tests.update.push(end - start);
				}
			},
			delete: async () => {
				const users = await seedManyUsers();
				for (let i = 0; i < iterations; i++) {
					const start = performance.now();
					await adapter.delete({
						model: "user",
						where: [{ field: "id", value: users[i]!.id }],
					});
					const end = performance.now();
					tests.delete.push(end - start);
				}
			},
			count: async () => {
				const users = await seedManyUsers();
				for (let i = 0; i < iterations; i++) {
					const start = performance.now();
					const c = await adapter.count({
						model: "user",
					});
					const end = performance.now();
					tests.count.push(end - start);
					expect(c).toEqual(users.length);
				}
			},
			findOne: async () => {
				const users = await seedManyUsers();
				for (let i = 0; i < iterations; i++) {
					const start = performance.now();
					await adapter.findOne({
						model: "user",
						where: [{ field: "id", value: users[i]!.id }],
					});
					const end = performance.now();
					tests.findOne.push(end - start);
				}
			},
			findMany: async () => {
				const users = await seedManyUsers();
				for (let i = 0; i < iterations; i++) {
					const start = performance.now();
					const result = await adapter.findMany({
						model: "user",
						where: [{ field: "name", value: "user", operator: "starts_with" }],
						limit: users.length,
					});
					const end = performance.now();
					tests.findMany.push(end - start);
					expect(result.length).toBe(users.length);
				}
			},
		};

		return {
			"run performance test": async () => {
				for (const test of Object.keys(performanceTests)) {
					await performanceTests[test as keyof typeof performanceTests]();
					await cleanup();
				}

				// Calculate averages for each test
				const averages = Object.entries(tests).reduce(
					(acc, [key, values]) => {
						const average =
							values.length > 0
								? values.reduce((sum, val) => sum + val, 0) / values.length
								: 0;
						acc[key] = `${average.toFixed(3)}ms`;
						return acc;
					},
					{} as Record<string, string>,
				);

				console.log(`Performance tests results, counting averages:`);
				console.table(averages);
				console.log({
					iterations,
					userSeedCount,
					adapter: adapter.options?.adapterConfig.adapterId,
					...(config?.dialect ? { dialect: config.dialect } : {}),
				});
				expect(1).toBe(1);
			},
		};
	},
);
