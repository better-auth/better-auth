import type { Role } from "../access";
import type { OrganizationOptions } from "./types";

export const hasPermissionFn = (
	input: HasPermissionBaseInput,
	acRoles: {
		[x: string]: Role<any> | undefined;
	},
) => {
	if (!input.permissions && !input.permission) return false;

	const roles = input.role.split(",");
	const creatorRole = input.options.creatorRole || "owner";
	const isCreator = roles.includes(creatorRole);

	const allowCreatorsAllPermissions = input.allowCreatorAllPermissions || false;
	if (isCreator && allowCreatorsAllPermissions) return true;

	// Prefer `tx.context.logger` when provided on the input (transactional logger),
	// otherwise fall back to `console`. Normalize to a single callable `warn`
	// function and bind it to preserve `this` for method-based loggers.
	const providedLogger: any = (input as any).tx?.context?.logger;
	const warn: (msg: string, ...args: any[]) => void =
		typeof providedLogger?.warn === "function"
			? providedLogger.warn.bind(providedLogger)
			: typeof providedLogger === "function"
				? providedLogger
				: typeof providedLogger?.log === "function"
					? providedLogger.log.bind(providedLogger)
					: console.warn.bind(console);

	for (const role of roles) {
		const _role = acRoles[role as keyof typeof acRoles];
		if (!_role) {
			// Log warning for debugging. Prefer the provided transactional logger
			// (`tx.context.logger.warn`) when available.
			const message = `[hasPermission] Role "${role}" not found in configured roles`;
			warn(message);
			continue;
		}
		const result = _role?.authorize(input.permissions ?? input.permission);
		if (result?.success) {
			return true;
		}
	}
	return false;
};

export type PermissionExclusive =
	| {
			/**
			 * @deprecated Use `permissions` instead
			 */
			permission: { [key: string]: string[] };
			permissions?: never | undefined;
	  }
	| {
			permissions: { [key: string]: string[] };
			permission?: never | undefined;
	  };

export let cacheAllRoles = new Map<
	string,
	{
		[x: string]: Role<any> | undefined;
	}
>();

export type HasPermissionBaseInput = {
	role: string;
	options: OrganizationOptions;
	allowCreatorAllPermissions?: boolean | undefined;
} & PermissionExclusive;
