import type { BetterAuthPlugin } from "better-auth";
import { authMiddlewareFactory } from "./middlewares";
import {
	createSCIMUser,
	deleteSCIMProviderConnection,
	deleteSCIMUser,
	generateSCIMToken,
	getSCIMProviderConnection,
	getSCIMResourceType,
	getSCIMResourceTypes,
	getSCIMSchema,
	getSCIMSchemas,
	getSCIMServiceProviderConfig,
	getSCIMUser,
	listSCIMProviderConnections,
	listSCIMUsers,
	patchSCIMUser,
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
