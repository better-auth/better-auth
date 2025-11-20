import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { TTY_COLORS } from "@better-auth/core/env";
import { test } from "vitest";
import { betterAuth } from "../auth";
import { getAuthTables } from "../db/get-tables";
import type { Account, Session, User, Verification } from "../types";
import { generateId } from "../utils";
import { createAdapterFactory } from "./adapter-factory";
import type { Logger } from "./test-adapter";
import { deepmerge } from "./utils";

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

export const createTestSuite2 = <
	Tests extends Record<
		string,
		(context: {
			/**
			 * Mark tests as skipped. All execution after this call will be skipped.
			 * This function throws an error, so make sure you are not catching it accidentally.
			 * @see {@link https://vitest.dev/guide/test-context#skip}
			 */
			readonly skip: {
				(note?: string | undefined): never;
				(condition: boolean, note?: string | undefined): void;
			};
		}) => Promise<void>
	>,
	AdditionalOptions extends Record<string, any> = {},
>() => {};

export const createTestSuite = <
	Tests extends Record<
		string,
		(context: {
			/**
			 * Mark tests as skipped. All execution after this call will be skipped.
			 * This function throws an error, so make sure you are not catching it accidentally.
			 * @see {@link https://vitest.dev/guide/test-context#skip}
			 */
			readonly skip: {
				(note?: string | undefined): never;
				(condition: boolean, note?: string | undefined): void;
			};
		}) => Promise<void>
	>,
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
			onTestFinish: () => Promise<void>;
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
								count: adapter.count,
								deleteMany: adapter.deleteMany,
								delete: adapter.delete,
								findOne: async (args) => {
									const res = (await adapter.findOne(args)) as any;
									return res;
								},
								findMany: async (args) => {
									const res = (await adapter.findMany(args)) as any;
									return res;
								},
								update: adapter.update as any,
								updateMany: adapter.updateMany,

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
						if (!schema[model]) continue; // model doesn't exist in the schema anymore, so we skip it
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

			let didMigrateOnOptionsModify = false;

			const resetBetterAuthOptions = async () => {
				adapter = await helpers.adapter();
				await helpers.modifyBetterAuthOptions(
					config.defaultBetterAuthOptions || {},
				);
				if (didMigrateOnOptionsModify) {
					didMigrateOnOptionsModify = false;
					await helpers.runMigrations();
					adapter = await helpers.adapter();
				}
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
				const res = helpers.modifyBetterAuthOptions(
					deepmerge(config?.defaultBetterAuthOptions || {}, opts),
				);
				if (config.alwaysMigrate || shouldRunMigrations) {
					didMigrateOnOptionsModify = true;
					await helpers.runMigrations();
				}
				return res;
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
					await helpers.modifyBetterAuthOptions(
						config.defaultBetterAuthOptions,
					);
					if (config.alwaysMigrate) {
						await helpers.runMigrations();
					}
				}
			});

			const onFinish = async (testName: string) => {
				await cleanupCreatedRows();
				await resetBetterAuthOptions();
				// Check if this is the last test by comparing current test index with total tests
				const testEntries = Object.entries(fullTests);
				const currentTestIndex = testEntries.findIndex(
					([name]) =>
						name === testName.replace(/\[.*?\] /, "").replace(/ ─ /g, " - "),
				);
				const isLastTest = currentTestIndex === testEntries.length - 1;

				if (isLastTest) {
					await helpers.onTestFinish();
				}
			};

			if (allDisabled) {
				await resetBetterAuthOptions();
			}

			for (let [testName, testFn] of Object.entries(fullTests)) {
				let shouldSkip =
					(allDisabled && options?.disableTests?.[testName] !== false) ||
					(options?.disableTests?.[testName] ?? false);
				testName = testName.replace(
					" - ",
					` ${TTY_COLORS.dim}${dash}${TTY_COLORS.undim} `,
				);
				if (config.prefixTests) {
					testName = `${config.prefixTests} ${TTY_COLORS.dim}>${TTY_COLORS.undim} ${testName}`;
				}
				if (helpers.prefixTests) {
					testName = `[${TTY_COLORS.dim}${helpers.prefixTests}${TTY_COLORS.undim}] ${testName}`;
				}

				test.skipIf(shouldSkip)(
					testName,
					{ timeout: 30000 },
					async ({ onTestFailed, skip }) => {
						resetDebugLogs();
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
