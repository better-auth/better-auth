import type { DBAdapter } from "better-auth";

// Optional import - will be undefined if @better-auth/scim is not installed
type SCIMProvider = any;

/**
 * Find all SCIM providers for an organization.
 */
export async function findProvidersByOrganization(
	adapter: DBAdapter,
	organizationId: string,
): Promise<SCIMProvider[]> {
	return adapter.findMany<SCIMProvider>({
		model: "scimProvider",
		where: [{ field: "organizationId", value: organizationId }],
	});
}

/**
 * Find a SCIM provider by ID and organization.
 */
export async function findProviderById(
	adapter: DBAdapter,
	directoryId: string,
	organizationId: string,
): Promise<SCIMProvider | null> {
	return adapter.findOne<SCIMProvider>({
		model: "scimProvider",
		where: [
			{ field: "id", value: directoryId },
			{ field: "organizationId", value: organizationId },
		],
	});
}

/**
 * Create a new SCIM provider.
 */
export async function createProvider(
	adapter: DBAdapter,
	data: { providerId: string; organizationId: string; scimToken: string },
): Promise<SCIMProvider> {
	return adapter.create<SCIMProvider>({
		model: "scimProvider",
		data: data,
	});
}

/**
 * Update a SCIM provider's token.
 */
export async function updateProviderToken(
	adapter: DBAdapter,
	providerId: string,
	scimToken: string,
): Promise<void> {
	await adapter.update({
		model: "scimProvider",
		where: [{ field: "id", value: providerId }],
		update: { scimToken },
	});
}

/**
 * Delete a SCIM provider.
 */
export async function deleteProvider(
	adapter: DBAdapter,
	directoryId: string,
): Promise<void> {
	await adapter.delete({
		model: "scimProvider",
		where: [{ field: "id", value: directoryId }],
	});
}

/**
 * Count users synced via a SCIM provider.
 */
export async function countProviderUsers(
	adapter: DBAdapter,
	providerId: string,
): Promise<number> {
	try {
		return await adapter.count({
			model: "account",
			where: [{ field: "providerId", value: providerId }],
		});
	} catch {
		return 0;
	}
}
