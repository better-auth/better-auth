import type { BetterAuthOptions } from "@better-auth/core";
import { getAuthTables } from "@better-auth/core/db";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import {
	createAdapterFactory,
	deepmerge,
	initGetDefaultModelName,
} from "@better-auth/core/db/adapter";
import { TTY_COLORS } from "@better-auth/core/env";
import { generateId } from "@better-auth/core/utils";
import { test } from "vitest";
import { betterAuth } from "../auth";
import type { Account, Session, User, Verification } from "../types";
import type { Logger } from "./test-adapter";

/**
 * Test entry type that supports both callback and object formats.
 * Object format allows specifying migration options that will be applied before the test runs.
 */
export type TestEntry =
	| ((context: {
			readonly skip: {
				(note?: string | undefined): never;
				(condition: boolean, note?: string | undefined): void;
			};
	  }) => Promise<void>)
	| {
			migrateBetterAuth?: BetterAuthOptions;
			test: (context: {
				readonly skip: {
					(note?: string | undefined): never;
					(condition: boolean, note?: string | undefined): void;
				};
			}) => Promise<void>;
	  };

/**
 * Deep equality comparison for BetterAuthOptions.
 * Handles nested objects, arrays, and primitive values.
 */
function deepEqual(a: any, b: any): boolean {
	if (a === b) return true;
	if (a == null || b == null) return a === b;
	if (typeof a !== typeof b) return false;

	if (typeof a === "object") {
		if (Array.isArray(a) !== Array.isArray(b)) return false;

		if (Array.isArray(a)) {
			if (a.length !== b.length) return false;
			for (let i = 0; i < a.length; i++) {
				if (!deepEqual(a[i], b[i])) return false;
			}
			return true;
		}

		const keysA = Object.keys(a);
		const keysB = Object.keys(b);

		if (keysA.length !== keysB.length) return false;

		for (const key of keysA) {
			if (!keysB.includes(key)) return false;
			if (!deepEqual(a[key], b[key])) return false;
		}

		return true;
	}

	return false;
}

/**
 * Statistics tracking for test suites.
 */
export type TestSuiteStats = {
	migrationCount: number;
	totalMigrationTime: number;
	testCount: number;
	suiteStartTime: number;
	suiteDuration: number;
	suiteName: string;
	groupingStats?: {
		totalGroups: number;
		averageTestsPerGroup: number;
		largestGroupSize: number;
		smallestGroupSize: number;
		groupsWithMultipleTests: number;
		totalTestsInGroups: number;
	};
};

type GenerateFn = <M extends "user" | "session" | "verification" | "account">(
	Model: M,
) => Promise<
	M extends "user"
		? User
		: M extends "session"
			? Session
			: M extends "verification"
				? Verification
				: M extends "account"
					? Account
					: undefined
>;

type Success<T> = {
	data: T;
	error: null;
};

type Failure<E> = {
	data: null;
	error: E;
};

type Result<T, E = Error> = Success<T> | Failure<E>;

async function tryCatch<T, E = Error>(
	promise: Promise<T>,
): Promise<Result<T, E>> {
	try {
		const data = await promise;
		return { data, error: null };
	} catch (error) {
		return { data: null, error: error as E };
	}
}

export type InsertRandomFn = <
	M extends "user" | "session" | "verification" | "account",
	Count extends number = 1,
>(
	model: M,
	count?: Count | undefined,
) => Promise<
	Count extends 1
		? M extends "user"
			? [User]
			: M extends "session"
				? [User, Session]
				: M extends "verification"
					? [Verification]
					: M extends "account"
						? [User, Account]
						: [undefined]
		: Array<
				M extends "user"
					? [User]
					: M extends "session"
						? [User, Session]
						: M extends "verification"
							? [Verification]
							: M extends "account"
								? [User, Account]
								: [undefined]
			>
>;

export const createTestSuite = <
	Tests extends Record<string, TestEntry>,
	AdditionalOptions extends Record<string, any> = {},
