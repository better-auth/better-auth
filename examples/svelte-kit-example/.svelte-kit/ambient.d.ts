
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * Environment variables [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env`. Like [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), this module cannot be imported into client-side code. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 * 
 * _Unlike_ [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), the values exported from this module are statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * ```ts
 * import { API_KEY } from '$env/static/private';
 * ```
 * 
 * Note that all environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * 
 * ```
 * MY_FEATURE_FLAG=""
 * ```
 * 
 * You can override `.env` values from the command line like so:
 * 
 * ```bash
 * MY_FEATURE_FLAG="enabled" npm run dev
 * ```
 */
declare module '$env/static/private' {
	export const npm_package_devDependencies__tailwindcss_typography: string;
	export const COREPACK_ROOT: string;
	export const npm_package_dependencies_bits_ui: string;
	export const npm_package_dependencies__types_better_sqlite3: string;
	export const TERM_PROGRAM: string;
	export const NODE: string;
	export const INIT_CWD: string;
	export const npm_package_dependencies_vaul_svelte: string;
	export const npm_package_devDependencies_typescript: string;
	export const npm_package_devDependencies_vite: string;
	export const TERM: string;
	export const SHELL: string;
	export const npm_package_dependencies_svelte_sonner: string;
	export const HOMEBREW_REPOSITORY: string;
	export const TMPDIR: string;
	export const npm_package_dependencies_better_sqlite3: string;
	export const npm_package_devDependencies__better_auth_cli: string;
	export const npm_package_dependencies_tailwind_variants: string;
	export const TERM_PROGRAM_VERSION: string;
	export const npm_package_scripts_dev: string;
	export const npm_package_dependencies_paneforge: string;
	export const ZDOTDIR: string;
	export const CURSOR_TRACE_ID: string;
	export const ORIGINAL_XDG_CURRENT_DESKTOP: string;
	export const MallocNanoZone: string;
	export const npm_config_registry: string;
	export const npm_package_devDependencies__sveltejs_kit: string;
	export const npm_package_private: string;
	export const npm_package_dependencies_formsnap: string;
	export const PNPM_HOME: string;
	export const ZSH: string;
	export const USER: string;
	export const npm_package_scripts_check_watch: string;
	export const LS_COLORS: string;
	export const COMMAND_MODE: string;
	export const PNPM_SCRIPT_SRC_DIR: string;
	export const SSH_AUTH_SOCK: string;
	export const npm_package_dependencies_svelte_radix: string;
	export const VSCODE_PROFILE_INITIALIZED: string;
	export const __CF_USER_TEXT_ENCODING: string;
	export const npm_execpath: string;
	export const npm_package_devDependencies_svelte: string;
	export const PAGER: string;
	export const npm_config_frozen_lockfile: string;
	export const LSCOLORS: string;
	export const npm_package_dependencies_tailwind_merge: string;
	export const npm_package_dependencies__internationalized_date: string;
	export const PATH: string;
	export const _: string;
	export const npm_package_dependencies_better_auth: string;
	export const COREPACK_ENABLE_DOWNLOAD_PROMPT: string;
	export const USER_ZDOTDIR: string;
	export const __CFBundleIdentifier: string;
	export const npm_command: string;
	export const npm_package_devDependencies_tailwindcss: string;
	export const PWD: string;
	export const npm_package_scripts_preview: string;
	export const npm_lifecycle_event: string;
	export const npm_package_devDependencies__sveltejs_vite_plugin_svelte: string;
	export const npm_package_name: string;
	export const LANG: string;
	export const npm_package_dependencies_mode_watcher: string;
	export const npm_package_scripts_build: string;
	export const npm_config_node_linker: string;
	export const VSCODE_GIT_ASKPASS_EXTRA_ARGS: string;
	export const XPC_FLAGS: string;
	export const npm_package_scripts_migrate: string;
	export const npm_config_node_gyp: string;
	export const npm_package_devDependencies__sveltejs_adapter_auto: string;
	export const npm_package_version: string;
	export const XPC_SERVICE_NAME: string;
	export const npm_package_devDependencies_svelte_check: string;
	export const npm_package_devDependencies_autoprefixer: string;
	export const VSCODE_INJECTION: string;
	export const npm_package_type: string;
	export const SHLVL: string;
	export const HOME: string;
	export const VSCODE_GIT_ASKPASS_MAIN: string;
	export const HOMEBREW_PREFIX: string;
	export const npm_config_store_dir: string;
	export const LESS: string;
	export const LOGNAME: string;
	export const npm_lifecycle_script: string;
	export const npm_package_dependencies_zod: string;
	export const VSCODE_GIT_IPC_HANDLE: string;
	export const npm_package_dependencies_embla_carousel_svelte: string;
	export const BUN_INSTALL: string;
	export const npm_config_user_agent: string;
	export const npm_package_dependencies_sveltekit_superforms: string;
	export const npm_package_dependencies_clsx: string;
	export const VSCODE_GIT_ASKPASS_NODE: string;
	export const GIT_ASKPASS: string;
	export const INFOPATH: string;
	export const HOMEBREW_CELLAR: string;
	export const npm_package_dependencies_cmdk_sv: string;
	export const npm_config_link_workspace_packages: string;
	export const npm_package_scripts_prepare: string;
	export const npm_package_scripts_check: string;
	export const npm_node_execpath: string;
	export const COLORTERM: string;
}

/**
 * Similar to [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private), except that it only includes environment variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Values are replaced statically at build time.
 * 
 * ```ts
 * import { PUBLIC_BASE_URL } from '$env/static/public';
 * ```
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to runtime environment variables, as defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 * 
 * This module cannot be imported into client-side code.
 * 
 * Dynamic environment variables cannot be used during prerendering.
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * console.log(env.DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 * 
 * > In `dev`, `$env/dynamic` always includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 */
declare module '$env/dynamic/private' {
	export const env: {
		npm_package_devDependencies__tailwindcss_typography: string;
		COREPACK_ROOT: string;
		npm_package_dependencies_bits_ui: string;
		npm_package_dependencies__types_better_sqlite3: string;
		TERM_PROGRAM: string;
		NODE: string;
		INIT_CWD: string;
		npm_package_dependencies_vaul_svelte: string;
		npm_package_devDependencies_typescript: string;
		npm_package_devDependencies_vite: string;
		TERM: string;
		SHELL: string;
		npm_package_dependencies_svelte_sonner: string;
		HOMEBREW_REPOSITORY: string;
		TMPDIR: string;
		npm_package_dependencies_better_sqlite3: string;
		npm_package_devDependencies__better_auth_cli: string;
		npm_package_dependencies_tailwind_variants: string;
		TERM_PROGRAM_VERSION: string;
		npm_package_scripts_dev: string;
		npm_package_dependencies_paneforge: string;
		ZDOTDIR: string;
		CURSOR_TRACE_ID: string;
		ORIGINAL_XDG_CURRENT_DESKTOP: string;
		MallocNanoZone: string;
		npm_config_registry: string;
		npm_package_devDependencies__sveltejs_kit: string;
		npm_package_private: string;
		npm_package_dependencies_formsnap: string;
		PNPM_HOME: string;
		ZSH: string;
		USER: string;
		npm_package_scripts_check_watch: string;
		LS_COLORS: string;
		COMMAND_MODE: string;
		PNPM_SCRIPT_SRC_DIR: string;
		SSH_AUTH_SOCK: string;
		npm_package_dependencies_svelte_radix: string;
		VSCODE_PROFILE_INITIALIZED: string;
		__CF_USER_TEXT_ENCODING: string;
		npm_execpath: string;
		npm_package_devDependencies_svelte: string;
		PAGER: string;
		npm_config_frozen_lockfile: string;
		LSCOLORS: string;
		npm_package_dependencies_tailwind_merge: string;
		npm_package_dependencies__internationalized_date: string;
		PATH: string;
		_: string;
		npm_package_dependencies_better_auth: string;
		COREPACK_ENABLE_DOWNLOAD_PROMPT: string;
		USER_ZDOTDIR: string;
		__CFBundleIdentifier: string;
		npm_command: string;
		npm_package_devDependencies_tailwindcss: string;
		PWD: string;
		npm_package_scripts_preview: string;
		npm_lifecycle_event: string;
		npm_package_devDependencies__sveltejs_vite_plugin_svelte: string;
		npm_package_name: string;
		LANG: string;
		npm_package_dependencies_mode_watcher: string;
		npm_package_scripts_build: string;
		npm_config_node_linker: string;
		VSCODE_GIT_ASKPASS_EXTRA_ARGS: string;
		XPC_FLAGS: string;
		npm_package_scripts_migrate: string;
		npm_config_node_gyp: string;
		npm_package_devDependencies__sveltejs_adapter_auto: string;
		npm_package_version: string;
		XPC_SERVICE_NAME: string;
		npm_package_devDependencies_svelte_check: string;
		npm_package_devDependencies_autoprefixer: string;
		VSCODE_INJECTION: string;
		npm_package_type: string;
		SHLVL: string;
		HOME: string;
		VSCODE_GIT_ASKPASS_MAIN: string;
		HOMEBREW_PREFIX: string;
		npm_config_store_dir: string;
		LESS: string;
		LOGNAME: string;
		npm_lifecycle_script: string;
		npm_package_dependencies_zod: string;
		VSCODE_GIT_IPC_HANDLE: string;
		npm_package_dependencies_embla_carousel_svelte: string;
		BUN_INSTALL: string;
		npm_config_user_agent: string;
		npm_package_dependencies_sveltekit_superforms: string;
		npm_package_dependencies_clsx: string;
		VSCODE_GIT_ASKPASS_NODE: string;
		GIT_ASKPASS: string;
		INFOPATH: string;
		HOMEBREW_CELLAR: string;
		npm_package_dependencies_cmdk_sv: string;
		npm_config_link_workspace_packages: string;
		npm_package_scripts_prepare: string;
		npm_package_scripts_check: string;
		npm_node_execpath: string;
		COLORTERM: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * Similar to [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), but only includes variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Note that public dynamic environment variables must all be sent from the server to the client, causing larger network requests — when possible, use `$env/static/public` instead.
 * 
 * Dynamic environment variables cannot be used during prerendering.
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.PUBLIC_DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
