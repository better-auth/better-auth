import { createEndpointCreator } from "better-call";
import { createAuthMiddleware, optionsMiddleware } from "../../api/call";
import { OrganizationOptions } from "./organization";

export const createOrgEndpoint = createEndpointCreator({
	use: [
		optionsMiddleware,
		createAuthMiddleware(async (ctx) => {
			return {} as {
				orgOptions: OrganizationOptions;
			};
		}),
	],
});
