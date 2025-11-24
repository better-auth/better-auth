import { describe, expect, expectTypeOf, it } from "vitest";
import { memoryAdapter } from "../../adapters/memory-adapter";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { assets } from "./assets";
import { assetsClient } from "./client";
import { ASSET_ERROR_CODES } from "./error-codes";
import type { InferAsset, InferAssetType } from "./schema";
import type { AssetOptions } from "./types";
import { organization } from "../organization";
import { organizationClient } from "../organization/client";

describe("assets type", () => {
	it("empty asset type should work", () => {
		expectTypeOf({} satisfies AssetOptions);
		expectTypeOf({ schema: {} } satisfies AssetOptions);
	});
});

describe("assets", async (it) => {
	const { auth, signInWithTestUser, cookieSetter } = await getTestInstance({
		user: {
			modelName: "users",
		},
		plugins: [
			organization(),
			assets({
				schema: {
					assetType: {
						modelName: "asset_types",
					},
					asset: {
						modelName: "assets",
					},
				},
			}),
		],
		logger: {
			level: "error",
		},
	});

	const { headers } = await signInWithTestUser();

	const org = await auth.api.createOrganization({
		body: {
			name: "Test Org",
			slug: "test-org",
		},
		headers,
	});

	const client = createAuthClient({
		plugins: [organizationClient(), assetsClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	it("should have correct schema order", () => {
		const assetPlugin = assets({});

		const schema = assetPlugin.schema;

		// Check that assetType table is defined before assetRole table
		const assetTypeIndex = Object.keys(schema).indexOf("assetType");
		const assetRoleIndex = Object.keys(schema).indexOf("assetRole");

		expect(assetTypeIndex).toBeLessThan(assetRoleIndex);
		expect(assetTypeIndex).not.toBe(-1);
		expect(assetRoleIndex).not.toBe(-1);
	});

	let assetTypeId: string;
	let globalAssetTypeId: string;
	let assetId: string;
	let assetRoleId: string;

	// Asset Type Tests
	it("should create organization-scoped asset type", async () => {
		console.log("headers", headers);
		const assetType = await client.assets.createAssetType({
			name: "Project",
			description: "A project asset type",
			scope: "organization",
			organizationId: undefined, // Will use active org from session
			metadata: {
				custom: "value",
			},
			fetchOptions: {
				headers,
			},
		});

		console.log(assetType);
		console.log(assetType.data?.metadata);
		expect(assetType.data?.name).toBe("Project");
		expect(assetType.data?.description).toBe("A project asset type");
		expect(assetType.data?.scope).toBe("organization");
		const metadata = assetType.data?.metadata as
			| Record<string, unknown>
			| undefined;
		expect(metadata?.custom).toBe("value");
		assetTypeId = assetType.data?.id as string;
	});

	it("should fail to create organization asset type without organizationId", async () => {
		const { headers: newHeaders } = await signInWithTestUser();
		// Clear active organization from session
		await auth.api.setActiveOrganization({
			body: {
				organizationId: null,
			},
			headers: newHeaders,
		});

		const assetType = await client.assets.createAssetType({
			name: "Project2",
			scope: "organization",
			fetchOptions: {
				headers: newHeaders,
			},
		});

		expect(assetType.error?.status).toBe(400);
		expect(assetType.error?.message).toBe(
			ASSET_ERROR_CODES.ORGANIZATION_REQUIRED,
		);
	});

	it("should create global asset type", async () => {
		const assetType = await client.assets.createAssetType({
			name: "Document",
			description: "A global document type",
			scope: "global",
			fetchOptions: {
				headers,
			},
		});

		console.log(assetType);

		expect(assetType.data?.name).toBe("Document");
		expect(assetType.data?.scope).toBe("global");
		expect(assetType.data?.organizationId).toBeNull();
		globalAssetTypeId = assetType.data?.id as string;
	});

	it("should list asset types for organization", async () => {
		const assetTypes = await client.assets.listAssetTypes({
			query: {
				organizationId: undefined, // Will use active org
			},
			fetchOptions: {
				headers,
			},
		});

		console.log(assetTypes.data?.length);

		expect(assetTypes.data?.length).toBeGreaterThan(0);
		// Should include both org-scoped and global types
		const hasOrgType = assetTypes.data?.some(
			(at) => at.scope === "organization",
		);

		const hasGlobalType = assetTypes.data?.some((at) => at.scope === "global");
		expect(hasOrgType).toBe(true);
		expect(hasGlobalType).toBe(true);
	});

	it("should list only global asset types", async () => {
		const assetTypes = await client.assets.listAssetTypes({
			query: {
				scope: "global",
			},
			fetchOptions: {
				headers,
			},
		});

		expect(assetTypes.data?.length).toBeGreaterThan(0);
		expect(assetTypes.data?.every((at) => at.scope === "global")).toBe(true);
	});

	it("should update asset type", async () => {
		const updated = await client.assets.updateAssetType({
			id: assetTypeId,
			data: {
				name: "Updated Project",
				description: "Updated description",
			},
			fetchOptions: {
				headers,
			},
		});

		console.log(updated);

		expect(updated.data?.name).toBe("Updated Project");
		expect(updated.data?.description).toBe("Updated description");
	});

	it("should fail to update non-existent asset type", async () => {
		const updated = await client.assets.updateAssetType({
			id: "non-existent-id",
			data: {
				name: "Test",
			},
			fetchOptions: {
				headers,
			},
		});

		expect(updated.error?.status).toBe(404);
		expect(updated.error?.message).toBe(ASSET_ERROR_CODES.ASSET_TYPE_NOT_FOUND);
	});

	// Asset Role Tests
	it("should create asset role for asset type", async () => {
		const role = await client.assets.createAssetRole({
			assetTypeId,
			type: "manager",
			name: "Manager",
			description: "Can manage assets",
			permissions: {
				asset: {
					manage: true,
					view: true,
				},
			},
			fetchOptions: {
				headers,
			},
		});

		expect(role.data?.type).toBe("manager");
		expect(role.data?.name).toBe("Manager");
		// expect(role.data?.permissions?.asset?.manage).toBe(true);
		assetRoleId = role.data?.id as string;
	});

	it("should list asset roles for asset type", async () => {
		const roles = await client.assets.listAssetRoles({
			query: {
				assetTypeId: assetTypeId,
			},
			fetchOptions: {
				headers,
			},
		});

		expect(roles.data?.length).toBeGreaterThan(0);
		expect(roles.data?.some((r) => r.type === "manager")).toBe(true);
	});

	it("should update asset role", async () => {
		const updated = await client.assets.updateAssetRole({
			id: assetRoleId,
			data: {
				name: "Updated Manager",
				description: "Updated description",
			},
			fetchOptions: {
				headers,
			},
		});

		expect(updated.data?.name).toBe("Updated Manager");
		expect(updated.data?.description).toBe("Updated description");
	});

	// Asset Tests
	it("should create asset", async () => {
		const asset = await client.assets.create({
			name: "My Project",
			assetTypeId,
			metadata: {
				custom: "value",
			},
			fetchOptions: {
				headers,
			},
		});

		expect(asset.data?.name).toBe("My Project");
		expect(asset.data?.assetTypeId).toBe(assetTypeId);
		expect(asset.data?.metadata?.custom).toBe("value");
		assetId = asset.data?.id as string;
	});

	it("should get asset by id", async () => {
		const asset = await client.assets.get({
			query: {
				id: assetId,
			},
			fetchOptions: {
				headers,
			},
		});

		expect(asset.data?.id).toBe(assetId);
		expect(asset.data?.name).toBe("My Project");
	});

	it("should fail to get non-existent asset", async () => {
		const asset = await client.assets.get({
			query: {
				id: "non-existent-id",
			},
			fetchOptions: {
				headers,
			},
		});

		expect(asset.error?.status).toBe(404);
		expect(asset.error?.message).toBe(ASSET_ERROR_CODES.ASSET_NOT_FOUND);
	});

	it("should list assets", async () => {
		const assets = await client.assets.list({
			query: {},
			fetchOptions: {
				headers,
			},
		});

		expect(assets.data?.length).toBeGreaterThan(0);
		expect(assets.data?.some((a) => a.id === assetId)).toBe(true);
	});

	it("should list assets filtered by asset type", async () => {
		const assets = await client.assets.list({
			query: {
				assetTypeId,
			},
			fetchOptions: {
				headers,
			},
		});

		expect(assets.data?.length).toBeGreaterThan(0);
		expect(assets.data?.every((a) => a.assetTypeId === assetTypeId)).toBe(true);
	});

	it("should update asset", async () => {
		const updated = await client.assets.update({
			id: assetId,
			data: {
				name: "Updated Project Name",
				metadata: {
					updated: true,
				},
			},
			fetchOptions: {
				headers,
			},
		});

		console.log(updated.data?.metadata);

		expect(updated.data?.name).toBe("Updated Project Name");
		expect(updated.data?.metadata?.updated).toBe(true);
	});

	it("should fail to update non-existent asset", async () => {
		const updated = await client.assets.update({
			id: "non-existent-id",
			data: {
				name: "Test",
			},
			fetchOptions: {
				headers,
			},
		});

		expect(updated.error?.status).toBe(404);
		expect(updated.error?.message).toBe(ASSET_ERROR_CODES.ASSET_NOT_FOUND);
	});

	// Member Asset Role Tests
	it("should assign asset roles to user (without org plugin)", async () => {
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		const assigned = await client.assets.assignRoles({
			assetId,
			userId: session.data?.session.userId as string,
			roles: ["manager"],
			fetchOptions: {
				headers,
			},
		});

		expect(assigned.data?.success).toBe(true);
	});

	it("should fail to assign invalid role", async () => {
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		const assigned = await client.assets.assignRoles({
			assetId,
			userId: session.data?.session.userId as string,
			roles: ["invalid-role"],
			fetchOptions: {
				headers,
			},
		});

		expect(assigned.error?.status).toBe(400);
	});

	it("should get asset members", async () => {
		const members = await client.assets.getMembers({
			query: {
				assetId,
			},
			fetchOptions: {
				headers,
			},
		});

		expect(members.data?.length).toBeGreaterThan(0);
	});

	it("should remove asset roles from user", async () => {
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		const removed = await client.assets.removeRoles({
			assetId,
			userId: session.data?.session.userId as string,
			roles: ["manager"],
			fetchOptions: {
				headers,
			},
		});

		expect(removed.data?.success).toBe(true);
	});

	it("should fail to assign roles with both memberId and userId", async () => {
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		const assigned = await client.assets.assignRoles({
			assetId,
			memberId: "some-member-id",
			userId: session.data?.session.userId as string,
			roles: ["manager"],
			fetchOptions: {
				headers,
			},
		});

		expect(assigned.error?.status).toBe(400);
	});

	it("should fail to assign roles without memberId or userId", async () => {
		const assigned = await client.assets.assignRoles({
			assetId,
			roles: ["manager"],
			fetchOptions: {
				headers,
			},
		});

		expect(assigned.error?.status).toBe(400);
	});

	it("should delete asset", async () => {
		const deleted = await client.assets.delete({
			id: assetId,
			fetchOptions: {
				headers,
			},
		});

		expect(deleted.data?.success).toBe(true);

		// Verify asset is deleted
		const asset = await client.assets.get({
			query: {
				id: assetId,
			},
			fetchOptions: {
				headers,
			},
		});

		expect(asset.error?.status).toBe(404);
	});

	it("should fail to delete asset type with associated assets", async () => {
		// Create a new asset
		const newAsset = await client.assets.create({
			name: "Test Asset",
			assetTypeId,
			fetchOptions: {
				headers,
			},
		});

		// Try to delete the asset type
		const deleted = await client.assets.deleteAssetType({
			id: assetTypeId,
			fetchOptions: {
				headers,
			},
		});

		expect(deleted.error?.status).toBe(400);
		expect(deleted.error?.message).toContain("associated assets");

		// Clean up
		await client.assets.delete({
			id: newAsset.data?.id as string,
			fetchOptions: {
				headers,
			},
		});
	});

	it("should delete asset type after removing all assets", async () => {
		// Create and delete an asset
		const tempAsset = await client.assets.create({
			name: "Temp Asset",
			assetTypeId: globalAssetTypeId,
			fetchOptions: {
				headers,
			},
		});

		await client.assets.delete({
			id: tempAsset.data?.id as string,
			fetchOptions: {
				headers,
			},
		});

		// Now delete the asset type
		const deleted = await client.assets.deleteAssetType({
			id: globalAssetTypeId,
			fetchOptions: {
				headers,
			},
		});

		expect(deleted.data?.success).toBe(true);
	});

	it("should fail to delete asset role with assignments", async () => {
		// Create asset and assign role
		const testAsset = await client.assets.create({
			name: "Test Asset for Role",
			assetTypeId,
			fetchOptions: {
				headers,
			},
		});

		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		await client.assets.assignRoles({
			assetId: testAsset.data?.id as string,
			userId: session.data?.session.userId as string,
			roles: ["manager"],
			fetchOptions: {
				headers,
			},
		});

		// Try to delete the role
		const deleted = await client.assets.deleteAssetRole({
			id: assetRoleId,
			fetchOptions: {
				headers,
			},
		});

		expect(deleted.error?.status).toBe(400);
		expect(deleted.error?.message).toContain("assignments");

		// Clean up
		await client.assets.removeRoles({
			assetId: testAsset.data?.id as string,
			userId: session.data?.session.userId as string,
			roles: ["manager"],
			fetchOptions: {
				headers,
			},
		});

		await client.assets.delete({
			id: testAsset.data?.id as string,
			fetchOptions: {
				headers,
			},
		});
	});

	it("should have server side methods", async () => {
		expectTypeOf(auth.api.createAssetType).toBeFunction();
		expectTypeOf(auth.api.create).toBeFunction();
		expectTypeOf(auth.api.createAssetRole).toBeFunction();
	});

	it("should create asset type on server directly", async () => {
		const assetType = await auth.api.createAssetType({
			body: {
				name: "Server Project",
				scope: "global",
			},
			headers,
		});

		expect(assetType?.name).toBe("Server Project");
		expect(assetType?.scope).toBe("global");
	});

	it("should create asset on server directly", async () => {
		const asset = await auth.api.create({
			body: {
				name: "Server Asset",
				assetTypeId,
			},
			headers,
		});

		expect(asset?.name).toBe("Server Asset");
		expect(asset?.assetTypeId).toBe(assetTypeId);
	});
});

describe("assets with organization plugin", async (it) => {
	const { organization } = await import("../organization/organization");
	const { organizationClient } = await import("../organization/client");

	const { auth, signInWithTestUser } = await getTestInstance({
		user: {
			modelName: "users",
		},
		plugins: [
			organization({
				teams: { enabled: true },
			}),
			assets({}),
		],
		logger: {
			level: "error",
		},
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [organizationClient(), assetsClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	let organizationId: string;
	let assetTypeId: string;
	let assetId: string;
	let memberId: string;
	let shareId: string;

	it("should create organization and asset type", async () => {
		const org = await client.organization.create({
			name: "Test Org",
			slug: "test-org",
			fetchOptions: {
				headers,
			},
		});

		organizationId = org.data?.id as string;

		const assetType = await client.assets.createAssetType({
			name: "Org Project",
			scope: "organization",
			organizationId,
			fetchOptions: {
				headers,
			},
		});

		expect(assetType.data?.organizationId).toBe(organizationId);
		assetTypeId = assetType.data?.id as string;
	});

	it("should create asset with organization", async () => {
		const asset = await client.assets.create({
			name: "Org Asset",
			assetTypeId,
			organizationId,
			fetchOptions: {
				headers,
			},
		});

		expect(asset.data?.organizationId).toBe(organizationId);
		assetId = asset.data?.id as string;
	});

	it("should assign asset roles using memberId", async () => {
		const org = await client.organization.getFullOrganization({
			query: {
				organizationId,
			},
			fetchOptions: {
				headers,
			},
		});

		memberId = org.data?.members[0]?.id as string;

		// Create asset role first
		const role = await client.assets.createAssetRole({
			assetTypeId,
			type: "editor",
			name: "Editor",
			fetchOptions: {
				headers,
			},
		});

		const assigned = await client.assets.assignRoles({
			assetId,
			memberId,
			roles: ["editor"],
			fetchOptions: {
				headers,
			},
		});

		expect(assigned.data?.success).toBe(true);
	});

	it("should list assets for organization", async () => {
		const assets = await client.assets.list({
			query: {
				organizationId,
			},
			fetchOptions: {
				headers,
			},
		});

		expect(assets.data?.length).toBeGreaterThan(0);
		expect(assets.data?.every((a) => a.organizationId === organizationId)).toBe(
			true,
		);
	});

	it("should get asset members with member information", async () => {
		const members = await client.assets.getMembers({
			query: { assetId },
			fetchOptions: {
				headers,
			},
		});

		expect(members.data?.length).toBeGreaterThan(0);
		expect(members.data?.some((m) => m.memberId === memberId)).toBe(true);
	});

	it("should share asset with member", async () => {
		await client.assets.createAssetRole({
			assetTypeId,
			type: "viewer-share",
			name: "Viewer (Shared)",
			fetchOptions: {
				headers,
			},
		});

		const share = await client.assets.share({
			assetId,
			grantType: "member",
			memberId,
			role: "viewer-share",
			fetchOptions: {
				headers,
			},
		});

		expect(share.data?.grantType).toBe("member");
		expect(share.data?.role).toBe("viewer-share");
		shareId = share.data?.id as string;

		const members = await client.assets.getMembers({
			query: { assetId },
			fetchOptions: {
				headers,
			},
		});

		expect(
			members.data?.some(
				(member) =>
					member.memberId === memberId && member.role === "viewer-share",
			),
		).toBe(true);
	});

	it("should list asset shares", async () => {
		const shares = await client.assets.listShares({
			query: { assetId },
			fetchOptions: {
				headers,
			},
		});

		expect(shares.data?.some((share) => share.id === shareId)).toBe(true);
	});

	it("should revoke asset share and remove granted role", async () => {
		const revoked = await client.assets.revokeShare({
			id: shareId,
			fetchOptions: {
				headers,
			},
		});

		expect(revoked.data?.success).toBe(true);

		const shares = await client.assets.listShares({
			query: { assetId },
			fetchOptions: {
				headers,
			},
		});

		const revokedShare = shares.data?.find((share) => share.id === shareId);
		expect(revokedShare?.status).toBe("revoked");

		const members = await client.assets.getMembers({
			query: { assetId },
			fetchOptions: {
				headers,
			},
		});

		expect(
			members.data?.some(
				(member) =>
					member.memberId === memberId && member.role === "viewer-share",
			),
		).toBe(false);
	});
});

describe("assets with default asset types", async (it) => {
	const { auth, signInWithTestUser } = await getTestInstance({
		user: {
			modelName: "users",
		},
		plugins: [
			organization(),
			assets({
				defaultAssetTypes: [
					{
						name: "Project",
						description: "A project",
						scope: "global",
						source: "app:project-manager",
						builtInRoles: [
							{
								type: "manager",
								name: "Manager",
								description: "Can manage projects",
								permissions: {
									asset: {
										manage: true,
									},
								},
							},
							{
								type: "viewer",
								name: "Viewer",
								description: "Can view projects",
								permissions: {
									asset: {
										view: true,
									},
								},
							},
						],
					},
				],
			}),
		],
		logger: {
			level: "error",
		},
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [organizationClient(), assetsClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	it("should list default asset types", async () => {
		const assetTypes = await client.assets.listAssetTypes({
			query: {
				scope: "global",
			},
			fetchOptions: {
				headers,
			},
		});

		const projectType = assetTypes.data?.find((at) => at.name === "Project");
		expect(projectType).toBeDefined();
		expect(projectType?.source).toBe("app:project-manager");
		expect(projectType?.isBuiltIn).toBe(true);
	});

	it("should have built-in roles for default asset types", async () => {
		const assetTypes = await client.assets.listAssetTypes({
			query: {
				scope: "global",
			},
			fetchOptions: {
				headers,
			},
		});

		const projectType = assetTypes.data?.find((at) => at.name === "Project");
		if (!projectType) throw new Error("Project type not found");

		const roles = await client.assets.listAssetRoles({
			query: {
				assetTypeId: projectType.id,
			},
			fetchOptions: {
				headers,
			},
		});

		expect(roles.data?.length).toBeGreaterThanOrEqual(2);
		expect(roles.data?.some((r) => r.type === "manager")).toBe(true);
		expect(roles.data?.some((r) => r.type === "viewer")).toBe(true);
	});
});

describe("assets types", async (it) => {
	const { auth } = await getTestInstance({
		plugins: [assets({})],
	});

	it("should infer asset types", async () => {
		type Asset = typeof auth.$Infer.Asset;
		type AssetType = typeof auth.$Infer.AssetType;
		type AssetRole = typeof auth.$Infer.AssetRole;

		expectTypeOf<Asset>().not.toBeNever();
		expectTypeOf<AssetType>().not.toBeNever();
		expectTypeOf<AssetRole>().not.toBeNever();
	});
});

describe("assets with additional fields", async () => {
	const db = {
		users: [],
		sessions: [],
		account: [],
		assetType: [] as {
			id: string;
			assetTypeRequiredField: string;
			assetTypeOptionalField?: string | undefined;
		}[],
		asset: [] as {
			id: string;
			assetRequiredField: string;
			assetOptionalField?: string | undefined;
		}[],
		assetRole: [],
		memberAssetRole: [],
	};

	const assetOptions = {
		schema: {
			assetType: {
				additionalFields: {
					assetTypeRequiredField: {
						type: "string",
						required: true,
					},
					assetTypeOptionalField: {
						type: "string",
						required: false,
					},
				},
			},
			asset: {
				additionalFields: {
					assetRequiredField: {
						type: "string",
						required: true,
					},
					assetOptionalField: {
						type: "string",
						required: false,
					},
				},
			},
		},
	} satisfies AssetOptions;

	const { auth, signInWithTestUser } = await getTestInstance({
		database: memoryAdapter(db, {
			debugLogs: false,
		}),
		user: {
			modelName: "users",
		},
		plugins: [assets(assetOptions)],
		logger: {
			level: "error",
		},
	});

	const { headers } = await signInWithTestUser();

	const client = createAuthClient({
		plugins: [assetsClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	let assetType: InferAssetType<typeof assetOptions, false>;
	let asset: InferAsset<typeof assetOptions, false>;

	it("create asset type with additional fields", async () => {
		const assetTypeRes = await auth.api.createAssetType({
			body: {
				name: "Test Type",
				scope: "global",
				assetTypeRequiredField: "required-value",
				assetTypeOptionalField: "optional-value",
			},
			headers,
		});

		expect(assetTypeRes).not.toBeNull();
		if (!assetTypeRes) throw new Error("Asset type is null");
		assetType = assetTypeRes;
		expect(assetType.assetTypeRequiredField).toBe("required-value");
		expect(assetType.assetTypeOptionalField).toBe("optional-value");
	});

	it("create asset with additional fields", async () => {
		const assetRes = await auth.api.create({
			body: {
				name: "Test Asset",
				assetTypeId: assetType.id,
				assetRequiredField: "required-value",
				assetOptionalField: "optional-value",
			},
			headers,
		});

		expect(assetRes).not.toBeNull();
		if (!assetRes) throw new Error("Asset is null");
		asset = assetRes;
		expect(asset.assetRequiredField).toBe("required-value");
		expect(asset.assetOptionalField).toBe("optional-value");
	});

	it("list assets with additional fields", async () => {
		const assets = await auth.api.list({
			query: {},
			headers,
		});

		expect(assets?.length).toBeGreaterThan(0);
		expect(assets?.[0]?.assetRequiredField).toBe("required-value");
		expect(assets?.[0]?.assetOptionalField).toBe("optional-value");
	});

	it("update asset with additional optional fields", async () => {
		const updated = await auth.api.update({
			body: {
				data: {
					assetOptionalField: "updated-optional-2",
				},
				id: asset.id,
			},
			headers,
		});

		expect(updated?.assetOptionalField).toBe("updated-optional-2");
	});

	// it("update asset with additional required fields", async () => {
	// 	const updated = await auth.api.update({
	// 		body: {
	// 			data: {
	// 				assetRequiredField: "updated-required",
	// 			},
	// 			id: asset.id,
	// 		},
	// 		headers,
	// 	});

	// 	expect(updated?.assetRequiredField).toBe("updated-required");
	// });

	// it("update asset with all additional fields", async () => {
	// 	const updated = await auth.api.update({
	// 		body: {
	// 			data: {
	// 				assetOptionalField: "updated-all",
	// 				assetRequiredField: "updated-all",
	// 			},
	// 			id: asset.id,
	// 		},
	// 		headers,
	// 	});

	// 	expect(updated?.assetOptionalField).toBe("updated-all");
	// 	expect(updated?.assetRequiredField).toBe("updated-all");
	// });
});
