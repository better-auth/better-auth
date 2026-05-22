import type { BetterAuthPlugin } from "better-auth";
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
	const providerOwnershipEnabled = options?.providerOwnership?.enabled ?? false;

	const authMiddleware = authMiddlewareFactory(opts);

	return {
		id: "scim",
		version: PACKAGE_VERSION,
		endpoints: {
			generateSCIMToken: generateSCIMToken(opts),
			listSCIMProviderConnections: listSCIMProviderConnections(opts),
			getSCIMProviderConnection: getSCIMProviderConnection(opts),
			deleteSCIMProviderConnection: deleteSCIMProviderConnection(opts),
			getSCIMUser: getSCIMUser(authMiddleware),
			createSCIMUser: createSCIMUser(authMiddleware),
			patchSCIMUser: patchSCIMUser(authMiddleware),
			deleteSCIMUser: deleteSCIMUser(authMiddleware),
			updateSCIMUser: updateSCIMUser(authMiddleware),
			listSCIMUsers: listSCIMUsers(authMiddleware),
			getSCIMGroup: getSCIMGroup(authMiddleware),
			createSCIMGroup: createSCIMGroup(authMiddleware, opts),
			patchSCIMGroup: patchSCIMGroup(authMiddleware),
			deleteSCIMGroup: deleteSCIMGroup(authMiddleware),
			updateSCIMGroup: updateSCIMGroup(authMiddleware),
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
						unique: true,
					},
					scimToken: {
						type: "string",
						required: true,
						unique: true,
					},
					organizationId: {
						type: "string",
						required: false,
					},
					...(providerOwnershipEnabled
						? {
								userId: {
									type: "string",
									required: false,
								},
							}
						: {}),
				},
			},
		},
		options,
	} satisfies BetterAuthPlugin;
};

export * from "./types";
