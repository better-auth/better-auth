import type { GenericEndpointContext } from "@better-auth/core";
import { safeJSONParse } from "@better-auth/core/utils/json";
import * as z from "zod";
import { APIError } from "../../api";
import { defaultRoles } from "./access";
import type {
	AccessControlRoleMap,
	HasPermissionBaseInput,
} from "./permission";
import { cacheAllRoles, hasPermissionFn } from "./permission";
import type { OrganizationRole } from "./schema";
import type { OrganizationOptions } from "./types";

const DEFAULT_PERMISSION_CACHE_TTL = 60;
const permissionStatementsSchema = z.record(z.string(), z.array(z.string()));
const dynamicRoleStatementsSchema = z.record(
	z.string(),
	permissionStatementsSchema,
);
const permissionCachePayloadSchema = z.object({
	roles: dynamicRoleStatementsSchema,
});
const warnedPermissionCacheWithoutStorage = new WeakSet<OrganizationOptions>();

type DynamicRoleStatements = z.infer<typeof dynamicRoleStatementsSchema>;
type PermissionStatements = z.infer<typeof permissionStatementsSchema>;

const getPermissionCacheTTL = (options: OrganizationOptions) => {
	const ttl = options.permissionCache?.ttl;
	const normalizedTTL =
		typeof ttl === "number" && Number.isFinite(ttl)
			? ttl
			: DEFAULT_PERMISSION_CACHE_TTL;
	return Math.max(Math.floor(normalizedTTL), 0);
};

const getPermissionCacheKey = (organizationId: string) =>
	`organization-role-permissions:${organizationId}`;

const getDefaultAccessControlRoles = (
	options: OrganizationOptions,
): AccessControlRoleMap => ({ ...(options.roles || defaultRoles) });

const mergePermissionStatements = (
	existing: PermissionStatements = {},
	incoming: PermissionStatements,
): PermissionStatements => {
	const merged: PermissionStatements = { ...existing };
	for (const [key, actions] of Object.entries(incoming)) {
		merged[key] = [...new Set([...(merged[key] ?? []), ...actions])];
	}
	return merged;
};

const setMemoryRoleCache = (
	organizationId: string,
	roles: AccessControlRoleMap,
	options: OrganizationOptions,
) => {
	const ttl = getPermissionCacheTTL(options);
	const now = Date.now();
	for (const [cachedOrganizationId, cacheEntry] of cacheAllRoles) {
		if (cacheEntry.expiresAt <= now) {
			cacheAllRoles.delete(cachedOrganizationId);
		}
	}
	if (ttl === 0) {
		cacheAllRoles.delete(organizationId);
		return;
	}
	cacheAllRoles.set(organizationId, {
		expiresAt: now + ttl * 1000,
		roles,
	});
};

const getMemoryRoleCache = (organizationId: string) => {
	const cacheEntry = cacheAllRoles.get(organizationId);
	if (!cacheEntry) return null;
	if (cacheEntry.expiresAt <= Date.now()) {
		cacheAllRoles.delete(organizationId);
		return null;
	}
	return cacheEntry.roles;
};

const parsePermissionStatements = (
	role: string,
	rawPermission: unknown,
	ctx: GenericEndpointContext,
) => {
	const parsedPermission = safeJSONParse<unknown>(rawPermission);
	const result = permissionStatementsSchema.safeParse(parsedPermission);
	if (!result.success) {
		ctx.context.logger.error(
			"[hasPermission] Invalid permissions for role " + role,
			{
				permissions: parsedPermission,
			},
		);
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "Invalid permissions for role " + role,
		});
	}
	return result.data;
};

const buildAccessControlRoles = (
	options: OrganizationOptions,
	dynamicRoleStatements: DynamicRoleStatements,
) => {
	const acRoles = getDefaultAccessControlRoles(options);
	if (!options.ac) {
		return acRoles;
	}

	for (const [role, statements] of Object.entries(dynamicRoleStatements)) {
		acRoles[role] = options.ac.newRole(
			mergePermissionStatements(acRoles[role]?.statements, statements),
		);
	}

	return acRoles;
};

const getDynamicRoleStatementsFromDatabase = async (
	organizationId: string,
	ctx: GenericEndpointContext,
) => {
	const roles = await ctx.context.adapter.findMany<
		OrganizationRole & { permission: string }
	>({
		model: "organizationRole",
		where: [
			{
				field: "organizationId",
				value: organizationId,
			},
		],
	});

	const dynamicRoleStatements: DynamicRoleStatements = {};
	for (const { role, permission } of roles) {
		const statements = parsePermissionStatements(role, permission, ctx);
		dynamicRoleStatements[role] = mergePermissionStatements(
			dynamicRoleStatements[role],
			statements,
		);
	}

	return dynamicRoleStatements;
};