>(
	suiteName: string,
	config: {
		defaultBetterAuthOptions?: BetterAuthOptions | undefined;
		/**
		 * Helpful if the default better auth options require migrations to be run.
		 */
		alwaysMigrate?: boolean | undefined;
		prefixTests?: string | undefined;
		customIdGenerator?: () => any | Promise<any> | undefined;
	},
	tests: (
		helpers: {
			adapter: DBAdapter<BetterAuthOptions>;
			log: Logger;
			generate: GenerateFn;
			insertRandom: InsertRandomFn;
			/**
			 * A light cleanup function that will only delete rows it knows about.
			 */
			cleanup: () => Promise<void>;
			/**
			 * A hard cleanup function that will delete all rows from the database.
			 */
			hardCleanup: () => Promise<void>;
			modifyBetterAuthOptions: (
				options: BetterAuthOptions,
				shouldRunMigrations: boolean,
			) => Promise<BetterAuthOptions>;
			getBetterAuthOptions: () => BetterAuthOptions;
			sortModels: (
				models: Array<
					Record<string, any> & {
						id: string;
					}
				>,
				by?: ("id" | "createdAt") | undefined,
			) => (Record<string, any> & {
				id: string;
			})[];
			getAuth: () => Promise<ReturnType<typeof betterAuth>>;
			tryCatch<T, E = Error>(promise: Promise<T>): Promise<Result<T, E>>;
			customIdGenerator?: () => any | Promise<any> | undefined;
			transformIdOutput?: (id: any) => string | undefined;
			/**
			 * Some adapters may change the ID type, this function allows you to pass the entire model
			 * data and it will return the correct better-auth-expected transformed data.
			 *
			 * Eg:
			 * MongoDB uses ObjectId for IDs, but it's possible the user can disable that option in the adapter config.
			 * Because of this, the expected data would be a string.
			 * These sorts of conversions will cause issues with the test when you use the `generate` function.
			 * This is because the `generate` function will return the raw data expected to be saved in DB, not the excpected BA output.
			 */
			transformGeneratedModel: (
				data: Record<string, any>,
			) => Record<string, any>;
		},
		additionalOptions?: AdditionalOptions | undefined,
	) => Tests,
) => {
	return (
		options?:
			| ({
					disableTests?: Partial<
						Record<keyof Tests, boolean> & { ALL?: boolean }
					>;
			  } & AdditionalOptions)
			| undefined,
	) => {
		return async (helpers: {
			adapter: () => Promise<DBAdapter<BetterAuthOptions>>;
			log: Logger;
			adapterDisplayName: string;
			getBetterAuthOptions: () => BetterAuthOptions;
			modifyBetterAuthOptions: (
				options: BetterAuthOptions,
			) => Promise<BetterAuthOptions>;
			cleanup: () => Promise<void>;
			runMigrations: () => Promise<void>;
			prefixTests?: string | undefined;
			onTestFinish: (stats: TestSuiteStats) => Promise<void>;
			customIdGenerator?: () => any | Promise<any> | undefined;
			transformIdOutput?: (id: any) => string | undefined;
		}) => {
			const createdRows: Record<string, any[]> = {};

			let adapter = await helpers.adapter();
			const wrapperAdapter = (
				overrideOptions?: BetterAuthOptions | undefined,
			) => {
				const options = deepmerge(
					deepmerge(
						helpers.getBetterAuthOptions(),
						config?.defaultBetterAuthOptions || {},
					),
					overrideOptions || {},
				);
				const adapterConfig = {
					adapterId: helpers.adapterDisplayName,
					...(adapter.options?.adapterConfig || {}),
					adapterName: `Wrapped ${adapter.options?.adapterConfig.adapterName}`,
					disableTransformOutput: true,
					disableTransformInput: true,
					disableTransformJoin: true,
				};
				const adapterCreator = (
					options: BetterAuthOptions,
				): DBAdapter<BetterAuthOptions> =>
					createAdapterFactory({
						config: {
							...adapterConfig,
							transaction: adapter.transaction,
						},
						adapter: ({ getDefaultModelName }) => {
							adapter.transaction = undefined as any;
							return {
								count: async (args: any) => {
									adapter = await helpers.adapter();
									const res = await adapter.count(args);
									return res as any;
								},
								deleteMany: async (args: any) => {
									adapter = await helpers.adapter();
									const res = await adapter.deleteMany(args);
									return res as any;
								},
								delete: async (args: any) => {
									adapter = await helpers.adapter();
									const res = await adapter.delete(args);
									return res as any;
								},
								findOne: async (args) => {
									adapter = await helpers.adapter();
									const res = await adapter.findOne(args);
									return res as any;
								},
								findMany: async (args) => {
									adapter = await helpers.adapter();
									const res = await adapter.findMany(args);
									return res as any;
								},
								update: async (args: any) => {
									adapter = await helpers.adapter();
									const res = await adapter.update(args);
									return res as any;
								},
								updateMany: async (args) => {
									adapter = await helpers.adapter();
									const res = await adapter.updateMany(args);
									return res as any;
								},
								createSchema: adapter.createSchema as any,
								async create({ data, model, select }) {
									const defaultModelName = getDefaultModelName(model);
									adapter = await helpers.adapter();
									const res = await adapter.create({
										data: data,
										model: defaultModelName,
										select,
										forceAllowId: true,
									});
									createdRows[model] = [...(createdRows[model] || []), res];
									return res as any;
								},
								options: adapter.options,
							};
						},
					})(options);

				return adapterCreator(options);
			};

			const resetDebugLogs = () => {
				//@ts-expect-error
				wrapperAdapter()?.adapterTestDebugLogs?.resetDebugLogs();
			};

			const printDebugLogs = () => {
				//@ts-expect-error
				wrapperAdapter()?.adapterTestDebugLogs?.printDebugLogs();
			};

			const cleanupCreatedRows = async () => {
				adapter = await helpers.adapter();
				for (const model of Object.keys(createdRows)) {
					for (const row of createdRows[model]!) {
						const schema = getAuthTables(helpers.getBetterAuthOptions());
						const getDefaultModelName = initGetDefaultModelName({
							schema,
							usePlural: adapter.options?.adapterConfig.usePlural,
						});
						let defaultModelName: string;
						try {
							defaultModelName = getDefaultModelName(model);
						} catch {
							continue;
						}
						if (!schema[defaultModelName]) continue; // model doesn't exist in the schema anymore, so we skip it
						try {
							await adapter.delete({
								model,
								where: [{ field: "id", value: row.id }],
							});
						} catch (error) {
							// We ignore any failed attempts to delete the created rows.
						}
						if (createdRows[model]!.length === 1) {
							delete createdRows[model];
						}
					}
				}
			};

			// Track current applied BetterAuth options state
			let currentAppliedOptions: BetterAuthOptions | null = null;

			// Statistics tracking
			const stats: TestSuiteStats = {
				migrationCount: 0,
				totalMigrationTime: 0,
				testCount: 0,
				suiteStartTime: performance.now(),
				suiteDuration: 0,
				suiteName,
			};

			/**
			 * Apply BetterAuth options and run migrations if needed.
			 * Tracks migration statistics.
			 */
			const applyOptionsAndMigrate = async (
				options: BetterAuthOptions | Partial<BetterAuthOptions>,
				forceMigrate: boolean = false,
			): Promise<BetterAuthOptions> => {
				const finalOptions = deepmerge(
					config?.defaultBetterAuthOptions || {},
					options || {},
				);

				// Check if options have changed
				const optionsChanged = !deepEqual(currentAppliedOptions, finalOptions);

				if (optionsChanged || forceMigrate) {
					adapter = await helpers.adapter();
					await helpers.modifyBetterAuthOptions(finalOptions);

					if (config.alwaysMigrate || forceMigrate) {
						const migrationStart = performance.now();
						await helpers.runMigrations();
						const migrationTime = performance.now() - migrationStart;

						stats.migrationCount++;
						stats.totalMigrationTime += migrationTime;

						adapter = await helpers.adapter();
					}

					currentAppliedOptions = finalOptions;
				} else {
					// Options haven't changed, just update the reference
					currentAppliedOptions = finalOptions;
				}

				return finalOptions;
			};

			const transformGeneratedModel = (data: Record<string, any>) => {
				let newData = { ...data };
				if (helpers.transformIdOutput) {
					newData.id = helpers.transformIdOutput(newData.id);
				}
				return newData;
			};

			const idGenerator = async () => {
				if (config.customIdGenerator) {
					return config.customIdGenerator();
				}
				if (helpers.customIdGenerator) {
					return helpers.customIdGenerator();
				}
				return generateId();
			};

			const generateModel: GenerateFn = async (model: string) => {
				const id = await idGenerator();
				const randomDate = new Date(
					Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 365,
				);
				if (model === "user") {
					const user: User = {
						id,
						createdAt: randomDate,
						updatedAt: new Date(),
						email:
							`user-${helpers.transformIdOutput?.(id) ?? id}@email.com`.toLowerCase(),
						emailVerified: true,
						name: `user-${helpers.transformIdOutput?.(id) ?? id}`,
						image: null,
					};
					return user as any;
				}
				if (model === "session") {
					const session: Session = {
						id,
						createdAt: randomDate,
						updatedAt: new Date(),
						expiresAt: new Date(),
						token: generateId(32),
						userId: generateId(),
						ipAddress: "127.0.0.1",
						userAgent: "Some User Agent",
					};
					return session as any;
				}
				if (model === "verification") {
					const verification: Verification = {
						id,
						createdAt: randomDate,
						updatedAt: new Date(),
						expiresAt: new Date(),
						identifier: `test:${generateId()}`,
						value: generateId(),
					};
					return verification as any;
				}
				if (model === "account") {
					const account: Account = {
						id,
						createdAt: randomDate,
						updatedAt: new Date(),
						accountId: generateId(),
						providerId: "test",
						userId: generateId(),
						accessToken: generateId(),
						refreshToken: generateId(),
						idToken: generateId(),
						accessTokenExpiresAt: new Date(),
						refreshTokenExpiresAt: new Date(),
						scope: "test",
					};
					return account as any;
				}
				// This should never happen given the type constraints, but TypeScript needs an exhaustive check
				throw new Error(`Unknown model type: ${model}`);
			};

			const insertRandom: InsertRandomFn = async <
				M extends "user" | "session" | "verification" | "account",
				Count extends number = 1,
			>(
				model: M,
				count: Count = 1 as Count,
			) => {
				let res: any[] = [];
				const a = wrapperAdapter();

				for (let i = 0; i < count; i++) {
					const modelResults = [];

					if (model === "user") {
						const user = await generateModel("user");
						modelResults.push(
							await a.create({
								data: user,
								model: "user",
								forceAllowId: true,
							}),
						);
					}
					if (model === "session") {
						const user = await generateModel("user");
						const userRes = await a.create({
							data: user,
							model: "user",
							forceAllowId: true,
						});
						const session = await generateModel("session");
						session.userId = userRes.id;
						const sessionRes = await a.create({
							data: session,
							model: "session",
							forceAllowId: true,
						});
						modelResults.push(userRes, sessionRes);
					}
					if (model === "verification") {
						const verification = await generateModel("verification");
						modelResults.push(
							await a.create({
								data: verification,
								model: "verification",
								forceAllowId: true,
							}),
						);
					}
					if (model === "account") {
						const user = await generateModel("user");
						const account = await generateModel("account");
						const userRes = await a.create({
							data: user,
							model: "user",
							forceAllowId: true,
						});
						account.userId = userRes.id;
						const accRes = await a.create({
							data: account,
							model: "account",
							forceAllowId: true,
						});
						modelResults.push(userRes, accRes);
					}
					res.push(modelResults);
				}
				return res.length === 1 ? res[0] : (res as any);
			};

			const sortModels = (
				models: Array<Record<string, any> & { id: string }>,
				by: "id" | "createdAt" = "id",
			) => {
				return models.sort((a, b) => {
					if (by === "createdAt") {
						return (
							new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
						);
					}
					return a.id.localeCompare(b.id);
				});
			};

			const modifyBetterAuthOptions = async (
				opts: BetterAuthOptions,
				shouldRunMigrations: boolean,
			) => {
				return await applyOptionsAndMigrate(opts, shouldRunMigrations);
			};

			const additionalOptions = { ...options };
			additionalOptions.disableTests = undefined;

			const fullTests = tests(
				{
					adapter: new Proxy({} as any, {
						get(target, prop) {
							const adapter = wrapperAdapter();
							if (prop === "transaction") {
								return adapter.transaction;
							}
							const value = adapter[prop as keyof typeof adapter];
							if (typeof value === "function") {
								return value.bind(adapter);
							}
							return value;
						},
					}),
					getAuth: async () => {
						adapter = await helpers.adapter();
						const auth = betterAuth({
							...helpers.getBetterAuthOptions(),
							...(config?.defaultBetterAuthOptions || {}),
							database: (options: BetterAuthOptions) => {
								const adapter = wrapperAdapter(options);
								return adapter;
							},
						});
						return auth;
					},
					log: helpers.log,
					generate: generateModel,
					cleanup: cleanupCreatedRows,
					hardCleanup: helpers.cleanup,
					insertRandom,
					modifyBetterAuthOptions,
					getBetterAuthOptions: helpers.getBetterAuthOptions,
					sortModels,
					tryCatch,
					customIdGenerator: helpers.customIdGenerator,
					transformGeneratedModel,
					transformIdOutput: helpers.transformIdOutput,
				},
				additionalOptions as AdditionalOptions,
			);

			const dash = `─`;
			const allDisabled: boolean = options?.disableTests?.ALL ?? false;

			// Here to display a label in the tests showing the suite name
			test(`\n${TTY_COLORS.fg.white}${" ".repeat(3)}${dash.repeat(35)} [${TTY_COLORS.fg.magenta}${suiteName}${TTY_COLORS.fg.white}] ${dash.repeat(35)}`, async () => {
				try {
					await helpers.cleanup();
				} catch {}
				if (config.defaultBetterAuthOptions && !allDisabled) {
					await applyOptionsAndMigrate(
						config.defaultBetterAuthOptions,
						config.alwaysMigrate,
					);
				}
			});

			/**
			 * Extract test function and migration options from a test entry.
			 */
			const extractTestEntry = (
				entry: TestEntry,
			): {
				testFn: (context: {
					readonly skip: {
						(note?: string | undefined): never;
						(condition: boolean, note?: string | undefined): void;
					};
				}) => Promise<void>;
				migrateBetterAuth?: BetterAuthOptions;
			} => {
				if (typeof entry === "function") {
					return { testFn: entry };
				}
				return {
					testFn: entry.test,
					migrateBetterAuth: entry.migrateBetterAuth,
				};
			};

			// Convert test entries to array with migration info (moved before onFinish for access)
			const testEntries = Object.entries(fullTests).map(([name, entry]) => {
				const { testFn, migrateBetterAuth } = extractTestEntry(
					entry as TestEntry,
				);
				return { name, testFn, migrateBetterAuth };
			});

			/**
			 * Group tests by their migrateBetterAuth options.
			 * Tests with equal migration options are grouped together.
			 */
			type TestGroup = {
				migrationOptions: BetterAuthOptions | null | undefined;
				testIndices: number[];
			};

			const groupTestsByMigrationOptions = (): TestGroup[] => {
				const groups: TestGroup[] = [];
				let currentGroup: TestGroup | null = null;

				for (let i = 0; i < testEntries.length; i++) {
					const { migrateBetterAuth } = testEntries[i]!;
					const isSkipped =
						(allDisabled &&
							options?.disableTests?.[testEntries[i]!.name] !== false) ||
						(options?.disableTests?.[testEntries[i]!.name] ?? false);

					// Skip grouping for skipped tests - they'll be handled individually
					if (isSkipped) {
						if (currentGroup) {
							groups.push(currentGroup);
							currentGroup = null;
						}
						groups.push({
							migrationOptions: migrateBetterAuth,
							testIndices: [i],
						});
						continue;
					}

					// Check if this test belongs to the current group
					if (
						currentGroup &&
						deepEqual(currentGroup.migrationOptions, migrateBetterAuth)
					) {
						currentGroup.testIndices.push(i);
					} else {
						// Start a new group
						if (currentGroup) {
							groups.push(currentGroup);
						}
						currentGroup = {
							migrationOptions: migrateBetterAuth,
							testIndices: [i],
						};
					}
				}

				// Add the last group if it exists
				if (currentGroup) {
					groups.push(currentGroup);
				}

				return groups;
			};

			const testGroups = groupTestsByMigrationOptions();

			// Calculate grouping statistics
			const calculateGroupingStats = () => {
				const nonSkippedGroups = testGroups.filter(
					(group) => group.testIndices.length > 0,
				);
				const groupSizes = nonSkippedGroups.map(
					(group) => group.testIndices.length,
				);

				if (groupSizes.length === 0) {
					return {
						totalGroups: 0,
						averageTestsPerGroup: 0,
						largestGroupSize: 0,
						smallestGroupSize: 0,
						groupsWithMultipleTests: 0,
						totalTestsInGroups: 0,
					};
				}

				const totalTestsInGroups = groupSizes.reduce(
					(sum, size) => sum + size,
					0,
				);
				const groupsWithMultipleTests = groupSizes.filter(
					(size) => size > 1,
				).length;

				return {
					totalGroups: nonSkippedGroups.length,
					averageTestsPerGroup: totalTestsInGroups / nonSkippedGroups.length,
					largestGroupSize: Math.max(...groupSizes),
					smallestGroupSize: Math.min(...groupSizes),
					groupsWithMultipleTests,
					totalTestsInGroups,
				};
			};

			const onFinish = async (testName: string) => {
				await cleanupCreatedRows();

				const currentTestIndex = testEntries.findIndex(
					({ name }) => name === testName,
				);
				const isLastTest = currentTestIndex === testEntries.length - 1;

				if (isLastTest) {
					stats.suiteDuration = performance.now() - stats.suiteStartTime;
					stats.groupingStats = calculateGroupingStats();
					await helpers.onTestFinish(stats);
				}
			};

			// Track the current group's migration options
			let currentGroupMigrationOptions: BetterAuthOptions | null | undefined =
				null;

			for (let i = 0; i < testEntries.length; i++) {
				const { name: testName, testFn, migrateBetterAuth } = testEntries[i]!;

				// Find which group this test belongs to
				const testGroup = testGroups.find((group) =>
					group.testIndices.includes(i),
				);
				const isFirstInGroup = testGroup && testGroup.testIndices[0] === i;

				let shouldSkip =
					(allDisabled && options?.disableTests?.[testName] !== false) ||
					(options?.disableTests?.[testName] ?? false);

				let displayName = testName.replace(
					" - ",
					` ${TTY_COLORS.dim}${dash}${TTY_COLORS.undim} `,
				);
				if (config.prefixTests) {
					displayName = `${config.prefixTests} ${TTY_COLORS.dim}>${TTY_COLORS.undim} ${displayName}`;
				}
				if (helpers.prefixTests) {
					displayName = `[${TTY_COLORS.dim}${helpers.prefixTests}${TTY_COLORS.undim}] ${displayName}`;
				}

				test.skipIf(shouldSkip)(
					displayName,
					{ timeout: 30000 },
					async ({ onTestFailed, skip }) => {
						resetDebugLogs();

						// Apply migration options before test runs
						await (async () => {
							if (shouldSkip) return;

							const thisMigration = deepmerge(
								config.defaultBetterAuthOptions || {},
								migrateBetterAuth || {},
							);

							// If this is the first test in a group, migrate to the group's options
							if (isFirstInGroup && testGroup) {
								const groupMigrationOptions = testGroup.migrationOptions;
								const groupFinalOptions = deepmerge(
									config.defaultBetterAuthOptions || {},
									groupMigrationOptions || {},
								);

								// Only migrate if the group's options are different from current state
								if (
									!deepEqual(
										currentGroupMigrationOptions,
										groupMigrationOptions,
									)
								) {
									await applyOptionsAndMigrate(groupFinalOptions, true);
									currentGroupMigrationOptions = groupMigrationOptions;
								}
							}
							// If this test is not in a group or not first in group, check if migration is needed
							else if (
								!deepEqual(currentGroupMigrationOptions, migrateBetterAuth)
							) {
								await applyOptionsAndMigrate(thisMigration, true);
								currentGroupMigrationOptions = migrateBetterAuth;
							}
						})();

						stats.testCount++;

						onTestFailed(async () => {
							printDebugLogs();
							await onFinish(testName);
						});
						await testFn({ skip });
						await onFinish(testName);
					},
				);
			}
		};
	};
};
