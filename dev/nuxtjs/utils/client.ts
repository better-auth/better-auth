import { createAuthClient } from "better-auth/vue";
import { organizationClient } from "better-auth/client/plugins";
export const client = createAuthClient({
	plugins: [organizationClient()],
});
