import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { TTY_COLORS } from "@better-auth/core/env";
import { afterAll, beforeAll, describe } from "vitest";
import { getAuthTables } from "../db";
import type { createTestSuite } from "./create-test-suite";
import { deepmerge } from "./utils";

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
	overrideBetterAuthOptions?: <
		Passed extends BetterAuthOptions,
		Returned extends BetterAuthOptions,
	>(
		betterAuthOptions: Passed,
	) => Returned;
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
	customIdGenerator?: () => string | Promise<string>;
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
			try {
				await adapter.deleteMany({ model: model, where: [] });
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
				beforeAll(async () => {
					await migrate();
				}, 20000);

				afterAll(async () => {
					await cleanup();
					await onFinish?.();
				}, 20000);

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
						onTestFinish: async () => {},
						customIdGenerator,
					});
				}
			});
		},
	};
};
