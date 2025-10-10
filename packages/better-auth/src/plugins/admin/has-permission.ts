import { createDefu } from "defu";
import type { Role } from "../access";
import { defaultAc, defaultRoles } from "./access";
import type { AdminOptions } from "./types";

type PermissionExclusive =
	| {
			/**
			 * @deprecated Use `permissions` instead
			 */
			permission: { [key: string]: string[] };
			permissions?: never;
	  }
	| {
			permissions: { [key: string]: string[] };
			permission?: never;
	  };

export const isAdmin = (
	data: { userId?: string; role?: string },
	options?: {
		adminUserIds?: string | string[];
		adminRoles?: string | string[];
	},
) => {
	if (data.userId && options?.adminUserIds?.includes(data.userId)) {
		return true;
	}
	if (data.role && (options?.adminRoles ?? ["admin"]).includes(data.role)) {
		return true;
	}
	return false;
};

export const hasPermission = (
	input: {
		userId?: string;
		role?: string;
		options?: AdminOptions;
	} & PermissionExclusive,
) => {
	if (
		isAdmin(
			{
				userId: input.userId,
			},
			input.options,
		)
	) {
		return true;
	}
	if (!input.permissions && !input.permission) {
		return false;
	}
	const roles = (input.role || input.options?.defaultRole || "user").split(",");
	const acRoles = input.options?.roles || defaultRoles;
	for (const role of roles) {
		const _role = acRoles[role as keyof typeof acRoles];
		const result = _role?.authorize(input.permission ?? input.permissions);
		if (result?.success) {
			return true;
		}
	}
	return false;
};

export const getStatements = (input: {
	userId?: string;
	role?: string | string[];
	options?: AdminOptions;
}): Readonly<Record<string, Readonly<string[]>>> => {
	if (
		isAdmin(
			{
				userId: input.userId,
			},
			input.options,
		)
	) {
		return input.options?.ac?.statements ?? defaultAc.statements;
	}

	const roles = Array.isArray(input.role)
		? input.role
		: (input.role || input.options?.defaultRole || "user").split(",");
	const acRoles = input.options?.roles || defaultRoles;

	const statements = mergeUniqueArray(
		{},
		...roles.map(
			(role) => (acRoles as Record<string, Role>)[role]?.statements ?? {},
		),
	);

	return statements;
};

export const mergeUniqueArray = createDefu((obj, key, value) => {
	const current = obj[key] ?? [];

	if (Array.isArray(current) && Array.isArray(value)) {
		// merge + dedupe
		const merged = Array.from(new Set([...current, ...value]));
		// @ts-expect-error
		obj[key] = merged;
		return true;
	}

	return false;
});
