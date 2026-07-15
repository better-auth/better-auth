import type {
	AuthContext,
	BetterAuthOptions,
	CreateUserWithAccountOptions,
	GenericEndpointContext,
	InternalAdapter,
	LinkAccountOptions,
	PluginProvisioningRecord,
	UserProvisioningSource,
	ValidateUserInfoSource,
} from "@better-auth/core";
import {
	getCurrentAdapter,
	getCurrentAuthContext,
	queueAfterTransactionHook,
	runAtomicMutation,
} from "@better-auth/core/context";
import type {
	AccountKey,
	AccountWithIdentity,
	Identity,
	IdentityKey,
} from "@better-auth/core/db";
import { createLocalIdentityIssuer, getAuthTables } from "@better-auth/core/db";
import type {
	AtomicWriteOperation,
	AtomicWriteResult,
	DBAdapter,
	Where,
} from "@better-auth/core/db/adapter";
import type { InternalLogger } from "@better-auth/core/env";
import { APIError, BetterAuthError } from "@better-auth/core/error";
import type { Account, Session, User } from "../../types";
import {
	assertValidUserInfo,
	assertValidUserInfoSource,
} from "../../utils/validate-user-info";
import type { DatabaseHooksEntry } from "../with-hooks";
import { getWithHooks } from "../with-hooks";
import { createAccountOwnedRecordCleanup } from "./account-owned-records";

type ConfiguredAccount<Options extends BetterAuthOptions> = Account<
	Options["account"],
	Options["plugins"]
>;

type ConfiguredIdentity<Options extends BetterAuthOptions> = Identity<
	Options["identity"],
	Options["plugins"]
>;

type UserGraphAdapterMethod =
	| "createUserWithAccount"
	| "createUser"
	| "listUsers"
	| "countTotalUsers"
	| "deleteUser"
	| "deleteUserAccounts"
	| "deleteAccountsByProviderInstanceId"
	| "deleteAccount"
	| "findUserByIdentityKey"
	| "findIdentityOwnerByKey"
	| "findUserByEmail"
	| "findUserById"
	| "linkAccount"
	| "updateUser"
	| "updateUserByEmail"
	| "updatePassword"
	| "listUserAccounts"
	| "findCredentialAccount"
	| "findIdentityByKey"
	| "findAccountByKey"
	| "findAccountWithIdentityById"
	| "updateAccount";

type UserGraphAdapterMethods<Options extends BetterAuthOptions> = Pick<
	InternalAdapter<Options>,
	UserGraphAdapterMethod
>;

interface UserGraphAdapterContext<Options extends BetterAuthOptions> {
	options: Omit<Options, "logger">;
	logger: InternalLogger;
	hooks: DatabaseHooksEntry[];
	generateId: AuthContext<Options>["generateId"];
}

type AtomicDeleteAfterHook = Readonly<{
	operationIndex: number;
	queueAfterHook: () => Promise<void>;
}>;

export interface UserGraphSessionServices {
	deleteCachedUserSessions(userId: string): Promise<void>;
	refreshUserSessions(user: User): Promise<void>;
}

export function createUserGraphAdapterMethods<
	Options extends BetterAuthOptions,
