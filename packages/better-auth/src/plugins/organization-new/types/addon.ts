import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import type { Endpoint } from "better-call";
import type { AddonHook } from "./addon-hooks";
import type { ResolvedOrganizationOptions } from "./organization-options";

/**
 * Context provided to addon hooks for inter-addon communication
 * and access to organization plugin configuration
 */
export interface AddonContext {
	/**
	 * The resolved organization plugin options
	 */
	options: ResolvedOrganizationOptions;
	/**
	 * Get a registered addon by its ID
	 *
	 * @example
	 * ```ts
	 * const teamsAddon = addonCtx.getAddon<TeamsAddon>("teams");
	 * if (teamsAddon) {
	 *   // Use teams addon...
	 * }
	 * ```
	 */
	getAddon: <T extends Addon = Addon>(id: string) => T | undefined;
	/**
	 * Check if an addon is registered
	 *
	 * @example
	 * ```ts
	 * if (addonCtx.hasAddon("access-control")) {
	 *   // Access control is enabled...
	 * }
	 * ```
	 */
	hasAddon: (id: string) => boolean;
}

/**
 * Default priority for addon hooks when not specified.
 * Lower numbers run first.
 */
export const DEFAULT_ADDON_PRIORITY = 50;

/**
 * Interface for organization addons that extend the organization plugin
 * with additional functionality, endpoints, schema, and lifecycle hooks.
 *
 * @example
 * ```ts
 * export const teams = (options?: TeamsOptions) => {
 *   return {
 *     id: "teams",
 *     priority: 10, // Run early to create default teams
 *     hooks: {
 *       async afterCreateOrganization({ organization, member }, ctx, addonCtx) {
 *         // Check if access-control addon is present
 *         if (addonCtx.hasAddon("access-control")) {
 *           // Inter-addon communication
 *         }
 *         // Create default team...
 *       },
 *     },
 *   } satisfies OrganizationAddons<TeamsOptions>;
 * };
 * ```
 */
export interface Addon<TOptions = unknown> {
	/**
	 * Unique identifier for the addon
	 */
	id: string;
	/**
	 * Hook priority - lower numbers run first.
	 * When multiple addons hook into the same lifecycle event,
	 * they are executed in priority order.
	 *
	 * @default 50
	 */
	priority?: number;
	/**
	 * API endpoints provided by the addon.
	 * These will be merged with the organization plugin endpoints.
	 */
	endpoints?: Record<string, Endpoint>;
	/**
	 * Database schema additions for the addon.
	 * These will be merged with the organization plugin schema.
	 */
	schema?: BetterAuthPluginDBSchema;
	/**
	 * Lifecycle hooks that subscribe to organization plugin events.
	 * Hooks receive an additional `addonCtx` parameter for inter-addon communication.
	 */
	hooks?: AddonHook;
	/**
	 * Addon-specific options for type inference.
	 * This allows consumers to get proper type inference for addon configuration.
	 */
	options?: TOptions;
	/**
	 * Error codes for the addon.
	 */
	errorCodes?: Record<string, { code: string; message: string }>;
}
