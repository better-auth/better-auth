import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { APIError } from "../../../api";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../db";
import { toZodSchema } from "../../../db";
import { orgSessionMiddleware } from "../call";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { hasPermission } from "../has-permission";
import {
	getReservedResourceNames,
	invalidateResourceCache,
	validateResourceName,
} from "../load-resources";
import type { Member, OrganizationResource, OrganizationRole } from "../schema";
import type { OrganizationOptions } from "../types";

const DEFAULT_MAXIMUM_RESOURCES_PER_ORGANIZATION = 50;

type IsExactlyEmptyObject<T> = keyof T extends never
	? T extends {}
		? {} extends T
			? true
			: false
		: false
	: false;

const getAdditionalFields = <
	O extends OrganizationOptions,
	AllPartial extends boolean = false,
>(
	options: O,
	shouldBePartial: AllPartial = false as AllPartial,
) => {
	let additionalFields =
		options?.schema?.organizationResource?.additionalFields || {};
	if (shouldBePartial) {
		for (const key in additionalFields) {
			additionalFields[key]!.required = false;
		}
	}
	const additionalFieldsSchema = toZodSchema({
		fields: additionalFields,
		isClientSide: true,
	});
	type AdditionalFields = AllPartial extends true
		? Partial<InferAdditionalFieldsFromPluginOptions<"organizationResource", O>>
		: InferAdditionalFieldsFromPluginOptions<"organizationResource", O>;
	type ReturnAdditionalFields = InferAdditionalFieldsFromPluginOptions<
		"organizationResource",
		O,
		false
	>;

	return {
		additionalFieldsSchema,
		$AdditionalFields: {} as AdditionalFields,
		$ReturnAdditionalFields: {} as ReturnAdditionalFields,
	};
};

const baseCreateResourceSchema = z.object({
	organizationId: z.string().optional().meta({
		description:
			"The id of the organization to create the resource in. If not provided, the user's active organization will be used.",
	}),
	resource: z.string().meta({
		description: "The name of the resource to create",
	}),
	permissions: z.array(z.string()).min(1).meta({
		description: "The permissions (actions) available for this resource",
	}),
});

