import type { AuthContext, BetterAuthPlugin } from "@better-auth/core";
import { htmlResponse } from "./page";

export interface PluginUIHandlerContext {
	request: Request;
	/** Sub-path after the plugin's base path, e.g. "/users" */
	path: string;
	context: AuthContext;
	/** True when the client is doing a partial navigation (swap content only) */
	partial: boolean;
	/** The resolved session, or null if not authenticated */
	session: {
		user: Record<string, unknown>;
		session: Record<string, unknown>;
	} | null;
}

export interface PluginUIConfig {
	/**
	 * Base path for this plugin's UI routes.
	 * Example: "/admin" -> pages served at /admin, /admin/users, etc.
	 */
	path: string;
	/**
	 * Handle a UI request. The plugin returns a complete Response.
	 */
	handler: (ctx: PluginUIHandlerContext) => Promise<Response>;
}

/**
 * Create the UI request handler.
 * Matches incoming requests to plugin UI handlers.
 */
export function createUIHandler(
	authContext: Promise<AuthContext>,
	plugins: BetterAuthPlugin[],
	basePath: string,
	getAuthHandler: () => (request: Request) => Promise<Response>,
) {
	const uiPlugins: { path: string; handler: PluginUIConfig["handler"] }[] = [];

	for (const plugin of plugins) {
		if (plugin.ui) {
			const ui = plugin.ui as PluginUIConfig;
			uiPlugins.push({ path: ui.path, handler: ui.handler });
		}
	}

	return async (request: Request): Promise<Response> => {
		const ctx = await authContext;
		const url = new URL(request.url);
		let pathname = url.pathname;

		if (basePath !== "/" && pathname.startsWith(basePath)) {
			pathname = pathname.slice(basePath.length) || "/";
		}

		const isPartial = request.headers.get("X-BA-Partial") === "true";
		const session = await resolveSession(request, ctx, getAuthHandler());

		for (const plugin of uiPlugins) {
			if (pathname === plugin.path || pathname.startsWith(plugin.path + "/")) {
				const subPath = pathname.slice(plugin.path.length) || "/";
				return plugin.handler({
					request,
					path: subPath,
					context: ctx,
					partial: isPartial,
					session,
				});
			}
		}

		return htmlResponse(
			`<h1>Not Found</h1><p>No plugin UI matches this path.</p>`,
			404,
		);
	};
}

async function resolveSession(
	request: Request,
	context: AuthContext,
	authHandler: (request: Request) => Promise<Response>,
): Promise<PluginUIHandlerContext["session"]> {
	try {
		const cookieHeader = request.headers.get("cookie");
		if (!cookieHeader) return null;

		const basePath = context.options.basePath || "/api/auth";
		const origin = new URL(request.url).origin;

		const sessionReq = new Request(`${origin}${basePath}/get-session`, {
			method: "GET",
			headers: { cookie: cookieHeader },
		});

		const response = await authHandler(sessionReq);
		if (!response.ok) return null;

		const data = await response.json();
		if (!data || !data.user || !data.session) return null;

		return data as {
			user: Record<string, unknown>;
			session: Record<string, unknown>;
		};
	} catch {
		return null;
	}
}
