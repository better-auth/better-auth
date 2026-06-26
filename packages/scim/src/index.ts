import type { BetterAuthPlugin } from "better-auth";
import { BetterAuthError } from "better-auth";
import { authMiddlewareFactory } from "./middlewares";
import {
	createSCIMGroup,
	createSCIMUser,
	deleteSCIMGroup,
	deleteSCIMProviderConnection,
	deleteSCIMUser,
	generateSCIMToken,
	getSCIMGroup,
	getSCIMProviderConnection,
	getSCIMResourceType,
	getSCIMResourceTypes,
	getSCIMSchema,
	getSCIMSchemas,
	getSCIMServiceProviderConfig,
	getSCIMUser,
	listSCIMGroups,
	listSCIMProviderConnections,
	listSCIMUsers,
	patchSCIMGroup,
	patchSCIMUser,
	updateSCIMGroup,
	updateSCIMUser,
} from "./routes";
import type { SCIMOptions } from "./types";
import { PACKAGE_VERSION } from "./version";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		scim: {
			creator: typeof scim;
		};
	}
}

export const scim = (options?: SCIMOptions) => {
	const opts = {
		storeSCIMToken: "plain",
		...options,
	} satisfies SCIMOptions;

	const authMiddleware = authMiddlewareFactory(opts);

	return {
		id: "scim",
		version: PACKAGE_VERSION,
		init(ctx) {
			if (!ctx.hasPlugin("organization") && !opts.staticProviders?.length) {
				throw new BetterAuthError(
					"The scim plugin requires the organization plugin. Register it, or configure app-level providers via `staticProviders` for single-tenant SCIM.",
				);
			}
		},
		endpoints: {
			generateSCIMToken: generateSCIMToken(opts),
			listSCIMProviderConnections: listSCIMProviderConnections(opts),
			getSCIMProviderConnection: getSCIMProviderConnection(opts),
			deleteSCIMProviderConnection: deleteSCIMProviderConnection(opts),
			getSCIMUser: getSCIMUser(authMiddleware),
			createSCIMUser: createSCIMUser(authMiddleware, opts),
			patchSCIMUser: patchSCIMUser(authMiddleware),
			deleteSCIMUser: deleteSCIMUser(authMiddleware),
			updateSCIMUser: updateSCIMUser(authMiddleware),
			listSCIMUsers: listSCIMUsers(authMiddleware),
			getSCIMGroup: getSCIMGroup(authMiddleware),
			createSCIMGroup: createSCIMGroup(authMiddleware, opts),
			patchSCIMGroup: patchSCIMGroup(authMiddleware, opts),
			deleteSCIMGroup: deleteSCIMGroup(authMiddleware),
			updateSCIMGroup: updateSCIMGroup(authMiddleware, opts),
			listSCIMGroups: listSCIMGroups(authMiddleware),
			getSCIMServiceProviderConfig,
			getSCIMSchemas,
			getSCIMSchema,
			getSCIMResourceTypes,
			getSCIMResourceType,
		},
		schema: {
			scimProvider: {
				fields: {
					providerId: {
						type: "string",
						required: true,
					},
					scimToken: {
						type: "string",
						required: true,
						unique: true,
					},
					organizationId: {
						type: "string",
						required: true,
					},
				},
			},
			scimGroup: {
				fields: {
					providerId: {
						type: "string",
						required: true,
					},
					organizationId: {
						type: "string",
						required: true,
					},
					scimGroupId: {
						type: "string",
						required: true,
						unique: true,
					},
					externalId: {
						type: "string",
						required: false,
					},
					externalIdKey: {
						type: "string",
						required: false,
						unique: true,
						returned: false,
					},
					displayName: {
						type: "string",
						required: true,
					},
					createdAt: {
						type: "date",
						required: true,
					},
					updatedAt: {
						type: "date",
						required: false,
					},
				},
			},
			scimGroupMember: {
				fields: {
					groupId: {
						type: "string",
						required: true,
						references: {
							model: "scimGroup",
							field: "id",
						},
					},
					providerId: {
						type: "string",
						required: true,
					},
					organizationId: {
						type: "string",
						required: true,
					},
					userId: {
						type: "string",
						required: true,
						references: {
							model: "user",
							field: "id",
						},
					},
					membershipKey: {
						type: "string",
						required: true,
						unique: true,
						returned: false,
					},
					createdAt: {
						type: "date",
						required: true,
					},
				},
			},
			scimGroupRole: {
				fields: {
					groupId: {
						type: "string",
						required: true,
						references: {
							model: "scimGroup",
							field: "id",
						},
					},
					role: {
						type: "string",
						required: true,
					},
					roleKey: {
						type: "string",
						required: true,
						unique: true,
						returned: false,
					},
					createdAt: {
						type: "date",
						required: true,
					},
				},
			},
			scimGroupRoleGrant: {
				fields: {
					groupId: {
						type: "string",
						required: true,
						references: {
							model: "scimGroup",
							field: "id",
						},
					},
					providerId: {
						type: "string",
						required: true,
					},
					organizationId: {
						type: "string",
						required: true,
					},
					userId: {
						type: "string",
						required: true,
						references: {
							model: "user",
							field: "id",
						},
					},
					role: {
						type: "string",
						required: true,
					},
					roleGrantKey: {
						type: "string",
						required: true,
						unique: true,
						returned: false,
					},
					isRoleProjected: {
						type: "boolean",
						required: true,
					},
					createdAt: {
						type: "date",
						required: true,
					},
				},
			},
		},
		options,
	} satisfies BetterAuthPlugin;
};

export * from "./types";