export const createOrgResource = <O extends OrganizationOptions>(
	options: O,
) => {
	const { additionalFieldsSchema, $AdditionalFields, $ReturnAdditionalFields } =
		getAdditionalFields<O>(options, false);
	type AdditionalFields = typeof $AdditionalFields;
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;

	return createAuthEndpoint(
		"/organization/create-resource",
		{
			method: "POST",
			body: baseCreateResourceSchema.safeExtend({
				additionalFields: z
					.object({ ...additionalFieldsSchema.shape })
					.optional(),
			}),
			metadata: {
				$Infer: {
					body: {} as {
						organizationId?: string | undefined;
						resource: string;
						permissions: string[];
					} & (IsExactlyEmptyObject<AdditionalFields> extends true
						? { additionalFields?: {} | undefined }
						: { additionalFields: AdditionalFields }),
				},
			},
			requireHeaders: true,
			use: [orgSessionMiddleware],
		},
		async (ctx) => {
			const { session, user } = ctx.context.session;
			let resourceName = ctx.body.resource;
			const permissions = ctx.body.permissions;
			const additionalFields = ctx.body.additionalFields;

			// Get the organization id
			const organizationId =
				ctx.body.organizationId ?? session.activeOrganizationId;
			if (!organizationId) {
				ctx.context.logger.error(
					`[Dynamic Resources] The session is missing an active organization id to create a resource. Either set an active org id, or pass an organizationId in the request body.`,
				);
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE,
				});
			}

			// Check if the user is a member of the organization
			const member = await ctx.context.adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					{
						field: "userId",
						value: user.id,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (!member) {
				ctx.context.logger.error(
					`[Dynamic Resources] The user is not a member of the organization to create a resource.`,
					{
						userId: user.id,
						organizationId,
					},
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}

			// Check if user has permission to create resources
			const canCreateResource = await hasPermission(
				{
					options,
					organizationId,
					permissions: {
						ac: ["create"],
					},
					role: member.role,
				},
				ctx,
			);
			if (!canCreateResource) {
				ctx.context.logger.error(
					`[Dynamic Resources] The user is not permitted to create a resource.`,
					{
						userId: user.id,
						organizationId,
						role: member.role,
					},
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_RESOURCE,
				});
			}

			// Resource name is used as-is (no normalization)

			// Validate resource name
			const validation = validateResourceName(resourceName, options);
			if (!validation.valid) {
				ctx.context.logger.error(
					`[Dynamic Resources] Invalid resource name: ${resourceName}`,
					{
						resourceName,
						error: validation.error,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message:
						validation.error || ORGANIZATION_ERROR_CODES.INVALID_RESOURCE_NAME,
				});
			}

			// Validate permissions array
			if (!permissions || permissions.length === 0) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.INVALID_PERMISSIONS_ARRAY,
				});
			}

			// Check max resources limit
			const maximumResourcesPerOrganization =
				typeof options.dynamicAccessControl?.maximumResourcesPerOrganization ===
				"function"
					? await options.dynamicAccessControl.maximumResourcesPerOrganization(
							organizationId,
						)
					: (options.dynamicAccessControl?.maximumResourcesPerOrganization ??
						DEFAULT_MAXIMUM_RESOURCES_PER_ORGANIZATION);
			const resourcesInDB = await ctx.context.adapter.count({
				model: "organizationResource",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (resourcesInDB >= maximumResourcesPerOrganization) {
				ctx.context.logger.error(
					`[Dynamic Resources] Failed to create a new resource, the organization has too many resources. Maximum allowed resources is ${maximumResourcesPerOrganization}.`,
					{
						organizationId,
						maximumResourcesPerOrganization,
						resourcesInDB,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.TOO_MANY_RESOURCES,
				});
			}

			// Check if resource name is already taken
			const existingResource =
				await ctx.context.adapter.findOne<OrganizationResource>({
					model: "organizationResource",
					where: [
						{
							field: "organizationId",
							value: organizationId,
							operator: "eq",
							connector: "AND",
						},
						{
							field: "resource",
							value: resourceName,
							operator: "eq",
							connector: "AND",
						},
					],
				});
			if (existingResource) {
				ctx.context.logger.error(
					`[Dynamic Resources] The resource name "${resourceName}" is already taken.`,
					{
						resourceName,
						organizationId,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.RESOURCE_NAME_IS_ALREADY_TAKEN,
				});
			}

			// Create the resource
			const newResource = await ctx.context.adapter.create<
				Omit<OrganizationResource, "permissions"> & { permissions: string }
			>({
				model: "organizationResource",
				data: {
					createdAt: new Date(),
					organizationId,
					permissions: JSON.stringify(permissions),
					resource: resourceName,
					...additionalFields,
				},
			});

			// Invalidate cache
			invalidateResourceCache(organizationId);

			const data = {
				...newResource,
				permissions,
			} as OrganizationResource & ReturnAdditionalFields;

			return ctx.json({
				success: true,
				resource: data,
			});
		},
	);
};

const updateResourceBodySchema = z.object({
	organizationId: z.string().optional().meta({
		description:
			"The id of the organization. If not provided, the user's active organization will be used.",
	}),
	resource: z.string().meta({
		description: "The name of the resource to update",
	}),
	permissions: z.array(z.string()).min(1).meta({
		description: "The new permissions for this resource",
	}),
});

