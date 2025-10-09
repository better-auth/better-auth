import type { GenericEndpointContext } from "@better-auth/core";
import type { User, Account } from "../../types";
import type { LoginAlias } from "./schema";
import { normalizeAliasValue } from "./utils";

/**
 * Find user by email or alias
 * This function first tries to find the user by email directly,
 * then falls back to checking aliases
 */
export async function findUserByEmailOrAlias(
	ctx: GenericEndpointContext,
	identifier: string,
	options?: {
		includeAccounts?: boolean;
	},
): Promise<{
	user: User;
	accounts: Account[];
} | null> {
	// First try to find by email directly (standard behavior)
	const userByEmail = await ctx.context.internalAdapter.findUserByEmail(
		identifier,
		options ? { includeAccounts: options.includeAccounts ?? false } : undefined,
	);

	if (userByEmail) {
		return userByEmail;
	}

	// If not found, try to find by alias
	try {
		// Normalize the identifier (lowercase, trim)
		const normalizedIdentifier = identifier.toLowerCase().trim();

		// Try to find an alias
		const alias = await ctx.context.adapter.findOne<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "value", value: normalizedIdentifier }],
		});

		if (!alias) {
			return null;
		}

		// If alias found, get the user by ID
		const user = await ctx.context.adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: alias.userId }],
		});

		if (!user) {
			return null;
		}

		// Get accounts if requested
		let accounts: Account[] = [];
		if (options?.includeAccounts) {
			accounts = await ctx.context.internalAdapter.findAccounts(user.id);
		}

		return {
			user,
			accounts,
		};
	} catch (error) {
		// If alias lookup fails (e.g., table doesn't exist), return null
		ctx.context.logger.error("Error finding user by alias", error);
		return null;
	}
}

/**
 * Find user by username or alias
 * This function tries to find the user by checking aliases with type 'username'
 */
export async function findUserByUsernameOrAlias(
	ctx: GenericEndpointContext,
	username: string,
	options?: {
		includeAccounts?: boolean;
	},
): Promise<{
	user: User;
	accounts: Account[];
} | null> {
	try {
		// Normalize the username
		const normalizedUsername = normalizeAliasValue(username, "username");

		// Try to find the alias
		const alias = await ctx.context.adapter.findOne<LoginAlias>({
			model: "loginAlias",
			where: [
				{ field: "value", value: normalizedUsername },
				{ field: "type", value: "username" },
			],
		});

		if (!alias) {
			return null;
		}

		// Get the user
		const user = await ctx.context.adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: alias.userId }],
		});

		if (!user) {
			return null;
		}

		// Get accounts if requested
		let accounts: Account[] = [];
		if (options?.includeAccounts) {
			accounts = await ctx.context.internalAdapter.findAccounts(user.id);
		}

		return {
			user,
			accounts,
		};
	} catch (error) {
		ctx.context.logger.error("Error finding user by username alias", error);
		return null;
	}
}

/**
 * Find user by any alias type
 */
export async function findUserByAlias(
	ctx: GenericEndpointContext,
	value: string,
	type?: string,
	options?: {
		includeAccounts?: boolean;
	},
): Promise<{
	user: User;
	accounts: Account[];
	alias: LoginAlias;
} | null> {
	try {
		// Normalize the value based on type
		const normalizedValue = type
			? normalizeAliasValue(value, type)
			: value.toLowerCase().trim();

		// Build the where clause
		const where: any[] = [{ field: "value", value: normalizedValue }];
		if (type) {
			where.push({ field: "type", value: type });
		}

		// Try to find the alias
		const alias = await ctx.context.adapter.findOne<LoginAlias>({
			model: "loginAlias",
			where,
		});

		if (!alias) {
			return null;
		}

		// Get the user
		const user = await ctx.context.adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: alias.userId }],
		});

		if (!user) {
			return null;
		}

		// Get accounts if requested
		let accounts: Account[] = [];
		if (options?.includeAccounts) {
			accounts = await ctx.context.internalAdapter.findAccounts(user.id);
		}

		return {
			user,
			accounts,
			alias,
		};
	} catch (error) {
		ctx.context.logger.error("Error finding user by alias", error);
		return null;
	}
}

