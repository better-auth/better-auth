import type { BetterAuthPlugin } from "better-auth";
import { authMiddlewareFactory } from "./middlewares";
import {
	createSCIMUser,
	deleteSCIMUser,
	generateSCIMToken,
	getSCIMResourceType,
	getSCIMResourceTypes,
	getSCIMSchema,
	getSCIMSchemas,
	getSCIMServiceProviderConfig,
	getSCIMUser,
	listSCIMUsers,
	patchSCIMUser,
	updateSCIMUser,
} from "./routes";
import type { SCIMOptions } from "./types";

export const scim = (options?: SCIMOptions) => {
	const opts = {
		storeSCIMToken: "plain",
		...options,
	} satisfies SCIMOptions;

	const authMiddleware = authMiddlewareFactory(opts);

	return {
		id: "scim",
		endpoints: {
			generateSCIMToken: generateSCIMToken(opts),
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
				},
			},
		},
	} satisfies BetterAuthPlugin;
};
