import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import Database from "better-sqlite3";
import { createAuthClient } from "better-auth/react";
import {
	inferAdditionalFields,
	organizationClient,
} from "better-auth/client/plugins";

const auth = betterAuth({
	database: new Database("./sqlite.db"),
	trustedOrigins: [],
	emailAndPassword: {
		enabled: true,
	},
	plugins: [organization(), nextCookies()],
	user: {
		additionalFields: {},
	},
});
const authClient = createAuthClient({
	baseURL: "http://localhost:3000",
	plugins: [inferAdditionalFields<typeof auth>(), organizationClient()],
});

authClient.useActiveOrganization();
authClient.useSession();
