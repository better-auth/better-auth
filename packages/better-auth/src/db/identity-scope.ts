import type { BetterAuthOptions } from "@better-auth/core";
import { getCurrentAuthContext } from "@better-auth/core/context";
import type {
	DBAdapter,
	DBTransactionAdapter,
	Where,
} from "@better-auth/core/db/adapter";
import { BetterAuthError } from "@better-auth/core/error";

const coreScopedModels = ["user", "account", "session", "verification"];

export type ResolvedIdentityScope = {
	field: string;
	value: string;
};

export async function resolveIdentityScope(
	options: BetterAuthOptions,
	source?: {
		headers?: Headers | null;
		request?: Request | null;
	},
): Promise<ResolvedIdentityScope | null> {
	const identityScope = options.user?.identityScope;
	if (!identityScope) return null;

	const value = await identityScope.resolve({
		headers: source?.headers ?? undefined,
		request: source?.request ?? undefined,
	});
	if (typeof value !== "string" || value.length === 0) {
		throw new BetterAuthError(
			"Unable to resolve the identity scope for this operation.",
		);
	}

	return {
		field: identityScope.field,
		value,
	};
}

function createIdentityScopeResolver(options: BetterAuthOptions) {
	const identityScope = options.user?.identityScope;
	if (!identityScope) return async () => null;
	const requestValues = new WeakMap<object, Promise<ResolvedIdentityScope>>();

	return async () => {
		const endpointContext = await getCurrentAuthContext().catch(() => null);
		if (!endpointContext) return resolveIdentityScope(options);

		const existing = requestValues.get(endpointContext);
		if (existing) return existing;

		const value = resolveIdentityScope(options, {
			headers: endpointContext.headers,
			request: endpointContext.request,
		}).then((scope) => {
			if (!scope) {
				throw new BetterAuthError(
					"Unable to resolve the identity scope for this operation.",
				);
			}
			return scope;
		});
		requestValues.set(endpointContext, value);
		return value;
	};
}

function scopeWhere(where: Where[] | undefined, field: string, value: string) {
	return [
		...(where ?? []).filter((condition) => condition.field !== field),
		{ field, value },
	];
}

function isSupportedUserId(userId: unknown): userId is string | number {
	return (
		(typeof userId === "string" && userId.length > 0) ||
		(typeof userId === "number" && Number.isFinite(userId))
	);
}

function createScopedTransactionAdapter(
	adapter: DBTransactionAdapter,
	scopedModels: ReadonlySet<string>,
	resolveIdentityScope: () => Promise<ResolvedIdentityScope | null>,
): DBTransactionAdapter {
	const scopeInput = async (model: string, data: Record<string, unknown>) => {
		if (!scopedModels.has(model)) return data;
		const scope = await resolveIdentityScope();
		if (!scope) return data;

		const userId = data.userId;
		if (model !== "user" && userId != null) {
			if (
				!isSupportedUserId(userId) ||
				!(await adapter.findOne({
					model: "user",
					where: [
						{ field: "id", value: userId },
						{ field: scope.field, value: scope.value },
					],
					select: ["id"],
				}))
			) {
				throw new BetterAuthError(
					`Cannot create or move "${model}" data across identity scopes.`,
				);
			}
		}

		return {
			...data,
			[scope.field]: scope.value,
		};
	};

	const scopedWhere = async (model: string, where: Where[] | undefined) => {
		if (!scopedModels.has(model)) return where ?? [];
		const scope = await resolveIdentityScope();
		return scope ? scopeWhere(where, scope.field, scope.value) : (where ?? []);
	};

	const create: DBTransactionAdapter["create"] = async (input) =>
		adapter.create({
			...input,
			data: await scopeInput(
				input.model,
				input.data as Record<string, unknown>,
			),
		});
	const findOne: DBTransactionAdapter["findOne"] = async (input) =>
		adapter.findOne({
			...input,
			where: await scopedWhere(input.model, input.where),
		});
	const findMany: DBTransactionAdapter["findMany"] = async (input) =>
		adapter.findMany({
			...input,
			where: await scopedWhere(input.model, input.where),
		});
	const count: DBTransactionAdapter["count"] = async (input) =>
		adapter.count({
			...input,
			where: await scopedWhere(input.model, input.where),
		});
	const update: DBTransactionAdapter["update"] = async (input) =>
		adapter.update({
			...input,
			where: await scopedWhere(input.model, input.where),
			update: await scopeInput(input.model, input.update),
		});
	const updateMany: DBTransactionAdapter["updateMany"] = async (input) =>
		adapter.updateMany({
			...input,
			where: await scopedWhere(input.model, input.where),
			update: await scopeInput(input.model, input.update),
		});
	const deleteOne: DBTransactionAdapter["delete"] = async (input) =>
		adapter.delete({
			...input,
			where: await scopedWhere(input.model, input.where),
		});
	const deleteMany: DBTransactionAdapter["deleteMany"] = async (input) =>
		adapter.deleteMany({
			...input,
			where: await scopedWhere(input.model, input.where),
		});
	const consumeOne: DBTransactionAdapter["consumeOne"] = async (input) =>
		adapter.consumeOne({
			...input,
			where: await scopedWhere(input.model, input.where),
		});
	const incrementOne: DBTransactionAdapter["incrementOne"] = async (input) =>
		adapter.incrementOne({
			...input,
			where: await scopedWhere(input.model, input.where),
			set: await scopeInput(input.model, input.set ?? {}),
		});

	return {
		...adapter,
		create,
		findOne,
		findMany,
		count,
		update,
		updateMany,
		delete: deleteOne,
		deleteMany,
		consumeOne,
		incrementOne,
	};
}

export function createIdentityScopedAdapter(
	adapter: DBAdapter,
	options: BetterAuthOptions,
): DBAdapter {
	const identityScope = options.user?.identityScope;
	if (!identityScope) return adapter;

	if (options.secondaryStorage) {
		throw new BetterAuthError(
			"Tenant-scoped identity does not yet support secondaryStorage.",
		);
	}
	if (options.session?.cookieCache?.enabled) {
		throw new BetterAuthError(
			"Tenant-scoped identity does not support session.cookieCache.",
		);
	}

	const scopedModels = new Set([
		...coreScopedModels,
		...(identityScope.models ?? []),
	]);
	const resolveIdentityScope = createIdentityScopeResolver(options);
	const scoped = createScopedTransactionAdapter(
		adapter,
		scopedModels,
		resolveIdentityScope,
	);

	return {
		...scoped,
		transaction: (callback) =>
			adapter.transaction((transaction) =>
				callback(
					createScopedTransactionAdapter(
						transaction,
						scopedModels,
						resolveIdentityScope,
					),
				),
			),
	};
}
