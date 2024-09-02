import { createAuthClient } from "better-auth/vue";
import { organizationClient } from "better-auth/client";
export const client = createAuthClient({
	authPlugins: [organizationClient()],
});
