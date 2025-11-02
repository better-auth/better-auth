import type { Account, Session } from "@better-auth/core/db";
import { assert, expect } from "vitest";
import { createTestSuite } from "../create-test-suite";

/**
 * This test suite tests the performance of the adapter and logs the results.
 */
export const performanceTestSuite = createTestSuite(
	"performance",
	{},
	(
		{ generate, cleanup, adapter: originalAdapter },
		config?:
			| { iterations?: number; userSeedCount?: number; dialect?: string }
			| undefined,
	) => {
		const tests = {
			create: [] as number[],
			update: [] as number[],
			delete: [] as number[],
			count: [] as number[],
			findOne: [] as number[],
			findMany: [] as number[],
			findManyWithJoin: [] as number[],
			findManyWithoutJoin: [] as number[],
		};

		const iterations = config?.iterations ?? 10;
		const userSeedCount = config?.userSeedCount ?? 15;
		const dbLatencyMs = 50;

		const createDelayedAdapter = (adapterInstance: typeof originalAdapter) => {
			if (dbLatencyMs <= 0) return adapterInstance;

			const delay = () =>
				new Promise((resolve) => setTimeout(resolve, dbLatencyMs));

			return {
				...adapterInstance,
				id: adapterInstance.id,
				async create(data: any) {
					await delay();
					return adapterInstance.create(data);
				},
				async findOne(data: any) {
					await delay();
					return adapterInstance.findOne(data);
				},
				async findMany(data: any) {
					await delay();
					return adapterInstance.findMany(data);
				},
				async update(data: any) {
					await delay();
					return adapterInstance.update(data);
				},
				async delete(data: any) {
					await delay();
					return adapterInstance.delete(data);
				},
				async updateMany(data: any) {
					await delay();
					return adapterInstance.updateMany(data);
				},
				async deleteMany(data: any) {
					await delay();
					return adapterInstance.deleteMany(data);
				},
				async count(data: any) {
					await delay();
					return adapterInstance.count(data);
				},
				async transaction(cb: any) {
					return adapterInstance.transaction(cb);
				},
				options: adapterInstance.options,
			};
		};

		const adapter = createDelayedAdapter(originalAdapter);

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

		// Helper to create sessions and accounts for users
		const seedUserWithRelations = async (users: any[]) => {
			for (const user of users) {
				// Create sessions for this user
				for (let i = 0; i < 2; i++) {
					await adapter.create<Session>({
						model: "session",
						data: {
							...(await generate("session" as const)),
							userId: user.id,
						} as Omit<Session, "id">,
						forceAllowId: true,
					});
				}
				// Create accounts for this user
				for (let i = 0; i < 2; i++) {
					await adapter.create<Account>({
						model: "account",
						data: {
							...(await generate("account" as const)),
							userId: user.id,
						} as Omit<Account, "id">,
						forceAllowId: true,
					});
				}
			}
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
			findManyWithJoin: async () => {
				const users = await seedManyUsers();
				await seedUserWithRelations(users);
				for (let i = 0; i < iterations; i++) {
					const start = performance.now();
					const result = await adapter.findMany({
						model: "user",
						join: {
							session: true,
							account: true,
						},
						limit: users.length,
					});
					const end = performance.now();
					tests.findManyWithJoin.push(end - start);
					expect(result.length).toBeGreaterThan(0);
				}
			},
			findManyWithoutJoin: async () => {
				const users = await seedManyUsers();
				await seedUserWithRelations(users);
				for (let i = 0; i < iterations; i++) {
					const start = performance.now();
					// Query without joins - simulate fetching related data through separate queries
					const userList = await adapter.findMany({
						model: "user",
						limit: users.length,
					});
					// Fetch all sessions and accounts, then filter by userId
					const allSessions = await adapter.findMany({
						model: "session",
					});
					const allAccounts = await adapter.findMany({
						model: "account",
					});

					// Manually assemble the same structure as join would produce
					const result = userList.map((user: any) => ({
						...user,
						session: allSessions.filter((s: any) => s.userId === user.id),
						account: allAccounts.filter((a: any) => a.userId === user.id),
					}));
					// console.log(result)
					const end = performance.now();
					tests.findManyWithoutJoin.push(end - start);
					expect(result.length).toBeGreaterThan(0);
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
					...(dbLatencyMs > 0
						? { simulatedDbLatency: `${dbLatencyMs}ms` }
						: {}),
				});

				// Calculate and log join vs non-join difference
				const joinAvg =
					tests.findManyWithJoin.length > 0
						? tests.findManyWithJoin.reduce((sum, val) => sum + val, 0) /
							tests.findManyWithJoin.length
						: 0;
				const nonJoinAvg =
					tests.findManyWithoutJoin.length > 0
						? tests.findManyWithoutJoin.reduce((sum, val) => sum + val, 0) /
							tests.findManyWithoutJoin.length
						: 0;

				if (joinAvg > 0 && nonJoinAvg > 0) {
					const difference = joinAvg - nonJoinAvg;
					const percentDifference = ((difference / nonJoinAvg) * 100).toFixed(
						2,
					);
					console.log(`\nJoin Performance Comparison:`);
					console.log(`  With JoinOption:    ${joinAvg.toFixed(3)}ms`);
					console.log(`  Without JoinOption: ${nonJoinAvg.toFixed(3)}ms`);
					console.log(
						`  Difference:   ${difference.toFixed(3)}ms (${percentDifference}%)`,
					);
				}

				expect(1).toBe(1);
			},
		};
	},
);
 