export const updateOrgResource = <O extends OrganizationOptions>(
	options: O,
) => {
	const { additionalFieldsSchema, $AdditionalFields, $ReturnAdditionalFields } =
		getAdditionalFields<O>(options, true);
	type AdditionalFields = typeof $AdditionalFields;
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;

	return createAuthEndpoint(
		"/organization/update-resource",
		{
			method: "POST",
			body: updateResourceBodySchema.safeExtend({
				additionalFields: z
					.object({ ...additionalFieldsSchema.shape })
					.optional(),
			}),
			requireHeaders: true,
			use: [orgSessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as {
						resource: string;
						permissions: string[];
						organizationId?: string | undefined;
					} & (IsExactlyEmptyObject<AdditionalFields> extends true
						? { additionalFields?: {} | undefined }
						: { additionalFields?: AdditionalFields }),
				},
			},
		},
		async (ctx) => {
			const { session, user } = ctx.context.session;

			const organizationId =
				ctx.body.organizationId ?? session.activeOrganizationId;
			if (!organizationId) {
				ctx.context.logger.error(
					`[Dynamic Resources] The session is missing an active organization id to update a resource.`,
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}

			// Check if the user is a member of the organization
			const member = await ctx.context.adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					{
						field: "userId",
						value: user.id,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (!member) {
				ctx.context.logger.error(
					`[Dynamic Resources] The user is not a member of the organization to update a resource.`,
					{
						userId: user.id,
						organizationId,
					},
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}

			// Check if user has permission to update resources
			const canUpdateResource = await hasPermission(
				{
					options,
					organizationId,
					permissions: {
						ac: ["update"],
					},
					role: member.role,
				},
				ctx,
			);
			if (!canUpdateResource) {
				ctx.context.logger.error(
					`[Dynamic Resources] The user is not permitted to update a resource.`,
					{
						userId: user.id,
						organizationId,
						role: member.role,
					},
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_RESOURCE,
				});
			}

			const resourceName = ctx.body.resource;
			const permissions = ctx.body.permissions;
			const additionalFields = ctx.body.additionalFields;

			// Check if resource is reserved (can't update reserved resources)
			const reservedNames = getReservedResourceNames(options);
			if (reservedNames.includes(resourceName)) {
				ctx.context.logger.error(
					`[Dynamic Resources] Cannot update reserved resource: ${resourceName}`,
					{
						resourceName,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.RESOURCE_NAME_IS_RESERVED,
				});
			}

			// Check if resource exists
			const existingResource =
				await ctx.context.adapter.findOne<OrganizationResource>({
					model: "organizationResource",
					where: [
						{
							field: "organizationId",
							value: organizationId,
							operator: "eq",
							connector: "AND",
						},
						{
							field: "resource",
							value: resourceName,
							operator: "eq",
							connector: "AND",
						},
					],
				});
			if (!existingResource) {
				ctx.context.logger.error(
					`[Dynamic Resources] The resource "${resourceName}" does not exist.`,
					{
						resourceName,
						organizationId,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.RESOURCE_NOT_FOUND,
				});
			}

			// Validate permissions array
			if (!permissions || permissions.length === 0) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.INVALID_PERMISSIONS_ARRAY,
				});
			}

			// Update the resource
			const updateData: Record<string, any> = {
				permissions: JSON.stringify(permissions),
				updatedAt: new Date(),
				...additionalFields,
			};

			await ctx.context.adapter.update<OrganizationResource>({
				model: "organizationResource",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					{
						field: "resource",
						value: resourceName,
						operator: "eq",
						connector: "AND",
					},
				],
				update: updateData,
			});

			// Invalidate cache
			invalidateResourceCache(organizationId);

			return ctx.json({
				success: true,
				resource: {
					...existingResource,
					...updateData,
					permissions,
				} as OrganizationResource & ReturnAdditionalFields,
			});
		},
	);
};

const deleteResourceBodySchema = z.object({
	organizationId: z.string().optional().meta({
		description:
			"The id of the organization. If not provided, the user's active organization will be used.",
	}),
	resource: z.string().meta({
		description: "The name of the resource to delete",
	}),
});

