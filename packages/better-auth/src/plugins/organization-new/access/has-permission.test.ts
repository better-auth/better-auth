import type { GenericEndpointContext } from "@better-auth/core";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { createAccessControl } from "../../access";
import { dynamicAccessControl } from "../addons/dynamic-access-control";
import type { RealOrganizationId } from "../helpers/get-org-adapter";
import type { OrganizationOptions } from "../types";
import { hasPermission } from "./has-permission";
import { cacheAllRoles } from "./permission";
import { defaultRoles, defaultStatements } from "./statement";

const testAc = createAccessControl(defaultStatements);

const createMockContext = (
	mockFindMany: () => Promise<any[]>,
): GenericEndpointContext => {
	return {
		context: {
			adapter: {
				findMany: mockFindMany,
			},
			logger: {
				error: vi.fn(),
			},
		},
	} as unknown as GenericEndpointContext;
};

const createOptions = (
	overrides: Partial<OrganizationOptions> = {},
): OrganizationOptions => ({
	roles: defaultRoles,
	ac: testAc,
	use: [dynamicAccessControl()],
	...overrides,
});

describe("hasPermission", async (it) => {
	const testOrgId = "test-org-id" as RealOrganizationId;

	beforeEach(() => {
		cacheAllRoles.clear();
	});

	afterEach(() => {
		cacheAllRoles.clear();
	});

	it("should check permission correctly with default roles", async () => {
		const mockFindMany = vi.fn().mockResolvedValue([]);
		const ctx = createMockContext(mockFindMany);
		const options = createOptions();

		const result = await hasPermission(
			{
				organizationId: testOrgId,
				role: "owner",
				options,
				permissions: { organization: ["delete"] },
			},
			ctx,
		);

		expect(result).toBe(true);
	});

	it("should deny permission for role without access", async () => {
		const mockFindMany = vi.fn().mockResolvedValue([]);
		const ctx = createMockContext(mockFindMany);
		const options = createOptions();

		const result = await hasPermission(
			{
				organizationId: testOrgId,
				role: "member",
				options,
				permissions: { organization: ["delete"] },
			},
			ctx,
		);

		expect(result).toBe(false);
	});

	it("should cache roles when useMemoryCache is false", async () => {
		const mockFindMany = vi.fn().mockResolvedValue([]);
		const ctx = createMockContext(mockFindMany);
		const options = createOptions();

		await hasPermission(
			{
				organizationId: testOrgId,
				role: "owner",
				options,
				permissions: { organization: ["delete"] },
				useMemoryCache: false,
			},
			ctx,
		);

		expect(cacheAllRoles.has(testOrgId)).toBe(true);
	});

	it("should use cached roles when useMemoryCache is true and cache exists", async () => {
		const mockFindMany = vi.fn().mockResolvedValue([]);
		const ctx = createMockContext(mockFindMany);
		const options = createOptions();

		// First call to populate cache
		await hasPermission(
			{
				organizationId: testOrgId,
				role: "owner",
				options,
				permissions: { organization: ["delete"] },
				useMemoryCache: false,
			},
			ctx,
		);

		expect(mockFindMany).toHaveBeenCalledTimes(1);

		// Second call with useMemoryCache=true should use cache
		await hasPermission(
			{
				organizationId: testOrgId,
				role: "owner",
				options,
				permissions: { organization: ["delete"] },
				useMemoryCache: true,
			},
			ctx,
		);

		// Should not have called findMany again
		expect(mockFindMany).toHaveBeenCalledTimes(1);
	});

	it("should NOT pollute cache when useMemoryCache=true and cache is empty", async () => {
		const customRole = {
			role: "custom-manager",
			permission: JSON.stringify({ organization: ["update"] }),
			organizationId: testOrgId,
		};
		const mockFindMany = vi.fn().mockResolvedValue([customRole]);
		const ctx = createMockContext(mockFindMany);
		const options = createOptions();

		// First call with useMemoryCache=true when cache is empty
		// This should NOT update the cache with incomplete data
		await hasPermission(
			{
				organizationId: testOrgId,
				role: "owner",
				options,
				permissions: { organization: ["delete"] },
				useMemoryCache: true,
			},
			ctx,
		);

		// Cache should still be empty since we didn't fetch fresh data
		expect(cacheAllRoles.has(testOrgId)).toBe(false);
		// findMany should NOT have been called because useMemoryCache was true
		expect(mockFindMany).not.toHaveBeenCalled();
	});

	it("should correctly load and cache database roles after first useMemoryCache=true call", async () => {
		const customRole = {
			role: "custom-manager",
			permission: JSON.stringify({ organization: ["update"] }),
			organizationId: testOrgId,
		};
		const mockFindMany = vi.fn().mockResolvedValue([customRole]);
		const ctx = createMockContext(mockFindMany);
		const options = createOptions();

		// First call with useMemoryCache=true when cache is empty
		await hasPermission(
			{
				organizationId: testOrgId,
				role: "owner",
				options,
				permissions: { organization: ["delete"] },
				useMemoryCache: true,
			},
			ctx,
		);

		// Verify cache is still empty
		expect(cacheAllRoles.has(testOrgId)).toBe(false);

		// Second call with useMemoryCache=false should fetch from database
		await hasPermission(
			{
				organizationId: testOrgId,
				role: "custom-manager",
				options,
				permissions: { organization: ["update"] },
				useMemoryCache: false,
			},
			ctx,
		);

		// Now cache should be populated with the database roles
		expect(cacheAllRoles.has(testOrgId)).toBe(true);
		expect(mockFindMany).toHaveBeenCalledTimes(1);

		// The cached roles should include the custom-manager role
		const cachedRoles = cacheAllRoles.get(testOrgId);
		expect(cachedRoles).toBeDefined();
		expect("custom-manager" in cachedRoles!).toBe(true);
	});

	it("should check permission for dynamically loaded role", async () => {
		const customRole = {
			role: "custom-manager",
			permission: JSON.stringify({ organization: ["update"] }),
			organizationId: testOrgId,
		};
		const mockFindMany = vi.fn().mockResolvedValue([customRole]);
		const ctx = createMockContext(mockFindMany);
		const options = createOptions();

		// Check permission for the dynamically loaded role
		const result = await hasPermission(
			{
				organizationId: testOrgId,
				role: "custom-manager",
				options,
				permissions: { organization: ["update"] },
				useMemoryCache: false,
			},
			ctx,
		);

		expect(result).toBe(true);
	});

	it("should deny permission for dynamically loaded role without access", async () => {
		const customRole = {
			role: "custom-manager",
			permission: JSON.stringify({ organization: ["update"] }),
			organizationId: testOrgId,
		};
		const mockFindMany = vi.fn().mockResolvedValue([customRole]);
		const ctx = createMockContext(mockFindMany);
		const options = createOptions();

		// Check permission the custom role doesn't have
		const result = await hasPermission(
			{
				organizationId: testOrgId,
				role: "custom-manager",
				options,
				permissions: { organization: ["delete"] },
				useMemoryCache: false,
			},
			ctx,
		);

		expect(result).toBe(false);
	});

	it("should not override hardcoded roles with database roles", async () => {
		// Try to override 'owner' role from database
		const overrideRole = {
			role: "owner",
			permission: JSON.stringify({ organization: [] }), // Empty permissions
			organizationId: testOrgId,
		};
		const mockFindMany = vi.fn().mockResolvedValue([overrideRole]);
		const ctx = createMockContext(mockFindMany);
		const options = createOptions();

		// Owner should still have delete permission (hardcoded)
		const result = await hasPermission(
			{
				organizationId: testOrgId,
				role: "owner",
				options,
				permissions: { organization: ["delete"] },
				useMemoryCache: false,
			},
			ctx,
		);

		expect(result).toBe(true);
	});

	it("should use cached dynamic roles on subsequent useMemoryCache=true calls", async () => {
		const customRole = {
			role: "custom-manager",
			permission: JSON.stringify({ organization: ["update"] }),
			organizationId: testOrgId,
		};
		const mockFindMany = vi.fn().mockResolvedValue([customRole]);
		const ctx = createMockContext(mockFindMany);
		const options = createOptions();

		// First call to populate cache
		const result1 = await hasPermission(
			{
				organizationId: testOrgId,
				role: "custom-manager",
				options,
				permissions: { organization: ["update"] },
				useMemoryCache: false,
			},
			ctx,
		);

		expect(result1).toBe(true);
		expect(mockFindMany).toHaveBeenCalledTimes(1);

		// Second call using cache
		const result2 = await hasPermission(
			{
				organizationId: testOrgId,
				role: "custom-manager",
				options,
				permissions: { organization: ["update"] },
				useMemoryCache: true,
			},
			ctx,
		);

		expect(result2).toBe(true);
		// Should not have called findMany again
		expect(mockFindMany).toHaveBeenCalledTimes(1);
	});

	it("should skip database fetch when dynamicAccessControl addon is not present", async () => {
		const mockFindMany = vi.fn().mockResolvedValue([]);
		const ctx = createMockContext(mockFindMany);
		const options = createOptions({ use: [] }); // No addons

		await hasPermission(
			{
				organizationId: testOrgId,
				role: "owner",
				options,
				permissions: { organization: ["delete"] },
				useMemoryCache: false,
			},
			ctx,
		);

		// Should not have called findMany because dynamicAccessControl is not present
		expect(mockFindMany).not.toHaveBeenCalled();
	});
});
