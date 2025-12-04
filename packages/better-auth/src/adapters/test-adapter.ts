import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { deepmerge, initGetModelName } from "@better-auth/core/db/adapter";
import { TTY_COLORS } from "@better-auth/core/env";
import { afterAll, beforeAll, describe } from "vitest";
import { getAuthTables } from "../db";
import type { createTestSuite, TestSuiteStats } from "./create-test-suite";

export type Logger = {
	info: (...args: any[]) => void;
	success: (...args: any[]) => void;
	warn: (...args: any[]) => void;
	error: (...args: any[]) => void;
	debug: (...args: any[]) => void;
};

export const testAdapter = async ({
	adapter: getAdapter,
	runMigrations,
	overrideBetterAuthOptions,
	additionalCleanups,
	tests,
	prefixTests,
	onFinish,
	customIdGenerator,
	transformIdOutput,
}: {
	/**
	 * A function that will return the adapter instance to test with.
	 *
	 * @example
	 * ```ts
	 * testAdapter({
	 *   adapter: (options) => drizzleAdapter(drizzle(db), {
	 *     schema: generateSchema(options),
	 *   }),
	 * })
	 */
	adapter: (
		options: BetterAuthOptions,
	) =>
		| Promise<(options: BetterAuthOptions) => DBAdapter<BetterAuthOptions>>
		| ((options: BetterAuthOptions) => DBAdapter<BetterAuthOptions>);
	/**
	 * A function that will run the database migrations.
	 */
	runMigrations: (betterAuthOptions: BetterAuthOptions) => Promise<void> | void;
	/**
	 * Any potential better-auth options overrides.
	 */
	overrideBetterAuthOptions?: (
		betterAuthOptions: BetterAuthOptions,
	) => BetterAuthOptions;
	/**
	 * By default we will cleanup all tables automatically,
	 * but if you have additional cleanup logic, you can pass it here.
	 *
	 * Such as deleting a DB file that could had been created.
	 */
	additionalCleanups?: () => Promise<void> | void;
	/**
	 * A test suite to run.
	 */
	tests: ReturnType<ReturnType<typeof createTestSuite>>[];
	/**
	 * A prefix to add to the test suite name.
	 */
	prefixTests?: string;
	/**
	 * Upon finish of the tests, this function will be called.
	 */
	onFinish?: () => Promise<void> | void;
	/**
	 * Custom ID generator function to be used by the helper functions. (such as `insertRandom`)
	 */
	customIdGenerator?: () => any;
	/**
	 * A function that will transform the ID output.
	 */
	transformIdOutput?: (id: any) => any;
}) => {
	const defaultBAOptions = {} satisfies BetterAuthOptions;
	let betterAuthOptions = (() => {
		return {
			...defaultBAOptions,
			...(overrideBetterAuthOptions?.(defaultBAOptions) || {}),
		} satisfies BetterAuthOptions;
	})();

	let adapter: DBAdapter<BetterAuthOptions> = (
		await getAdapter(betterAuthOptions)
	)(betterAuthOptions);

	const adapterName = adapter.options?.adapterConfig.adapterName;
	const adapterId = adapter.options?.adapterConfig.adapterId || adapter.id;
	const adapterDisplayName = adapterName || adapterId;

	const refreshAdapter = async (betterAuthOptions: BetterAuthOptions) => {
		adapter = (await getAdapter(betterAuthOptions))(betterAuthOptions);
	};

	/**
	 * A helper function to log to the console.
	 */
	const log: Logger = (() => {
		return {
			info: (...args: any[]) =>
				console.log(
					`${TTY_COLORS.fg.blue}INFO   ${TTY_COLORS.reset} [${adapterDisplayName}]`,
					...args,
				),
			success: (...args: any[]) =>
				console.log(
					`${TTY_COLORS.fg.green}SUCCESS${TTY_COLORS.reset} [${adapterDisplayName}]`,
					...args,
				),
			warn: (...args: any[]) =>
				console.log(
					`${TTY_COLORS.fg.yellow}WARN   ${TTY_COLORS.reset} [${adapterDisplayName}]`,
					...args,
				),
			error: (...args: any[]) =>
				console.log(
					`${TTY_COLORS.fg.red}ERROR  ${TTY_COLORS.reset} [${adapterDisplayName}]`,
					...args,
				),
			debug: (...args: any[]) =>
				console.log(
					`${TTY_COLORS.fg.magenta}DEBUG  ${TTY_COLORS.reset} [${adapterDisplayName}]`,
					...args,
				),
		};
	})();

	/**
	 * Cleanup function to remove all rows from the database.
	 */
	const cleanup = async () => {
		const start = performance.now();
		await refreshAdapter(betterAuthOptions);
		const getAllModels = getAuthTables(betterAuthOptions);

		// Clean up all rows from all models
		for (const model of Object.keys(getAllModels)) {
			const getModelName = initGetModelName({
				usePlural: adapter.options?.adapterConfig?.usePlural,
				schema: getAllModels,
			});
			try {
				const modelName = getModelName(model);
				await adapter.deleteMany({ model: modelName, where: [] });
			} catch (error) {
				const msg = `Error while cleaning up all rows from ${model}`;
				log.error(msg, error);
				throw new Error(msg, {
					cause: error,
				});
			}
		}

		// Run additional cleanups
		try {
			await additionalCleanups?.();
		} catch (error) {
			const msg = `Error while running additional cleanups`;
			log.error(msg, error);
			throw new Error(msg, {
				cause: error,
			});
		}
		await refreshAdapter(betterAuthOptions);
		log.success(
			`${TTY_COLORS.bright}CLEAN-UP${TTY_COLORS.reset} completed successfully (${(performance.now() - start).toFixed(3)}ms)`,
		);
	};

	/**
	 * A function that will run the database migrations.
	 */
	const migrate = async () => {
		const start = performance.now();

		try {
			await runMigrations(betterAuthOptions);
		} catch (error) {
			const msg = `Error while running migrations`;
			log.error(msg, error);
			throw new Error(msg, {
				cause: error,
			});
		}
		log.success(
			`${TTY_COLORS.bright}MIGRATIONS${TTY_COLORS.reset} completed successfully (${(performance.now() - start).toFixed(3)}ms)`,
		);
	};

	return {
		execute: () => {
			describe(adapterDisplayName, async () => {
				// Collect statistics from all test suites
				const allSuiteStats: TestSuiteStats[] = [];

				beforeAll(async () => {
					await migrate();
				}, 60000);

				afterAll(async () => {
					await cleanup();

					// Display statistics summary
					if (allSuiteStats.length > 0) {
						const totalMigrations = allSuiteStats.reduce(
							(sum, stats) => sum + stats.migrationCount,
							0,
						);
						const totalMigrationTime = allSuiteStats.reduce(
							(sum, stats) => sum + stats.totalMigrationTime,
							0,
						);
						const totalTests = allSuiteStats.reduce(
							(sum, stats) => sum + stats.testCount,
							0,
						);
						const totalDuration = allSuiteStats.reduce(
							(sum, stats) => sum + stats.suiteDuration,
							0,
						);

						const dash = "─";
						const separator = `${dash.repeat(80)}`;

						console.log(`\n${TTY_COLORS.fg.cyan}${separator}`);
						console.log(
							`${TTY_COLORS.fg.cyan}${TTY_COLORS.bright}TEST SUITE STATISTICS SUMMARY${TTY_COLORS.reset}`,
						);
						console.log(
							`${TTY_COLORS.fg.cyan}${separator}${TTY_COLORS.reset}\n`,
						);

						// Per-suite breakdown
						for (const stats of allSuiteStats) {
							const avgMigrationTime =
								stats.migrationCount > 0
									? (stats.totalMigrationTime / stats.migrationCount).toFixed(2)
									: "0.00";
							console.log(
								`${TTY_COLORS.fg.magenta}${stats.suiteName}${TTY_COLORS.reset}:`,
							);
							console.log(
								`  Tests: ${TTY_COLORS.fg.green}${stats.testCount}${TTY_COLORS.reset}`,
							);
							console.log(
								`  Migrations: ${TTY_COLORS.fg.yellow}${stats.migrationCount}${TTY_COLORS.reset} (avg: ${avgMigrationTime}ms)`,
							);
							console.log(
								`  Total Migration Time: ${TTY_COLORS.fg.yellow}${stats.totalMigrationTime.toFixed(2)}ms${TTY_COLORS.reset}`,
							);
							console.log(
								`  Suite Duration: ${TTY_COLORS.fg.blue}${stats.suiteDuration.toFixed(2)}ms${TTY_COLORS.reset}`,
							);

							// Display grouping statistics if available
							if (stats.groupingStats) {
								const {
									totalGroups,
									averageTestsPerGroup,
									largestGroupSize,
									smallestGroupSize,
									groupsWithMultipleTests,
								} = stats.groupingStats;
								console.log(
									`  Test Groups: ${TTY_COLORS.fg.cyan}${totalGroups}${TTY_COLORS.reset}`,
								);
								if (totalGroups > 0) {
									console.log(
										`    Avg Tests/Group: ${TTY_COLORS.fg.cyan}${averageTestsPerGroup.toFixed(2)}${TTY_COLORS.reset}`,
									);
									console.log(
										`    Largest Group: ${TTY_COLORS.fg.cyan}${largestGroupSize}${TTY_COLORS.reset}`,
									);
									console.log(
										`    Smallest Group: ${TTY_COLORS.fg.cyan}${smallestGroupSize}${TTY_COLORS.reset}`,
									);
									console.log(
										`    Groups w/ Multiple Tests: ${TTY_COLORS.fg.cyan}${groupsWithMultipleTests}${TTY_COLORS.reset}`,
									);
								}
							}

							console.log("");
						}

						// Totals
						const avgMigrationTime =
							totalMigrations > 0
								? (totalMigrationTime / totalMigrations).toFixed(2)
								: "0.00";

						// Calculate total grouping statistics
						const totalGroups = allSuiteStats.reduce(
							(sum, stats) => sum + (stats.groupingStats?.totalGroups || 0),
							0,
						);
						const totalGroupsWithMultipleTests = allSuiteStats.reduce(
							(sum, stats) =>
								sum + (stats.groupingStats?.groupsWithMultipleTests || 0),
							0,
						);
						const totalTestsInGroups = allSuiteStats.reduce(
							(sum, stats) =>
								sum + (stats.groupingStats?.totalTestsInGroups || 0),
							0,
						);
						const avgTestsPerGroup =
							totalGroups > 0 ? totalTestsInGroups / totalGroups : 0;

						console.log(`${TTY_COLORS.fg.cyan}${separator}`);
						console.log(
							`${TTY_COLORS.fg.cyan}${TTY_COLORS.bright}TOTALS${TTY_COLORS.reset}`,
						);
						console.log(
							`  Total Tests: ${TTY_COLORS.fg.green}${totalTests}${TTY_COLORS.reset}`,
						);
						console.log(
							`  Total Migrations: ${TTY_COLORS.fg.yellow}${totalMigrations}${TTY_COLORS.reset} (avg: ${avgMigrationTime}ms)`,
						);
						console.log(
							`  Total Migration Time: ${TTY_COLORS.fg.yellow}${totalMigrationTime.toFixed(2)}ms${TTY_COLORS.reset}`,
						);
						console.log(
							`  Total Duration: ${TTY_COLORS.fg.blue}${totalDuration.toFixed(2)}ms${TTY_COLORS.reset}`,
						);

						// Display total grouping statistics
						if (totalGroups > 0) {
							console.log(
								`  Total Test Groups: ${TTY_COLORS.fg.cyan}${totalGroups}${TTY_COLORS.reset}`,
							);
							console.log(
								`    Avg Tests/Group: ${TTY_COLORS.fg.cyan}${avgTestsPerGroup.toFixed(2)}${TTY_COLORS.reset}`,
							);
							console.log(
								`    Groups w/ Multiple Tests: ${TTY_COLORS.fg.cyan}${totalGroupsWithMultipleTests}${TTY_COLORS.reset}`,
							);
						}

						console.log(
							`${TTY_COLORS.fg.cyan}${separator}${TTY_COLORS.reset}\n`,
						);
					}

					await onFinish?.();
				}, 60000);

				for (const testSuite of tests) {
					await testSuite({
						adapter: async () => {
							await refreshAdapter(betterAuthOptions);
							return adapter;
						},
						adapterDisplayName,
						log,
						getBetterAuthOptions: () => betterAuthOptions,
						modifyBetterAuthOptions: async (options) => {
							const newOptions = deepmerge(defaultBAOptions, options);
							betterAuthOptions = deepmerge(
								newOptions,
								overrideBetterAuthOptions?.(newOptions) || {},
							);
							await refreshAdapter(betterAuthOptions);
							return betterAuthOptions;
						},
						cleanup,
						prefixTests,
						runMigrations: migrate,
						onTestFinish: async (stats: TestSuiteStats) => {
							allSuiteStats.push(stats);
						},
						customIdGenerator,
						transformIdOutput,
					});
				}
			});
		},
	};
};