export const deleteOrgResource = <O extends OrganizationOptions>(
	options: O,
) => {
	return createAuthEndpoint(
		"/organization/delete-resource",
		{
			method: "POST",
			body: deleteResourceBodySchema,
			requireHeaders: true,
			use: [orgSessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as {
						resource: string;
						organizationId?: string | undefined;
					},
				},
			},
		},
		async (ctx) => {
			const { session, user } = ctx.context.session;

			const organizationId =
				ctx.body.organizationId ?? session.activeOrganizationId;
			if (!organizationId) {
				ctx.context.logger.error(
					`[Dynamic Resources] The session is missing an active organization id to delete a resource.`,
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}

			// Check if the user is a member of the organization
			const member = await ctx.context.adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					{
						field: "userId",
						value: user.id,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (!member) {
				ctx.context.logger.error(
					`[Dynamic Resources] The user is not a member of the organization to delete a resource.`,
					{
						userId: user.id,
						organizationId,
					},
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}

			// Check if user has permission to delete resources
			const canDeleteResource = await hasPermission(
				{
					options,
					organizationId,
					permissions: {
						ac: ["delete"],
					},
					role: member.role,
				},
				ctx,
			);
			if (!canDeleteResource) {
				ctx.context.logger.error(
					`[Dynamic Resources] The user is not permitted to delete a resource.`,
					{
						userId: user.id,
						organizationId,
						role: member.role,
					},
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_A_RESOURCE,
				});
			}

			const resourceName = ctx.body.resource;

			// Check if resource is reserved (can't delete reserved resources)
			const reservedNames = getReservedResourceNames(options);
			if (reservedNames.includes(resourceName)) {
				ctx.context.logger.error(
					`[Dynamic Resources] Cannot delete reserved resource: ${resourceName}`,
					{
						resourceName,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.RESOURCE_NAME_IS_RESERVED,
				});
			}

			// Check if resource exists
			const existingResource =
				await ctx.context.adapter.findOne<OrganizationResource>({
					model: "organizationResource",
					where: [
						{
							field: "organizationId",
							value: organizationId,
							operator: "eq",
							connector: "AND",
						},
						{
							field: "resource",
							value: resourceName,
							operator: "eq",
							connector: "AND",
						},
					],
				});
			if (!existingResource) {
				ctx.context.logger.error(
					`[Dynamic Resources] The resource "${resourceName}" does not exist.`,
					{
						resourceName,
						organizationId,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.RESOURCE_NOT_FOUND,
				});
			}

			// Check if resource is being used by any roles
			const rolesUsingResource = await ctx.context.adapter.findMany<
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

			const rolesWithResource = rolesUsingResource.filter((role) => {
				const permissions = JSON.parse(role.permission);
				return resourceName in permissions;
			});

			if (rolesWithResource.length > 0) {
				ctx.context.logger.error(
					`[Dynamic Resources] Cannot delete resource "${resourceName}" because it is being used by ${rolesWithResource.length} role(s).`,
					{
						resourceName,
						organizationId,
						rolesUsingResource: rolesWithResource.map((r) => r.role),
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.RESOURCE_IS_IN_USE,
				});
			}

			// Delete the resource
			await ctx.context.adapter.delete({
				model: "organizationResource",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					{
						field: "resource",
						value: resourceName,
						operator: "eq",
						connector: "AND",
					},
				],
			});

			// Invalidate cache
			invalidateResourceCache(organizationId);

			return ctx.json({
				success: true,
			});
		},
	);
};

const listResourcesQuerySchema = z
	.object({
		organizationId: z.string().optional().meta({
			description:
				"The id of the organization to list resources for. If not provided, the user's active organization will be used.",
		}),
	})
	.optional();

