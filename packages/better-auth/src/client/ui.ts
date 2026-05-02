import type {
	BetterAuthClientPlugin,
	ClientAtomListener,
	UIPageDefinition,
} from "@better-auth/core";

/**
 * Client store interface for signal propagation
 */
export interface ClientStore {
	notify: (signal: string) => void;
}

/**
 * Return type for UI page configuration
 */
export interface UIConfig {
	src: string;
	page: string;
	args?: Record<string, unknown>;
	/** Client store for signal propagation - automatically included */
	$store: ClientStore;
	/** Atom listeners from client plugins - automatically included */
	atomListeners: ClientAtomListener[];
}

/**
 * Built-in UI pages with their default arguments
 */
export interface BuiltInUIPages {
	signIn: {
		path: "/sign-in";
		args: {
			passkey?: { disabled?: boolean };
			emailAndPassword?: { callbackURL?: string };
			redirectTo?: string;
		};
	};
	signUp: {
		path: "/sign-up";
		args: {
			passkey?: { disabled?: boolean };
			redirectTo?: string;
		};
	};
	forgotPassword: {
		path: "/forgot-password";
		args: {
			redirectTo?: string;
		};
	};
	resetPassword: {
		path: "/reset-password";
		args: {
			token?: string;
			redirectTo?: string;
		};
	};
	verifyEmail: {
		path: "/verify-email";
		args: {
			token?: string;
			email?: string;
			redirectTo?: string;
		};
	};
	profile: {
		path: "/profile";
		args: Record<string, unknown>;
	};
}

const BUILT_IN_PAGES: Record<keyof BuiltInUIPages, { path: string }> = {
	signIn: { path: "/sign-in" },
	signUp: { path: "/sign-up" },
	forgotPassword: { path: "/forgot-password" },
	resetPassword: { path: "/reset-password" },
	verifyEmail: { path: "/verify-email" },
	profile: { path: "/profile" },
};

/**
 * Encode args as base64 JSON for URL
 */
function encodeArgs(args: Record<string, unknown>): string {
	if (Object.keys(args).length === 0) return "";
	return btoa(JSON.stringify(args));
}

/**
 * Build the iframe src URL
 */
function buildSrc(
	basePath: string,
	pagePath: string,
	args?: Record<string, unknown>,
): string {
	const params = new URLSearchParams();
	params.set("embed", "true");

	if (args && Object.keys(args).length > 0) {
		params.set("args", encodeArgs(args));
	}

	return `${basePath}${pagePath}?${params.toString()}`;
}

/**
 * Create a UI config object for a page
 */
function createUIConfig(
	basePath: string,
	page: string,
	pagePath: string,
	$store: ClientStore,
	atomListeners: ClientAtomListener[],
	args?: Record<string, unknown>,
): UIConfig {
	return {
		src: buildSrc(basePath, pagePath, args),
		page,
		args,
		$store,
		atomListeners,
	};
}

/**
 * Type for plugin UI pages aggregated from all plugins
 */
export type PluginUIPages<Plugins extends BetterAuthClientPlugin[]> = {
	[P in Plugins[number] as P extends { ui: infer UI }
		? UI extends Record<string, UIPageDefinition>
			? keyof UI
			: never
		: never]: P extends { ui: infer UI }
		? UI extends Record<infer K, UIPageDefinition<infer Args>>
			? K extends string
				? (args?: Args) => UIConfig
				: never
			: never
		: never;
};

/**
 * Combined UI type with built-in and plugin pages
 */
export type UIProxy<Plugins extends BetterAuthClientPlugin[] = []> = {
	[K in keyof BuiltInUIPages]: (args?: BuiltInUIPages[K]["args"]) => UIConfig;
} & PluginUIPages<Plugins>;

/**
 * Options for creating the UI proxy
 */
export interface CreateUIProxyOptions {
	basePath: string;
	$store: ClientStore;
	atomListeners: ClientAtomListener[];
}

/**
 * Create the UI proxy object that provides typed access to all UI pages
 */
export function createUIProxy<Plugins extends BetterAuthClientPlugin[] = []>(
	options: CreateUIProxyOptions,
	plugins: Plugins,
): UIProxy<Plugins> {
	const { basePath, $store, atomListeners } = options;
	const ui = {} as Record<string, (args?: Record<string, unknown>) => UIConfig>;

	for (const [name, def] of Object.entries(BUILT_IN_PAGES)) {
		ui[name] = (args?: Record<string, unknown>) =>
			createUIConfig(basePath, name, def.path, $store, atomListeners, args);
	}

	for (const plugin of plugins) {
		if (plugin.ui) {
			for (const [name, def] of Object.entries(plugin.ui)) {
				ui[name] = (args?: Record<string, unknown>) =>
					createUIConfig(basePath, name, def.path, $store, atomListeners, args);
			}
		}
	}

	return ui as UIProxy<Plugins>;
}
