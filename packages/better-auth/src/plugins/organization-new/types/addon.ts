import type { LiteralString } from "@better-auth/core";
import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import type { Endpoint } from "better-call";
import type {
	OrganizationOptions,
	ResolvedOrganizationOptions,
} from "./organization-options";

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
 * with additional functionality, endpoints, schema, and events.
 *
 * @example
 * ```ts
 * export const teams = (options?: TeamsOptions) => {
 *   return {
 *     id: "teams",
 *     events: {
 *       async createDefaultTeam({ organization, user }, ctx, addonCtx) {
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
	id: LiteralString;
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
	 * Event handlers provided by the addon.
	 * Events can be any functions that the addon exposes for use by the organization plugin or other addons.
	 */
	events?: Record<string, (...args: any[]) => any>;
	/**
	 * Addon-specific options for type inference.
	 * This allows consumers to get proper type inference for addon configuration.
	 */
	options?: TOptions;
	/**
	 * Error codes for the addon.
	 */
	errorCodes?: Record<string, { code: string; message: string }>;
	/**
	 * Infer types for the addon.
	 */
	Infer?: Record<string, any>;
}

export type FindAddonFromOrgOptions<
	O extends OrganizationOptions,
	AddonId extends string,
> = O["use"] extends readonly (infer U)[]
	? U extends { id: AddonId }
		? U
		: never
	: never;