export const listOrgResources = <O extends OrganizationOptions>(options: O) => {
	const { $ReturnAdditionalFields } = getAdditionalFields<O>(options, false);
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;

	return createAuthEndpoint(
		"/organization/list-resources",
		{
			method: "GET",
			query: listResourcesQuerySchema,
			requireHeaders: true,
			use: [orgSessionMiddleware],
			metadata: {
				$Infer: {
					query: {} as {
						organizationId?: string | undefined;
					},
				},
			},
		},
		async (ctx) => {
			const { session, user } = ctx.context.session;

			const organizationId =
				ctx.query?.organizationId ?? session.activeOrganizationId;
			if (!organizationId) {
				ctx.context.logger.error(
					`[Dynamic Resources] The session is missing an active organization id to list resources.`,
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}

			// Check if the user is a member of the organization
			const member = await ctx.context.adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					{
						field: "userId",
						value: user.id,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (!member) {
				ctx.context.logger.error(
					`[Dynamic Resources] The user is not a member of the organization to list resources.`,
					{
						userId: user.id,
						organizationId,
					},
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}

			// Check if user has permission to read resources
			const canReadResources = await hasPermission(
				{
					options,
					organizationId,
					permissions: {
						ac: ["read"],
					},
					role: member.role,
				},
				ctx,
			);
			if (!canReadResources) {
				ctx.context.logger.error(
					`[Dynamic Resources] The user is not permitted to list resources.`,
					{
						userId: user.id,
						organizationId,
						role: member.role,
					},
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_RESOURCES,
				});
			}

			// Get default resources from AC
			const defaultResources = options.ac?.statements || {};
			const defaultResourceList = Object.entries(defaultResources).map(
				([resource, permissions]) => ({
					resource,
					permissions: permissions as string[],
					isCustom: false,
					isProtected: true,
				}),
			);

			// Get custom resources from database
			const customResources = await ctx.context.adapter.findMany<
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

			const customResourceList = customResources.map((r) => ({
				...r,
				permissions: JSON.parse(r.permissions) as string[],
				isCustom: true,
				isProtected: false,
			})) as (OrganizationResource &
				ReturnAdditionalFields & {
					isCustom: boolean;
					isProtected: boolean;
				})[];

			return ctx.json({
				resources: [...defaultResourceList, ...customResourceList],
			});
		},
	);
};

const getResourceQuerySchema = z.object({
	organizationId: z.string().optional().meta({
		description:
			"The id of the organization. If not provided, the user's active organization will be used.",
	}),
	resource: z.string().meta({
		description: "The name of the resource to get",
	}),
});

export const getOrgResource = <O extends OrganizationOptions>(options: O) => {
	const { $ReturnAdditionalFields } = getAdditionalFields<O>(options, false);
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;

	return createAuthEndpoint(
		"/organization/get-resource",
		{
			method: "GET",
			query: getResourceQuerySchema,
			requireHeaders: true,
			use: [orgSessionMiddleware],
			metadata: {
				$Infer: {
					query: {} as {
						resource: string;
						organizationId?: string | undefined;
					},
				},
			},
		},
		async (ctx) => {
			const { session, user } = ctx.context.session;

			const organizationId =
				ctx.query.organizationId ?? session.activeOrganizationId;
			if (!organizationId) {
				ctx.context.logger.error(
					`[Dynamic Resources] The session is missing an active organization id to get a resource.`,
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}

			// Check if the user is a member of the organization
			const member = await ctx.context.adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					{
						field: "userId",
						value: user.id,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (!member) {
				ctx.context.logger.error(
					`[Dynamic Resources] The user is not a member of the organization to get a resource.`,
					{
						userId: user.id,
						organizationId,
					},
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}

			// Check if user has permission to read resources
			const canReadResource = await hasPermission(
				{
					options,
					organizationId,
					permissions: {
						ac: ["read"],
					},
					role: member.role,
				},
				ctx,
			);
			if (!canReadResource) {
				ctx.context.logger.error(
					`[Dynamic Resources] The user is not permitted to read a resource.`,
					{
						userId: user.id,
						organizationId,
						role: member.role,
					},
				);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_READ_A_RESOURCE,
				});
			}

			const resourceName = ctx.query.resource;

			// Check if it's a default resource
			const defaultResources = options.ac?.statements || {};
			if (resourceName in defaultResources) {
				return ctx.json({
					resource: {
						resource: resourceName,
						permissions: defaultResources[
							resourceName as keyof typeof defaultResources
						] as string[],
						isCustom: false,
						isProtected: true,
					},
				});
			}

			// Look for custom resource
			const customResource =
				await ctx.context.adapter.findOne<OrganizationResource>({
					model: "organizationResource",
					where: [
						{
							field: "organizationId",
							value: organizationId,
							operator: "eq",
							connector: "AND",
						},
						{
							field: "resource",
							value: resourceName,
							operator: "eq",
							connector: "AND",
						},
					],
				});

			if (!customResource) {
				ctx.context.logger.error(
					`[Dynamic Resources] The resource "${resourceName}" does not exist.`,
					{
						resourceName,
						organizationId,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.RESOURCE_NOT_FOUND,
				});
			}

			return ctx.json({
				resource: {
					...customResource,
					permissions: JSON.parse(
						customResource.permissions as never as string,
					) as string[],
					isCustom: true,
					isProtected: false,
				} as OrganizationResource &
					ReturnAdditionalFields & {
						isCustom: boolean;
						isProtected: boolean;
					},
			});
		},
	);
};
