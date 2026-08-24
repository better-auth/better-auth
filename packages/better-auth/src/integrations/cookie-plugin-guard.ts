import type { AuthContext } from "@better-auth/core";

/**
 * Warns when a cookie integration plugin is not effectively last.
 *
 * A plugin is considered misordered when there is at least one other plugin
 * after it in the `plugins` array that declares `hooks.after`, since those
 * hooks can set cookies that this integration will not see.
 */
export function warnIfCookiePluginNotLast(
	ctx: AuthContext,
	pluginId: string,
): void {
	const plugins = ctx.options.plugins || [];
	if (plugins.length === 0) return;

	const index = plugins.findIndex((p) => p.id === pluginId);
	if (index === -1) return;

	const pluginsAfter = plugins.slice(index + 1);
	const hasAfterHooksAfter = pluginsAfter.some(
		(p) => p.hooks && Array.isArray(p.hooks.after) && p.hooks.after.length > 0,
	);

	if (!hasAfterHooksAfter) return;

	ctx.logger.warn(
		`[better-auth] Cookie integration plugin "${pluginId}" should be placed last in the plugins array. ` +
			"Plugins with `hooks.after` running after it may set cookies that are not forwarded to the framework cookie store. " +
			"Move your cookie integration plugin to the end of the `plugins` array to avoid missing `Set-Cookie` headers.",
	);
}