const getSecondaryStorageRoleCache = async (
	organizationId: string,
	options: OrganizationOptions,
	ctx: GenericEndpointContext,
) => {
	const secondaryStorage = ctx.context.secondaryStorage;
	if (!options.permissionCache?.enabled || !secondaryStorage) {
		return null;
	}

	const rawCachedRoles = await secondaryStorage.get(
		getPermissionCacheKey(organizationId),
	);
	if (!rawCachedRoles) {
		return null;
	}

	const parsedPayload = permissionCachePayloadSchema.safeParse(
		safeJSONParse(rawCachedRoles),
	);
	if (!parsedPayload.success) {
		await secondaryStorage.delete(getPermissionCacheKey(organizationId));
		return null;
	}

	return buildAccessControlRoles(options, parsedPayload.data.roles);
};

const resolveAccessControlRoles = async (
	input: {
		organizationId: string;
		options: OrganizationOptions;
		useMemoryCache?: boolean | undefined;
	},
	ctx: GenericEndpointContext,
) => {
	const defaultRolesMap = getDefaultAccessControlRoles(input.options);
	const shouldUseMemoryCache = input.useMemoryCache === true;
	if (!input.organizationId) {
		return defaultRolesMap;
	}

	if (shouldUseMemoryCache) {
		const cachedRoles = getMemoryRoleCache(input.organizationId);
		if (cachedRoles) {
			return cachedRoles;
		}
	}

	if (!input.options.dynamicAccessControl?.enabled || !input.options.ac) {
		if (shouldUseMemoryCache) {
			setMemoryRoleCache(input.organizationId, defaultRolesMap, input.options);
		}
		return defaultRolesMap;
	}

	const secondaryStorage = ctx.context.secondaryStorage;
	if (input.options.permissionCache?.enabled && !secondaryStorage) {
		if (!warnedPermissionCacheWithoutStorage.has(input.options)) {
			ctx.context.logger.warn(
				"[organization] `permissionCache.enabled` requires a global `secondaryStorage` configuration. Falling back to database reads for organization permissions.",
			);
			warnedPermissionCacheWithoutStorage.add(input.options);
		}
	}

	const cachedRoles = await getSecondaryStorageRoleCache(
		input.organizationId,
		input.options,
		ctx,
	);
	if (cachedRoles) {
		if (shouldUseMemoryCache) {
			setMemoryRoleCache(input.organizationId, cachedRoles, input.options);
		}
		return cachedRoles;
	}

	const dynamicRoleStatements = await getDynamicRoleStatementsFromDatabase(
		input.organizationId,
		ctx,
	);
	const acRoles = buildAccessControlRoles(input.options, dynamicRoleStatements);
	if (shouldUseMemoryCache) {
		setMemoryRoleCache(input.organizationId, acRoles, input.options);
	}

	if (input.options.permissionCache?.enabled && secondaryStorage) {
		await secondaryStorage.set(
			getPermissionCacheKey(input.organizationId),
			JSON.stringify({ roles: dynamicRoleStatements }),
			getPermissionCacheTTL(input.options),
		);
	}

	return acRoles;
};

export const invalidatePermissionCache = async (
	organizationId: string,
	ctx: GenericEndpointContext,
) => {
	cacheAllRoles.delete(organizationId);
	try {
		await ctx.context.secondaryStorage?.delete(
			getPermissionCacheKey(organizationId),
		);
	} catch (error) {
		ctx.context.logger.warn(
			"[organization] Failed to invalidate permission cache after an organization write. Continuing without blocking the request.",
			{
				error,
				organizationId,
			},
		);
	}
};

export const hasPermission = async (
	input: {
		organizationId: string;
		/**
		 * If true, will use the in-memory cache of the roles.
		 * Keep in mind to use this in a stateless mindset, the purpose of this is to avoid unnecessary database calls when running multiple
		 * hasPermission calls in a row.
		 *
		 * @default false
		 */
		useMemoryCache?: boolean | undefined;
	} & HasPermissionBaseInput,
	ctx: GenericEndpointContext,
) => {
	const acRoles = await resolveAccessControlRoles(
		{
			organizationId: input.organizationId,
			options: input.options,
			useMemoryCache: input.useMemoryCache,
		},
		ctx,
	);

	return hasPermissionFn(input, acRoles);
};
