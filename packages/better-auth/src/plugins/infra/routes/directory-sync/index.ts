import { createAuthEndpoint } from "better-auth/api";
import z from "zod";
import { jwtMiddleware } from "../../jwt";
import type { DashOptionsInternal } from "../../types";
import {
	countProviderUsers,
	createProvider,
	deleteProvider,
	findProviderById,
	findProvidersByOrganization,
	updateProviderToken,
} from "./adapter";
import {
	generateScimToken,
	getScimEndpoint,
	getStoreSCIMTokenOption,
} from "./scim-tokens";
import type {
	DirectorySyncConnection,
	DirectorySyncConnectionWithToken,
} from "./types";

export type {
	DirectorySyncConnection,
	DirectorySyncConnectionWithToken,
} from "./types";

export const listOrganizationDirectories = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/:id/directories",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
		},
		async (ctx) => {
			const scimPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "scim",
			);

			if (!scimPlugin) {
				return [];
			}

			try {
				const providers = await findProvidersByOrganization(
					ctx.context.adapter,
					ctx.params.id,
				);

				const directories: DirectorySyncConnection[] = await Promise.all(
					providers.map(async (provider) => ({
						id: provider.id,
						organizationId: provider.organizationId!,
						providerId: provider.providerId,
						scimEndpoint: getScimEndpoint(ctx.context.baseURL),
						userCount: await countProviderUsers(
							ctx.context.adapter,
							provider.providerId,
						),
					})),
				);

				return directories;
			} catch {
				return [];
			}
		},
	);
};

export const createOrganizationDirectory = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/directory/create",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
					}),
				),
			],
			body: z.object({
				providerId: z.string().min(1, "Provider ID is required"),
			}),
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;
			const scimPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "scim",
			);

			if (!scimPlugin) {
				throw ctx.error("BAD_REQUEST", {
					message: "SCIM plugin is not enabled",
				});
			}

			const providerId = ctx.body.providerId;

			if (providerId.includes(":")) {
				throw ctx.error("BAD_REQUEST", {
					message: "Provider ID cannot contain ':' character",
				});
			}

			const existingProvider = await findProviderById(
				ctx.context.adapter,
				providerId,
				organizationId,
			);

			if (existingProvider) {
				throw ctx.error("BAD_REQUEST", {
					message:
						"A directory with this provider ID already exists for this organization",
				});
			}

			const storageOption = getStoreSCIMTokenOption(scimPlugin);
			const { token: scimToken, storedToken } = await generateScimToken(
				providerId,
				organizationId,
				storageOption,
				ctx.context.secret,
			);

			const newProvider = await createProvider(ctx.context.adapter, {
				providerId,
				organizationId,
				scimToken: storedToken,
			});

			return {
				id: newProvider.id,
				organizationId,
				providerId,
				scimEndpoint: getScimEndpoint(ctx.context.baseURL),
				scimToken,
				userCount: 0,
			} satisfies DirectorySyncConnectionWithToken;
		},
	);
};

export const deleteOrganizationDirectory = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/directory/delete",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
					}),
				),
			],
			body: z.object({
				directoryId: z.string(),
			}),
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;

			const provider = await findProviderById(
				ctx.context.adapter,
				ctx.body.directoryId,
				organizationId,
			);

			if (!provider) {
				throw ctx.error("NOT_FOUND", {
					message: "Directory not found",
				});
			}

			await deleteProvider(ctx.context.adapter, ctx.body.directoryId);

			return { success: true };
		},
	);
};

export const regenerateDirectoryToken = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/directory/regenerate-token",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
					}),
				),
			],
			body: z.object({
				directoryId: z.string(),
			}),
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;

			const scimPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "scim",
			);

			if (!scimPlugin) {
				throw ctx.error("BAD_REQUEST", {
					message: "SCIM plugin is not enabled",
				});
			}

			const provider = await findProviderById(
				ctx.context.adapter,
				ctx.body.directoryId,
				organizationId,
			);

			if (!provider) {
				throw ctx.error("NOT_FOUND", {
					message: "Directory not found",
				});
			}

			const storageOption = getStoreSCIMTokenOption(scimPlugin);
			const { token: scimToken, storedToken } = await generateScimToken(
				provider.providerId,
				organizationId,
				storageOption,
				ctx.context.secret,
			);

			await updateProviderToken(ctx.context.adapter, provider.id, storedToken);

			return {
				success: true,
				scimToken,
				scimEndpoint: getScimEndpoint(ctx.context.baseURL),
			};
		},
	);
};

export const getDirectoryDetails = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/:orgId/directory/:directoryId",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
		},
		async (ctx) => {
			const scimPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "scim",
			);

			if (!scimPlugin) {
				throw ctx.error("BAD_REQUEST", {
					message: "SCIM plugin is not enabled",
				});
			}

			const provider = await findProviderById(
				ctx.context.adapter,
				ctx.params.directoryId,
				ctx.params.orgId,
			);

			if (!provider) {
				throw ctx.error("NOT_FOUND", {
					message: "Directory not found",
				});
			}

			return {
				id: provider.id,
				organizationId: provider.organizationId!,
				providerId: provider.providerId,
				scimEndpoint: getScimEndpoint(ctx.context.baseURL),
				userCount: await countProviderUsers(
					ctx.context.adapter,
					provider.providerId,
				),
			} satisfies DirectorySyncConnection;
		},
	);
};
