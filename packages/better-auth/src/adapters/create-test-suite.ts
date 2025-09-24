import type { Adapter } from "../types";
import type { User, Session, Verification, Account } from "../types";
import type { BetterAuthOptions } from "../types";
import { createAdapterFactory } from "./adapter-factory";
import { test } from "vitest";
import { generateId } from "../utils";
import type { Logger } from "./test-adapter";
import { colors } from "../utils/colors";
import { betterAuth } from "../auth";

type GenerateFn = <M extends "user" | "session" | "verification" | "account">(
	Model: M,
) => M extends "user"
	? User
	: M extends "session"
		? Session
		: M extends "verification"
			? Verification
			: M extends "account"
				? Account
				: undefined;

const generateModel: GenerateFn = (model: string) => {
	const id = generateId();
	const randomDate = new Date(
		Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 365,
	);
	if (model === "user") {
		const user: User = {
			id,
			createdAt: randomDate,
			updatedAt: new Date(),
			email: `user-${id}@email.com`.toLowerCase(),
			emailVerified: true,
			name: `user-${id}`,
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
	count?: Count,
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
	Tests extends Record<
		string,
		(context: {
			/**
			 * Mark tests as skipped. All execution after this call will be skipped.
			 * This function throws an error, so make sure you are not catching it accidentally.
			 * @see {@link https://vitest.dev/guide/test-context#skip}
			 */
			readonly skip: {
				(note?: string): never;
				(condition: boolean, note?: string): void;
			};
		}) => Promise<void>
	>,
	AdditionalOptions extends Record<string, any> = {},
>(
	suiteName: string,
	tests: (
		helpers: {
			adapter: Adapter;
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
				by?: "id" | "createdAt",
			) => (Record<string, any> & {
				id: string;
			})[];
			auth: ReturnType<typeof betterAuth>;
			tryCatch<T, E = Error>(promise: Promise<T>): Promise<Result<T, E>>;
		},
		additionalOptions?: AdditionalOptions,
	) => Tests,
) => {
	return (
		options?: {
			disableTests?: Partial<Record<keyof Tests, boolean> & { ALL?: boolean }>;
		} & AdditionalOptions,
	) => {
		return async (helpers: {
			adapter: () => Adapter;
			log: Logger;
			adapterDisplayName: string;
			getBetterAuthOptions: () => BetterAuthOptions;
			modifyBetterAuthOptions: (
				options: BetterAuthOptions,
			) => BetterAuthOptions;
			cleanup: () => Promise<void>;
			runMigrations: () => Promise<void>;
			prefixTests?: string;
		}) => {
			const createdRows: Record<string, any[]> = {};

			const adapter = helpers.adapter;
			const wrapperAdapter = () => {
				let transactionAdapter = adapter();
				const options = helpers.getBetterAuthOptions();
				let adapter_ = adapter();
				const adapterConfig = {
					adapterId: helpers.adapterDisplayName,
					...adapter_.options?.adapterConfig,
					adapterName: `Wrapped ${adapter_.options?.adapterConfig.adapterName}`,
					disableTransformOutput: true,
					disableTransformInput: true,
				};
				const adapterCreator = (options: BetterAuthOptions): Adapter =>
					createAdapterFactory({
						config: {
							...adapterConfig,
							transaction: adapter_.transaction,
						},
						adapter: ({ getDefaultModelName }) => {
							let adapter_ = adapter();

							//@ts-expect-error
							adapter_.transaction = undefined;
							return {
								count: adapter_.count,
								deleteMany: adapter_.deleteMany,
								delete: adapter_.delete,
								findOne: adapter_.findOne,
								findMany: adapter_.findMany,
								update: adapter_.update as any,
								updateMany: adapter_.updateMany,
								// options: {
								// 	...adapter_.options,
								// 	adapterConfig: {
								// 		...adapter_.options?.adapterConfig,
								// 		adapterName: `wrapped-${adapter_.options?.adapterConfig.adapterName}`,
								// 	},
								// },
								createSchema: adapter_.createSchema as any,
								async create({ data, model, select }) {
									const defaultModelName = getDefaultModelName(model);
									const res = await adapter().create({
										data: data,
										model: defaultModelName,
										select,
										forceAllowId: true,
									});
									createdRows[model] = [...(createdRows[model] || []), res];
									return res as any;
								},
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
				for (const model of Object.keys(createdRows)) {
					for (const row of createdRows[model]) {
						try {
							await adapter().delete({
								model,
								where: [{ field: "id", value: row.id }],
							});
						} catch (error) {
							// We ignore any failed attempts to delete the created rows.
						}
						if (createdRows[model].length === 1) {
							delete createdRows[model];
						}
					}
				}
			};

			let didMigrateOnOptionsModify = false;

			const resetBetterAuthOptions = async () => {
				helpers.modifyBetterAuthOptions({});
				if (didMigrateOnOptionsModify) {
					didMigrateOnOptionsModify = false;
					await helpers.runMigrations();
				}
			};

			const insertRandom: InsertRandomFn = async <
				M extends "user" | "session" | "verification" | "account",
				Count extends number = 1,
			>(
				model: M,
				count: Count = 1 as Count,
			) => {
				let res: any[] = [];
				for (let i = 0; i < count; i++) {
					let models: string[] = [model];
					let modelData: Record<string, any>[] = [];
					if (model === "user") {
						modelData = [generateModel("user")];
					}
					if (model === "session") {
						const user = generateModel("user");
						const session = generateModel("session");
						session.userId = user.id;
						models = ["user", "session"];
						modelData = [user, session];
					}
					if (model === "verification") {
						const verification = generateModel("verification");
						modelData = [verification];
					}
					if (model === "account") {
						const user = generateModel("user");
						const account = generateModel("account");
						account.userId = user.id;
						models = ["user", "account"];
						modelData = [user, account];
					}
					const modelResults = [];

					let i = -1;
					for (const data of modelData) {
						i++;
						modelResults.push(
							await wrapperAdapter().create({
								model: models[i],
								data,
								forceAllowId: true,
							}),
						);
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
						return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
					}
					return a.id.localeCompare(b.id);
				});
			};

			const modifyBetterAuthOptions = async (
				opts: BetterAuthOptions,
				shouldRunMigrations: boolean,
			) => {
				const res = helpers.modifyBetterAuthOptions(opts);
				if (shouldRunMigrations) {
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
								return helpers.adapter().transaction;
							}
							const value = adapter[prop as keyof typeof adapter];
							if (typeof value === "function") {
								return value.bind(adapter);
							}
							return value;
						},
					}),
					auth: new Proxy({} as any, {
						get(target, prop) {
							const auth = betterAuth({
								...helpers.getBetterAuthOptions(),
								database: adapter,
							});
							return auth[prop as keyof typeof auth];
						},
					}),
					log: helpers.log,
					generate: generateModel,
					cleanup: cleanupCreatedRows,
					hardCleanup: helpers.cleanup,
					insertRandom,
					modifyBetterAuthOptions,
					getBetterAuthOptions: helpers.getBetterAuthOptions,
					sortModels,
					tryCatch,
				},
				additionalOptions as AdditionalOptions,
			);

			const dash = `─`;
			// Here to display a label in the tests showing the suite name
			test(`\n${colors.fg.white}${" ".repeat(3)}${dash.repeat(35)} [${colors.fg.magenta}${suiteName}${colors.fg.white}] ${dash.repeat(35)}`, async () => {
				try {
					await helpers.cleanup();
				} catch {}
			});

			for (let [testName, testFn] of Object.entries(fullTests)) {
				const allDisabled: boolean = options?.disableTests?.ALL ?? false;
				let shouldSkip =
					(allDisabled && options?.disableTests?.[testName] !== false) ||
					(options?.disableTests?.[testName] ?? false);
				testName = testName.replace(
					" - ",
					` ${colors.dim}${dash}${colors.undim} `,
				);
				if (helpers.prefixTests) {
					testName = `[${colors.dim}${helpers.prefixTests}${colors.undim}] ${testName}`;
				}
				const onFinish = async () => {
					await cleanupCreatedRows();
					await resetBetterAuthOptions();
				};
				test.skipIf(shouldSkip)(testName, async ({ onTestFailed, skip, annotate }) => {
					resetDebugLogs();
					onTestFailed(async () => {
						printDebugLogs();
						await onFinish();
					});
					await testFn({ skip });
					await onFinish();
				});
			}
		};
	};
};
