// Copy and modify from https://github.com/wannabespace/conar/blob/ae42097562d1d57b21e6ca32b31a203cebbaad6f/apps/api/src/lib/auth.ts
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import {
	anonymous,
	bearer,
	createAuthMiddleware,
	lastLoginMethod,
	organization,
	twoFactor,
} from "better-auth/plugins";
import { emailHarmony } from "better-auth-harmony";

/**
 * Plugin to prevent setting the "set-cookie" header in responses.
 * We use it to prevent the cookie from being set in the desktop app because it uses bearer token instead of cookies.
 */
function noSetCookiePlugin() {
	return {
		id: "no-set-cookie",
		hooks: {
			after: [
				{
					matcher: (ctx) => !!ctx.request?.headers.get("x-desktop"),
					handler: createAuthMiddleware(async (ctx) => {
						const headers = ctx.context.responseHeaders;

						if (headers instanceof Headers) {
							const setCookies = headers.get("set-cookie");

							if (!setCookies) return;

							headers.delete("set-cookie");
						}
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
}

const config = {
	basePath: "/auth",
	plugins: [
		bearer(),
		twoFactor(),
		organization({
			schema: {
				organization: {
					modelName: "workspace",
				},
				member: {
					fields: {
						organizationId: "workspaceId",
					},
				},
				invitation: {
					fields: {
						organizationId: "workspaceId",
					},
				},
			},
		}),
		lastLoginMethod(),
		emailHarmony(),
		noSetCookiePlugin(),
		anonymous(),
	],
	user: {
		additionalFields: {
			secret: {
				type: "string",
				input: false,
			},
		},
	},
	advanced: {
		cookiePrefix: "conar",
		database: {
			generateId: false,
		},
	},
	emailAndPassword: {
		enabled: true,
	},
} satisfies BetterAuthOptions;

export const auth = betterAuth(config);