>(
	adapter: DBAdapter<Options>,
	ctx: UserGraphAdapterContext<Options>,
	sessionServices: UserGraphSessionServices,
): UserGraphAdapterMethods<Options> {
	const logger = ctx.logger;
	const options = ctx.options;
	const secondaryStorage = options.secondaryStorage;
	const {
		prepareCreateWithHooks,
		prepareDeleteWithHooks,
		createWithHooks,
		updateWithHooks,
		deleteWithHooks,
		deleteManyWithHooks,
	} = getWithHooks(adapter, ctx);
	const { deleteCachedUserSessions, refreshUserSessions } = sessionServices;
	const accountOwnedRecordCleanup = createAccountOwnedRecordCleanup(
		adapter,
		getAuthTables(options),
	);

	const ATOMIC_WRITES_REQUIRE_APPLICATION_IDS =
		"ATOMIC_WRITES_REQUIRE_APPLICATION_IDS" as const;

	function reserveAtomicWriteId(
		model: Parameters<typeof ctx.generateId>[0]["model"],
	): string {
		const id = ctx.generateId({ model });
		if (id !== false) return id;
		throw Object.assign(
			new BetterAuthError(
				`Atomic writes for model "${model}" require application-generated IDs. Configure a string, UUID, or custom ID generator, or use an adapter with native transactions.`,
			),
			{ code: ATOMIC_WRITES_REQUIRE_APPLICATION_IDS, model },
		);
	}

	function getPreparedId(
		row: Record<string, unknown>,
		model: "user" | "identity" | "account",
	): string {
		if (typeof row.id === "string" && row.id.length > 0) return row.id;
		throw new BetterAuthError(
			`The ${model} create hook must preserve the application-generated id during an atomic lifecycle mutation.`,
		);
	}

	function getCreatedAtomicRecord<T>(
		results: readonly AtomicWriteResult[],
		index: number,
		model: string,
	): T {
		const result = results[index];
		if (result?.type !== "create") {
			throw new BetterAuthError(
				`Atomic ${model} creation did not return its committed record.`,
			);
		}
		return result.record as T;
	}

	function assertPluginProvisioningRecords(
		records: readonly PluginProvisioningRecord<Options>[],
	): void {
		for (const record of records) {
			switch (record.model) {
				case "user":
				case "identity":
				case "account":
				case "session":
				case "verification":
				case "rate-limit":
					throw new BetterAuthError(
						`Related provisioning records cannot target the core model "${record.model}".`,
					);
			}
		}
	}

	async function findAllRecords<T>(query: {
		model: string;
		where: Where[];
	}): Promise<T[]> {
		const currentAdapter = await getCurrentAdapter(adapter);
		const rawRecordCount = await currentAdapter.count({
			model: query.model,
			where: query.where,
		});
		const recordCount =
			typeof rawRecordCount === "string"
				? Number.parseInt(rawRecordCount, 10)
				: rawRecordCount;
		if (!Number.isFinite(recordCount) || recordCount <= 0) return [];
		return currentAdapter.findMany<T>({
			...query,
			limit: recordCount,
		});
	}

	function appendAtomicDelete(
		operations: AtomicWriteOperation[],
		afterHooks: AtomicDeleteAfterHook[],
		operation: AtomicWriteOperation,
		queueAfterHook?: (() => Promise<void>) | undefined,
	): void {
		const operationIndex = operations.length;
		operations.push(operation);
		if (queueAfterHook) {
			afterHooks.push({ operationIndex, queueAfterHook });
		}
	}

	function appendAtomicDeletionPlan(
		operations: AtomicWriteOperation[],
		afterHooks: AtomicDeleteAfterHook[],
		plan: {
			operations: AtomicWriteOperation[];
			afterHooks: AtomicDeleteAfterHook[];
		},
	): void {
		const operationOffset = operations.length;
		operations.push(...plan.operations);
		afterHooks.push(
			...plan.afterHooks.map((afterHook) => ({
				...afterHook,
				operationIndex: afterHook.operationIndex + operationOffset,
			})),
		);
	}

	async function runCommittedDeleteAfterHooks(
		results: readonly AtomicWriteResult[],
		afterHooks: readonly AtomicDeleteAfterHook[],
	): Promise<void> {
		for (const { operationIndex, queueAfterHook } of afterHooks) {
			const result = results[operationIndex];
			if (result?.type !== "delete") {
				throw new BetterAuthError(
					`Atomic delete lifecycle operation ${operationIndex} did not return a delete result.`,
				);
			}
			if (result.deletedCount === 1) await queueAfterHook();
		}
	}

	async function assertValidUserCreation(
		user: Partial<User> & Record<string, unknown>,
		source: UserProvisioningSource,
	): Promise<void> {
		if (!options.user?.validateUserInfo) return;

		const validationSource: ValidateUserInfoSource = {
			...source,
			action: "create-user",
		};
		assertValidUserInfoSource(validationSource);
		let endpointContext: GenericEndpointContext;
		try {
			endpointContext =
				(await getCurrentAuthContext()) as GenericEndpointContext;
		} catch (error) {
			logger.error(
				"Unable to run validateUserInfo: missing endpoint context",
				error,
			);
			throw new APIError("FORBIDDEN", {
				code: "validation_context_missing",
				message: "User validation requires an endpoint context",
			});
		}
		await assertValidUserInfo(endpointContext, {
			user,
			source: validationSource,
		});
	}

	async function findIdentityByKey({
		issuer,
		providerAccountId,
	}: IdentityKey): Promise<ConfiguredIdentity<Options> | null> {
		return (await getCurrentAdapter(adapter)).findOne<
			ConfiguredIdentity<Options>
		>({
			model: "identity",
			where: [
				{ field: "issuer", value: issuer },
				{ field: "providerAccountId", value: providerAccountId },
			],
		});
	}

	async function findAccountByKey({
		identityId,
		providerInstanceId,
	}: AccountKey): Promise<ConfiguredAccount<Options> | null> {
		return (await getCurrentAdapter(adapter)).findOne<
			ConfiguredAccount<Options>
		>({
			model: "account",
			where: [
				{ field: "identityId", value: identityId },
				{ field: "providerInstanceId", value: providerInstanceId },
			],
		});
	}

	function createIdentityAlreadyLinkedError(): APIError {
		return new APIError("CONFLICT", {
			code: "identity_already_linked",
			message: "Identity is already linked to another user",
		});
	}

	function createAccountDeletionRejectedError(): APIError {
		return new APIError("BAD_REQUEST", {
			code: "account_deletion_rejected",
			message: "Account deletion was rejected",
		});
	}

	function createIdentityDeletionRejectedError(): APIError {
		return new APIError("BAD_REQUEST", {
			code: "identity_deletion_rejected",
			message: "Identity deletion was rejected",
		});
	}

	async function persistAccountLink(
		userId: string,
		identityKey: IdentityKey,
		accountToCreate: Omit<
			ConfiguredAccount<Options>,
			"id" | "identityId" | "createdAt" | "updatedAt"
		>,
		options: LinkAccountOptions<Options> | undefined,
		onMutationComplete: () => void,
	): Promise<AccountWithIdentity<Options>> {
		return runAtomicMutation(adapter, {
			runInTransaction: async () => {
				let identity = await findIdentityByKey(identityKey);
				if (identity && identity.userId !== userId) {
					throw createIdentityAlreadyLinkedError();
				}
				if (!identity) {
					identity = (await createWithHooks(
						{
							...identityKey,
							userId,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
						"identity",
						undefined,
					)) as ConfiguredIdentity<Options> | null;
					if (!identity) {
						throw new APIError("BAD_REQUEST", {
							message: "Failed to create identity",
						});
					}
				}

				let account = await findAccountByKey({
					identityId: identity.id,
					providerInstanceId: accountToCreate.providerInstanceId,
				});
				if (!account) {
					account = (await createWithHooks(
						{
							...accountToCreate,
							identityId: identity.id,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
						"account",
						undefined,
					)) as ConfiguredAccount<Options> | null;
					if (!account) {
						throw new APIError("BAD_REQUEST", {
							message: "Failed to create account",
						});
					}
				}

				const relatedRecords =
					options?.buildRelatedRecords?.({
						userId,
						identityId: identity.id,
						accountId: account.id,
					}) ?? [];
				assertPluginProvisioningRecords(relatedRecords);
				const currentAdapter = await getCurrentAdapter(adapter);
				for (const relatedRecord of relatedRecords) {
					await currentAdapter.create<Record<string, unknown>>({
						model: relatedRecord.model,
						data: relatedRecord.data,
					});
				}

				onMutationComplete();
				return { identity, account };
			},
			prepareAtomicWrites: async () => {
				const operations: AtomicWriteOperation[] = [];
				let identity = await findIdentityByKey(identityKey);
				if (identity && identity.userId !== userId) {
					throw createIdentityAlreadyLinkedError();
				}

				let identityResultIndex: number | null = null;
				let queueIdentityAfterHooks:
					| ((created: ConfiguredIdentity<Options>) => Promise<void>)
					| null = null;
				if (!identity) {
					const preparedIdentity = await prepareCreateWithHooks(
						{
							id: reserveAtomicWriteId("identity"),
							...identityKey,
							userId,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
						"identity",
					);
					if (!preparedIdentity) {
						throw new APIError("BAD_REQUEST", {
							message: "Failed to create identity",
						});
					}
					const identityData =
						preparedIdentity.data as unknown as ConfiguredIdentity<Options>;
					getPreparedId(identityData, "identity");
					identity = identityData;
					identityResultIndex = operations.length;
					queueIdentityAfterHooks = (created) =>
						preparedIdentity.queueAfterHooks(created);
					operations.push({
						type: "create",
						model: "identity",
						data: identityData,
						forceAllowId: true,
					});
				}

				let account = await findAccountByKey({
					identityId: identity.id,
					providerInstanceId: accountToCreate.providerInstanceId,
				});
				let accountResultIndex: number | null = null;
				let queueAccountAfterHooks:
					| ((created: ConfiguredAccount<Options>) => Promise<void>)
					| null = null;
				if (!account) {
					const preparedAccount = await prepareCreateWithHooks<
						ConfiguredAccount<Options>
					>(
						{
							id: reserveAtomicWriteId("account"),
							...accountToCreate,
							identityId: identity.id,
							createdAt: new Date(),
							updatedAt: new Date(),
						} as ConfiguredAccount<Options>,
						"account",
					);
					if (!preparedAccount) {
						throw new APIError("BAD_REQUEST", {
							message: "Failed to create account",
						});
					}
					const accountData =
						preparedAccount.data as unknown as ConfiguredAccount<Options>;
					getPreparedId(accountData, "account");
					account = accountData;
					accountResultIndex = operations.length;
					queueAccountAfterHooks = (created) =>
						preparedAccount.queueAfterHooks(created);
					operations.push({
						type: "create",
						model: "account",
						data: accountData,
						forceAllowId: true,
					});
				}

				const relatedRecords =
					options?.buildRelatedRecords?.({
						userId,
						identityId: identity.id,
						accountId: account.id,
					}) ?? [];
				assertPluginProvisioningRecords(relatedRecords);
				const preparedRelatedRecords = relatedRecords.map((record) => ({
					...record,
					data: {
						id: reserveAtomicWriteId(record.model),
						...record.data,
					},
				}));
				const relatedRecordResultIndex = operations.length;
				operations.push(
					...preparedRelatedRecords.map((record) => ({
						type: "create" as const,
						model: record.model,
						data: record.data,
						forceAllowId: true,
					})),
				);

				return {
					operations,
					afterCommit: async (results: readonly AtomicWriteResult[]) => {
						const committedIdentity =
							identityResultIndex === null
								? identity
								: getCreatedAtomicRecord<ConfiguredIdentity<Options>>(
										results,
										identityResultIndex,
										"identity",
									);
						const committedAccount =
							accountResultIndex === null
								? account
								: getCreatedAtomicRecord<ConfiguredAccount<Options>>(
										results,
										accountResultIndex,
										"account",
									);
						onMutationComplete();
						if (queueIdentityAfterHooks) {
							await queueIdentityAfterHooks(committedIdentity);
						}
						if (queueAccountAfterHooks) {
							await queueAccountAfterHooks(committedAccount);
						}
						for (const [
							index,
							relatedRecord,
						] of preparedRelatedRecords.entries()) {
							getCreatedAtomicRecord<Record<string, unknown>>(
								results,
								relatedRecordResultIndex + index,
								relatedRecord.model,
							);
						}
						return {
							identity: committedIdentity,
							account: committedAccount,
						};
					},
				};
			},
		});
	}

	function assertAccountUpdateDoesNotRebind(update: object): void {
		if (
			"identityId" in update ||
			"providerId" in update ||
			"providerInstanceId" in update
		) {
			throw new APIError("BAD_REQUEST", {
				code: "immutable_account_field",
				message:
					"Account identityId, providerId, and providerInstanceId cannot be changed",
			});
		}
	}

	async function updateAccountById(
		id: string,
		accountUpdate: Omit<
			Partial<ConfiguredAccount<Options>>,
			"identityId" | "providerId" | "providerInstanceId"
		>,
	): Promise<ConfiguredAccount<Options> | null> {
		assertAccountUpdateDoesNotRebind(accountUpdate);
		return updateWithHooks<ConfiguredAccount<Options>>(
			accountUpdate,
			[{ field: "id", value: id }],
			"account",
			{
				executeMainFn: false,
				async fn(updateAfterHooks) {
					assertAccountUpdateDoesNotRebind(updateAfterHooks);
					return (await getCurrentAdapter(adapter)).update<
						ConfiguredAccount<Options>
					>({
						model: "account",
						where: [{ field: "id", value: id }],
						update: updateAfterHooks,
					});
				},
			},
		);
	}

	async function deleteUserIdentity(identityId: string): Promise<void> {
		await deleteWithHooks(
			[{ field: "id", value: identityId }],
			"identity",
			undefined,
		);
		const remainingIdentity = await (await getCurrentAdapter(adapter)).findOne<
			ConfiguredIdentity<Options>
		>({
			model: "identity",
			where: [{ field: "id", value: identityId }],
		});
		if (remainingIdentity) throw createIdentityDeletionRejectedError();
	}

	async function assertUserAccountsDeleted(userId: string): Promise<void> {
		const identities = await findAllRecords<ConfiguredIdentity<Options>>({
			model: "identity",
			where: [{ field: "userId", value: userId }],
		});
		for (const identity of identities) {
			const remainingAccount = await (await getCurrentAdapter(adapter)).findOne<
				ConfiguredAccount<Options>
			>({
				model: "account",
				where: [{ field: "identityId", value: identity.id }],
			});
			if (remainingAccount) throw createAccountDeletionRejectedError();
		}
	}

	async function deleteUserAccountRows(userId: string): Promise<void> {
		const identities = await findAllRecords<ConfiguredIdentity<Options>>({
			model: "identity",
			where: [{ field: "userId", value: userId }],
		});
		for (const identity of identities) {
			const accounts = await findAllRecords<ConfiguredAccount<Options>>({
				model: "account",
				where: [{ field: "identityId", value: identity.id }],
			});
			for (const account of accounts) {
				await accountOwnedRecordCleanup.deleteInCurrentTransaction(account.id);
			}
			await deleteManyWithHooks(
				[{ field: "identityId", value: identity.id }],
				"account",
				undefined,
			);
		}
		await assertUserAccountsDeleted(userId);
		for (const identity of identities) {
			await deleteUserIdentity(identity.id);
		}
	}

	async function prepareAtomicUserAccountDeletion(userId: string): Promise<{
		operations: AtomicWriteOperation[];
		afterHooks: AtomicDeleteAfterHook[];
	}> {
		const identities = await findAllRecords<ConfiguredIdentity<Options>>({
			model: "identity",
			where: [{ field: "userId", value: userId }],
		});
		const operations: AtomicWriteOperation[] = [];
		const afterHooks: AtomicDeleteAfterHook[] = [];

		for (const identity of identities) {
			const accounts = await findAllRecords<ConfiguredAccount<Options>>({
				model: "account",
				where: [{ field: "identityId", value: identity.id }],
			});
			for (const account of accounts) {
				const where = [{ field: "id", value: account.id }];
				const preparedAccount = await prepareDeleteWithHooks(where, "account", {
					entities: [account],
					requireSnapshot: true,
				});
				if (!preparedAccount) throw createAccountDeletionRejectedError();
				operations.push(
					...accountOwnedRecordCleanup.getAtomicDeleteOperations(account.id),
				);
				appendAtomicDelete(
					operations,
					afterHooks,
					{ type: "delete", model: "account", where },
					() => preparedAccount.queueAfterHooks(),
				);
			}

			const where = [{ field: "id", value: identity.id }];
			const preparedIdentity = await prepareDeleteWithHooks(where, "identity", {
				entities: [identity],
				requireSnapshot: true,
			});
			if (!preparedIdentity) throw createIdentityDeletionRejectedError();
			appendAtomicDelete(
				operations,
				afterHooks,
				{ type: "delete", model: "identity", where },
				() => preparedIdentity.queueAfterHooks(),
			);
		}

		return { operations, afterHooks };
	}

	async function assertUserAccountRowsDeleted(userId: string): Promise<void> {
		const remainingIdentity = await (await getCurrentAdapter(adapter)).findOne<
			ConfiguredIdentity<Options>
		>({
			model: "identity",
			where: [{ field: "userId", value: userId }],
		});
		if (!remainingIdentity) return;
		const remainingAccount = await (await getCurrentAdapter(adapter)).findOne<
			ConfiguredAccount<Options>
		>({
			model: "account",
			where: [{ field: "identityId", value: remainingIdentity.id }],
		});
		if (remainingAccount) throw createAccountDeletionRejectedError();
		throw createIdentityDeletionRejectedError();
	}

	async function listUserAccountLinks(
		userId: string,
	): Promise<AccountWithIdentity<Options>[]> {
		const identities = await findAllRecords<ConfiguredIdentity<Options>>({
			model: "identity",
			where: [{ field: "userId", value: userId }],
		});
		if (identities.length === 0) return [];
		const identityById = new Map<string, ConfiguredIdentity<Options>>(
			identities.map((identity) => [identity.id, identity]),
		);
		const accounts = await findAllRecords<ConfiguredAccount<Options>>({
			model: "account",
			where: [
				{
					field: "identityId",
					operator: "in",
					value: identities.map((identity) => identity.id),
				},
			],
		});
		return accounts.flatMap((account) => {
			const identity = identityById.get(account.identityId);
			return identity ? [{ identity, account }] : [];
		});
	}

	async function findIdentityOwnerByKey({
		issuer,
		providerAccountId,
	}: IdentityKey) {
		const identityWithUser = await (await getCurrentAdapter(adapter)).findOne<
			ConfiguredIdentity<Options> & { user: User | null }
		>({
			model: "identity",
			where: [
				{ field: "issuer", value: issuer },
				{ field: "providerAccountId", value: providerAccountId },
			],
			join: { user: true },
		});
		if (!identityWithUser) return null;
		const { user, ...identityFields } = identityWithUser;
		const identity = identityFields as unknown as ConfiguredIdentity<Options>;
		return user
			? { kind: "owned" as const, user, identity }
			: { kind: "orphaned" as const, identity };
	}

	return {
		createUserWithAccount: async <T extends object = Record<string, never>>(
			user: Omit<User, "id" | "createdAt" | "updatedAt" | "emailVerified"> &
				Partial<User> &
				Record<string, unknown>,
			provisioning: CreateUserWithAccountOptions<Options>,
		) => {
			return runAtomicMutation(adapter, {
				runInTransaction: async () => {
					const userToCreate = {
						// todo: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
						createdAt: new Date(),
						updatedAt: new Date(),
						...user,
						email: user.email?.toLowerCase(),
					};
					await assertValidUserCreation(userToCreate, provisioning.source);
					const createdUser = await createWithHooks(
						userToCreate,
						"user",
						undefined,
					);
					if (!createdUser) {
						throw new APIError("BAD_REQUEST", {
							message: "Failed to create user",
						});
					}
					const authentication = provisioning.buildAuthentication({
						userId: createdUser.id,
					});
					const createdIdentity = await createWithHooks(
						{
							...authentication.identity,
							userId: createdUser.id,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
						"identity",
						undefined,
					);
					if (!createdIdentity) {
						throw new APIError("BAD_REQUEST", {
							message: "Failed to create identity",
						});
					}
					const createdAccount = await createWithHooks(
						{
							...authentication.account,
							identityId: createdIdentity.id,
							// todo: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
							createdAt: new Date(),
							updatedAt: new Date(),
						},
						"account",
						undefined,
					);
					if (!createdAccount) {
						throw new APIError("BAD_REQUEST", {
							message: "Failed to create account",
						});
					}
					const relatedRecords =
						provisioning.buildRelatedRecords?.({
							userId: createdUser.id,
							identityId: createdIdentity.id,
							accountId: createdAccount.id,
						}) ?? [];
					assertPluginProvisioningRecords(relatedRecords);
					const currentAdapter = await getCurrentAdapter(adapter);
					for (const relatedRecord of relatedRecords) {
						await currentAdapter.create<Record<string, unknown>>({
							model: relatedRecord.model,
							data: relatedRecord.data,
						});
					}
					return {
						user: createdUser as User & T,
						identity: createdIdentity,
						account: createdAccount,
					};
				},
				prepareAtomicWrites: async () => {
					const userToCreate = {
						id: reserveAtomicWriteId("user"),
						createdAt: new Date(),
						updatedAt: new Date(),
						...user,
						email: user.email?.toLowerCase(),
					};
					await assertValidUserCreation(userToCreate, provisioning.source);
					const preparedUser = await prepareCreateWithHooks(
						userToCreate,
						"user",
					);
					if (!preparedUser) {
						throw new APIError("BAD_REQUEST", {
							message: "Failed to create user",
						});
					}
					const userData = preparedUser.data as unknown as User;
					const userId = getPreparedId(userData, "user");
					const authentication = provisioning.buildAuthentication({ userId });

					const preparedIdentity = await prepareCreateWithHooks(
						{
							id: reserveAtomicWriteId("identity"),
							...authentication.identity,
							userId,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
						"identity",
					);
					if (!preparedIdentity) {
						throw new APIError("BAD_REQUEST", {
							message: "Failed to create identity",
						});
					}
					const identityData =
						preparedIdentity.data as unknown as ConfiguredIdentity<Options>;
					const identityId = getPreparedId(identityData, "identity");

					const preparedAccount = await prepareCreateWithHooks(
						{
							id: reserveAtomicWriteId("account"),
							...authentication.account,
							identityId,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
						"account",
					);
					if (!preparedAccount) {
						throw new APIError("BAD_REQUEST", {
							message: "Failed to create account",
						});
					}
					const accountData =
						preparedAccount.data as unknown as ConfiguredAccount<Options>;
					const accountId = getPreparedId(accountData, "account");
					const relatedRecords =
						provisioning.buildRelatedRecords?.({
							userId,
							identityId,
							accountId,
						}) ?? [];
					assertPluginProvisioningRecords(relatedRecords);
					const preparedRelatedRecords = relatedRecords.map((record) => ({
						...record,
						data: {
							id: reserveAtomicWriteId(record.model),
							...record.data,
						},
					}));

					return {
						operations: [
							{
								type: "create",
								model: "user",
								data: userData,
								forceAllowId: true,
							},
							{
								type: "create",
								model: "identity",
								data: identityData,
								forceAllowId: true,
							},
							{
								type: "create",
								model: "account",
								data: accountData,
								forceAllowId: true,
							},
							...preparedRelatedRecords.map((record) => ({
								type: "create" as const,
								model: record.model,
								data: record.data,
								forceAllowId: true,
							})),
						] satisfies AtomicWriteOperation[],
						afterCommit: async (results: readonly AtomicWriteResult[]) => {
							const createdUser = getCreatedAtomicRecord<User>(
								results,
								0,
								"user",
							);
							const createdIdentity = getCreatedAtomicRecord<
								ConfiguredIdentity<Options>
							>(results, 1, "identity");
							const createdAccount = getCreatedAtomicRecord<
								ConfiguredAccount<Options>
							>(results, 2, "account");
							for (const [
								index,
								relatedRecord,
							] of preparedRelatedRecords.entries()) {
								getCreatedAtomicRecord<Record<string, unknown>>(
									results,
									index + 3,
									relatedRecord.model,
								);
							}
							await preparedUser.queueAfterHooks(createdUser);
							await preparedIdentity.queueAfterHooks(createdIdentity);
							await preparedAccount.queueAfterHooks(createdAccount);
							return {
								user: createdUser as User & T,
								identity: createdIdentity,
								account: createdAccount,
							};
						},
					};
				},
			});
		},
		createUser: async <T>(
			user: Omit<User, "id" | "createdAt" | "updatedAt" | "emailVerified"> &
				Partial<User> &
				Record<string, unknown>,
			source: UserProvisioningSource,
		) => {
			const data = {
				// todo: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
				createdAt: new Date(),
				updatedAt: new Date(),
				...user,
				email: user.email?.toLowerCase(),
			};

			await assertValidUserCreation(data, source);

			const createdUser = await createWithHooks(data, "user", undefined);

			return createdUser as T & User;
		},
		listUsers: async (
			limit?: number | undefined,
			offset?: number | undefined,
			sortBy?:
				| {
						field: string;
						direction: "asc" | "desc";
				  }
				| undefined,
			where?: Where[] | undefined,
		) => {
			const users = await (await getCurrentAdapter(adapter)).findMany<User>({
				model: "user",
				limit,
				offset,
				sortBy,
				where,
			});
			return users;
		},
		countTotalUsers: async (where?: Where[] | undefined) => {
			const total = await (await getCurrentAdapter(adapter)).count({
				model: "user",
				where,
			});
			if (typeof total === "string") {
				return parseInt(total);
			}
			return total;
		},
		deleteUser: async (userId: string) => {
			await runAtomicMutation(adapter, {
				runInTransaction: async () => {
					if (secondaryStorage) {
						await queueAfterTransactionHook(
							() => deleteCachedUserSessions(userId),
							{
								onError(error) {
									logger.error(
										"Failed to delete committed user sessions from secondary storage",
										error,
									);
								},
							},
						);
					}
					if (!secondaryStorage || options.session?.storeSessionInDatabase) {
						await deleteManyWithHooks(
							[{ field: "userId", value: userId }],
							"session",
							undefined,
						);
						const remainingSession = await (
							await getCurrentAdapter(adapter)
						).findOne<Session>({
							model: "session",
							where: [{ field: "userId", value: userId }],
						});
						if (remainingSession) {
							throw new APIError("BAD_REQUEST", {
								code: "session_deletion_rejected",
								message: "User session deletion was rejected",
							});
						}
					}
					await deleteUserAccountRows(userId);
					await assertUserAccountRowsDeleted(userId);

					await deleteWithHooks(
						[{ field: "id", value: userId }],
						"user",
						undefined,
					);
					const remainingUser = await (
						await getCurrentAdapter(adapter)
					).findOne<User>({
						model: "user",
						where: [{ field: "id", value: userId }],
					});
					if (remainingUser) {
						throw new APIError("BAD_REQUEST", {
							code: "user_deletion_rejected",
							message: "User deletion was rejected",
						});
					}
				},
				prepareAtomicWrites: async () => {
					const currentAdapter = await getCurrentAdapter(adapter);
					const operations: AtomicWriteOperation[] = [];
					const afterHooks: AtomicDeleteAfterHook[] = [];
					let userDeleteOperationIndex: number | null = null;

					if (!secondaryStorage || options.session?.storeSessionInDatabase) {
						const sessions = await findAllRecords<Session>({
							model: "session",
							where: [{ field: "userId", value: userId }],
						});
						for (const session of sessions) {
							const where = [{ field: "id", value: session.id }];
							const preparedSession = await prepareDeleteWithHooks(
								where,
								"session",
								{ entities: [session], requireSnapshot: true },
							);
							if (!preparedSession) {
								throw new APIError("BAD_REQUEST", {
									code: "session_deletion_rejected",
									message: "User session deletion was rejected",
								});
							}
							appendAtomicDelete(
								operations,
								afterHooks,
								{ type: "delete", model: "session", where },
								() => preparedSession.queueAfterHooks(),
							);
						}
					}

					const accountPlan = await prepareAtomicUserAccountDeletion(userId);
					appendAtomicDeletionPlan(operations, afterHooks, accountPlan);

					const user = await currentAdapter.findOne<User>({
						model: "user",
						where: [{ field: "id", value: userId }],
					});
					if (user) {
						const where = [{ field: "id", value: user.id }];
						const preparedUser = await prepareDeleteWithHooks(where, "user", {
							entities: [user],
							requireSnapshot: true,
						});
						if (!preparedUser) {
							throw new APIError("BAD_REQUEST", {
								code: "user_deletion_rejected",
								message: "User deletion was rejected",
							});
						}
						userDeleteOperationIndex = operations.length;
						appendAtomicDelete(
							operations,
							afterHooks,
							{ type: "delete", model: "user", where },
							() => preparedUser.queueAfterHooks(),
						);
					}

					return {
						operations,
						afterCommit: async (results) => {
							const userDeleteResult =
								userDeleteOperationIndex === null
									? null
									: results[userDeleteOperationIndex];
							if (
								secondaryStorage &&
								userDeleteResult?.type === "delete" &&
								userDeleteResult.deletedCount === 1
							) {
								try {
									await deleteCachedUserSessions(userId);
								} catch (error) {
									logger.error(
										"Failed to delete committed user sessions from secondary storage",
										error,
									);
								}
							}
							await runCommittedDeleteAfterHooks(results, afterHooks);
						},
					};
				},
			});
		},
		deleteUserAccounts: async (userId: string) => {
			await runAtomicMutation(adapter, {
				runInTransaction: async () => {
					await deleteUserAccountRows(userId);
					await assertUserAccountRowsDeleted(userId);
				},
				prepareAtomicWrites: async () => {
					const plan = await prepareAtomicUserAccountDeletion(userId);
					return {
						operations: plan.operations,
						afterCommit: async (results) => {
							await runCommittedDeleteAfterHooks(results, plan.afterHooks);
						},
					};
				},
			});
		},
		deleteAccountsByProviderInstanceId: async (providerInstanceId: string) => {
			const providerAccountWhere = [
				{ field: "providerInstanceId", value: providerInstanceId },
			];
			await runAtomicMutation(adapter, {
				runInTransaction: async () => {
					const accounts = await findAllRecords<ConfiguredAccount<Options>>({
						model: "account",
						where: providerAccountWhere,
					});
					for (const account of accounts) {
						await accountOwnedRecordCleanup.deleteInCurrentTransaction(
							account.id,
						);
					}
					await deleteManyWithHooks<ConfiguredAccount<Options>>(
						providerAccountWhere,
						"account",
						undefined,
					);
					const remainingAccount = await (
						await getCurrentAdapter(adapter)
					).findOne<ConfiguredAccount<Options>>({
						model: "account",
						where: providerAccountWhere,
					});
					if (remainingAccount) throw createAccountDeletionRejectedError();
				},
				prepareAtomicWrites: async () => {
					const accounts = await findAllRecords<ConfiguredAccount<Options>>({
						model: "account",
						where: providerAccountWhere,
					});
					const operations: AtomicWriteOperation[] = [];
					const afterHooks: AtomicDeleteAfterHook[] = [];
					for (const account of accounts) {
						const accountWhere = [{ field: "id", value: account.id }];
						const preparedAccount = await prepareDeleteWithHooks(
							accountWhere,
							"account",
							{ entities: [account], requireSnapshot: true },
						);
						if (!preparedAccount) throw createAccountDeletionRejectedError();
						operations.push(
							...accountOwnedRecordCleanup.getAtomicDeleteOperations(
								account.id,
							),
						);
						appendAtomicDelete(
							operations,
							afterHooks,
							{ type: "delete", model: "account", where: accountWhere },
							() => preparedAccount.queueAfterHooks(),
						);
					}
					return {
						operations,
						afterCommit: async (results) => {
							await runCommittedDeleteAfterHooks(results, afterHooks);
						},
					};
				},
			});
		},
		/**
		 * Delete an account by its primary key.
		 *
		 * @param id - The account row's primary key, not its providerAccountId.
		 */
		deleteAccount: async (id: string) => {
			await runAtomicMutation(adapter, {
				runInTransaction: async () => {
					const account = await (await getCurrentAdapter(adapter)).findOne<
						ConfiguredAccount<Options>
					>({
						model: "account",
						where: [{ field: "id", value: id }],
					});
					if (!account) return;
					await accountOwnedRecordCleanup.deleteInCurrentTransaction(
						account.id,
					);
					await deleteWithHooks(
						[{ field: "id", value: id }],
						"account",
						undefined,
					);
					const remainingAccount = await (
						await getCurrentAdapter(adapter)
					).findOne<ConfiguredAccount<Options>>({
						model: "account",
						where: [{ field: "id", value: id }],
					});
					if (remainingAccount) throw createAccountDeletionRejectedError();
				},
				prepareAtomicWrites: async () => {
					const currentAdapter = await getCurrentAdapter(adapter);
					const account = await currentAdapter.findOne<
						ConfiguredAccount<Options>
					>({
						model: "account",
						where: [{ field: "id", value: id }],
					});
					if (!account) {
						return {
							operations: [],
							afterCommit: () => undefined,
						};
					}

					const accountWhere = [{ field: "id", value: account.id }];
					const preparedAccount = await prepareDeleteWithHooks(
						accountWhere,
						"account",
						{ entities: [account], requireSnapshot: true },
					);
					if (!preparedAccount) throw createAccountDeletionRejectedError();
					const operations =
						accountOwnedRecordCleanup.getAtomicDeleteOperations(account.id);
					const afterHooks: AtomicDeleteAfterHook[] = [];
					appendAtomicDelete(
						operations,
						afterHooks,
						{ type: "delete", model: "account", where: accountWhere },
						() => preparedAccount.queueAfterHooks(),
					);

					return {
						operations,
						afterCommit: async (results) => {
							await runCommittedDeleteAfterHooks(results, afterHooks);
						},
					};
				},
			});
		},
		findIdentityOwnerByKey,
		findUserByIdentityKey: async (identityKey) => {
			const identityOwner = await findIdentityOwnerByKey(identityKey);
			return identityOwner?.kind === "owned"
				? { user: identityOwner.user, identity: identityOwner.identity }
				: null;
		},
		findUserByEmail: async (
			email: string,
			options?: { includeAccounts: boolean } | undefined,
		) => {
			const currentAdapter = await getCurrentAdapter(adapter);
			const user = await currentAdapter.findOne<User>({
				model: "user",
				where: [
					{
						value: email.toLowerCase(),
						field: "email",
					},
				],
			});
			if (!user) return null;
			return {
				user,
				accounts: options?.includeAccounts
					? await listUserAccountLinks(user.id)
					: [],
			};
		},
		findUserById: async (userId: string) => {
			if (!userId) return null;
			const user = await (await getCurrentAdapter(adapter)).findOne<User>({
				model: "user",
				where: [
					{
						field: "id",
						value: userId,
					},
				],
			});
			return user;
		},
		linkAccount: async (userId, identityKey, account, linkOptions) => {
			let mutationCompleted = false;
			try {
				return await persistAccountLink(
					userId,
					identityKey,
					account,
					linkOptions,
					() => {
						mutationCompleted = true;
					},
				);
			} catch (error) {
				if (mutationCompleted) throw error;
				if (linkOptions?.buildRelatedRecords) throw error;
				// A concurrent link can win either unique key. Re-read outside the
				// failed transaction and recover only when the exact link now exists.
				const identity = await findIdentityByKey(identityKey);
				if (identity && identity.userId !== userId) {
					throw createIdentityAlreadyLinkedError();
				}
				if (identity?.userId === userId) {
					const linkedAccount = await findAccountByKey({
						identityId: identity.id,
						providerInstanceId: account.providerInstanceId,
					});
					if (linkedAccount) return { identity, account: linkedAccount };
				}
				// A concurrent account unlink can remove the identity after the first
				// mutation has read it but before it commits. Retry once from a fresh
				// transaction so the link either converges or returns the established
				// identity-owner error instead of leaking an adapter-specific conflict.
				return await persistAccountLink(
					userId,
					identityKey,
					account,
					linkOptions,
					() => {
						mutationCompleted = true;
					},
				);
			}
		},
		updateUser: async (
			userId: string,
			data: Partial<User> & Record<string, unknown>,
		) => {
			const user = await updateWithHooks<User>(
				{
					...data,
					...(data.email ? { email: data.email.toLowerCase() } : {}),
				},
				[
					{
						field: "id",
						value: userId,
					},
				],
				"user",
				undefined,
			);
			await queueAfterTransactionHook(() => refreshUserSessions(user), {
				onError(error) {
					logger.error(
						"Failed to refresh committed user sessions in secondary storage",
						error,
					);
				},
			});
			return user;
		},
		updateUserByEmail: async (
			email: string,
			data: Partial<User & Record<string, unknown>>,
		) => {
			const user = await updateWithHooks<User>(
				{
					...data,
					...(data.email ? { email: data.email.toLowerCase() } : {}),
				},
				[
					{
						field: "email",
						value: email.toLowerCase(),
					},
				],
				"user",
				undefined,
			);
			await queueAfterTransactionHook(() => refreshUserSessions(user), {
				onError(error) {
					logger.error(
						"Failed to refresh committed user sessions in secondary storage",
						error,
					);
				},
			});
			return user;
		},
		updatePassword: async (userId: string, password: string) => {
			const credentialIdentity = await findIdentityByKey({
				issuer: createLocalIdentityIssuer("credential"),
				providerAccountId: userId,
			});
			if (!credentialIdentity || credentialIdentity.userId !== userId) return;
			const credentialAccount = await findAccountByKey({
				identityId: credentialIdentity.id,
				providerInstanceId: "credential",
			});
			if (!credentialAccount) return;
			await updateAccountById(credentialAccount.id, {
				password,
			} as Omit<
				Partial<ConfiguredAccount<Options>>,
				"identityId" | "providerId" | "providerInstanceId"
			>);
		},
		listUserAccounts: listUserAccountLinks,
		findCredentialAccount: async (userId: string) => {
			const identity = await findIdentityByKey({
				issuer: createLocalIdentityIssuer("credential"),
				providerAccountId: userId,
			});
			if (!identity || identity.userId !== userId) return null;
			return findAccountByKey({
				identityId: identity.id,
				providerInstanceId: "credential",
			});
		},
		findIdentityByKey,
		findAccountByKey,
		findAccountWithIdentityById: async (id: string) => {
			const joinedAccount = await (await getCurrentAdapter(adapter)).findOne<
				ConfiguredAccount<Options> & {
					identity: ConfiguredIdentity<Options> | null;
				}
			>({
				model: "account",
				where: [{ field: "id", value: id }],
				join: { identity: true },
			});
			if (!joinedAccount?.identity) return null;
			const { identity, ...accountFields } = joinedAccount;
			const account = accountFields as unknown as ConfiguredAccount<Options>;
			return { identity, account };
		},
		updateAccount: updateAccountById,
	};
}
