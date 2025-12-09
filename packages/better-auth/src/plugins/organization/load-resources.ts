import type { GenericEndpointContext } from "@better-auth/core";
import * as z from "zod";
import { APIError } from "../../api";
import type { AccessControl, Statements } from "../access";
import { createAccessControl } from "../access";
import { defaultStatements } from "./access/statement";
import type { OrganizationResource } from "./schema";
import type { OrganizationOptions } from "./types";
import { safeJSONParse } from "@better-auth/core/utils";

/**
 * In-memory cache for custom resources per organization
 * Map<organizationId, Statements>
 */
const customResourcesCache = new Map<string, Statements>();

/**
 * Load custom resources from the database for a specific organization
 */
export async function loadCustomResources(
	organizationId: string,
	ctx: GenericEndpointContext,
): Promise<Statements | null> {
	// Check cache first
	const cached = customResourcesCache.get(organizationId);
	if (cached) {
		return cached;
	}

	// Load from database
	const resources = await ctx.context.adapter.findMany<
		OrganizationResource & { permissions: string }
	>({
		model: "organizationResource",
		where: [
			{
				field: "organizationId",
				value: organizationId,
			},
		],
	});

	if (!resources || resources.length === 0) {
		return null;
	}

	// Build statements object from resources
	const statements: Record<string, readonly string[]> = {};

	for (const resource of resources) {
		const permissions = safeJSONParse(resource.permissions);
		const result = z
			.array(z.string())
			.safeParse(permissions);

		if (!result.success) {
			ctx.context.logger.error(
				"[loadCustomResources] Invalid permissions for resource " +
					resource.resource,
				{
					permissions,
				},
			);
			throw new APIError("INTERNAL_SERVER_ERROR", {
				message: "Invalid permissions for resource " + resource.resource,
			});
		}

		statements[resource.resource] = result.data as readonly string[];
	}

	// Cache the result
	customResourcesCache.set(organizationId, statements as Statements);

	return statements as Statements;
}

/**
 * Get the merged statements (default + custom) for an organization
 * Returns an AccessControl instance with the merged statements
 */
export async function getOrganizationStatements(
	organizationId: string,
	options: OrganizationOptions,
	ctx: GenericEndpointContext,
): Promise<Statements> {
	// Start with default statements from AC instance or fallback to defaults
	const baseStatements = options.ac?.statements || defaultStatements;

	// If custom resources are not enabled, return base statements
	if (!options.dynamicAccessControl?.enableCustomResources) {
		return baseStatements;
	}

	// Load custom resources
	const customResources = await loadCustomResources(organizationId, ctx);

	if (!customResources) {
		// No custom resources for this organization, return base statements
		return baseStatements;
	}

	// Merge: custom resources override defaults if they have the same name
	const merged = {
		...baseStatements,
		...customResources,
	};

	return merged as Statements;
}

/**
 * Create an AccessControl instance for a specific organization
 * Uses merged statements (default + custom)
 */
export async function getOrganizationAccessControl(
	organizationId: string,
	options: OrganizationOptions,
	ctx: GenericEndpointContext,
): Promise<AccessControl> {
	const statements = await getOrganizationStatements(
		organizationId,
		options,
		ctx,
	);
	return createAccessControl(statements);
}

/**
 * Invalidate the cache for a specific organization
 */
export function invalidateResourceCache(organizationId: string): void {
	customResourcesCache.delete(organizationId);
}

/**
 * Clear all cached resources
 */
export function clearAllResourceCache(): void {
	customResourcesCache.clear();
}

/**
 * Get default reserved resource names
 */
export function getDefaultReservedResourceNames(): string[] {
	return ["organization", "member", "invitation", "team", "ac"];
}

/**
 * Get reserved resource names from config or defaults
 */
export function getReservedResourceNames(
	options: OrganizationOptions,
): string[] {
	return (
		options.dynamicAccessControl?.reservedResourceNames ||
		getDefaultReservedResourceNames()
	);
}

/**
 * Validate a resource name according to the rules:
 * - Must be lowercase alphanumeric with underscores
 * - Length between 1 and 50 characters
 * - Cannot be a reserved name
 * - Custom validation function if provided
 */
export function validateResourceName(
	name: string,
	options: OrganizationOptions,
): { valid: boolean; error?: string } {
	// Length validation first
	if (name.length < 1 || name.length > 50) {
		return {
			valid: false,
			error: "Resource name must be between 1 and 50 characters",
		};
	}

	// Basic format validation
	if (!/^[a-zA-Z0-9_]+$/.test(name)) {
		return {
			valid: false,
			error: "Resource name must be alphanumeric with underscores only",
		};
	}

	// Check reserved names
	const reservedNames = getReservedResourceNames(options);
	if (reservedNames.includes(name)) {
		return {
			valid: false,
			error: `Resource name "${name}" is reserved and cannot be used`,
		};
	}

	// Custom validation if provided
	if (options.dynamicAccessControl?.resourceNameValidation) {
		const customResult =
			options.dynamicAccessControl.resourceNameValidation(name);
		if (typeof customResult === "boolean") {
			return customResult
				? { valid: true }
				: { valid: false, error: "Resource name failed custom validation" };
		}
		return customResult;
	}

	return { valid: true };
}
