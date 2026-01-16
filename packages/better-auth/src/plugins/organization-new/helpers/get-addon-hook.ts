import type { GenericEndpointContext } from "@better-auth/core";
import type {
	Addon,
	AddonContext,
	AddonHook,
	ResolvedOrganizationOptions,
} from "../types";

type AddonHookOptions = "CreateOrganization";

type AddonHooks = NonNullable<AddonHook>;

/**
 * Default priority for addon hooks when not specified.
 * Lower numbers run first.
 */
const DEFAULT_ADDON_PRIORITY = 50;

/**
 * Creates an addon context for inter-addon communication
 */
export const createAddonContext = (
	options: ResolvedOrganizationOptions,
): AddonContext => {
	const addonMap = new Map<string, Addon>();

	// Build addon map for quick lookup
	for (const addon of options.use ?? []) {
		addonMap.set(addon.id, addon);
	}
	``;
	return {
		options,
		getAddon: <T extends Addon = Addon>(id: string): T | undefined => {
			return addonMap.get(id) as T | undefined;
		},
		hasAddon: (id: string): boolean => {
			return addonMap.has(id);
		},
	};
};

/**
 * Represents a hook with its priority for sorting
 */
interface PrioritizedHook<T> {
	priority: number;
	hookFn: T;
	addonId: string;
}

/**
 * Helper function to get addon hooks for a specific lifecycle event.
 * Collects hooks from all addons, sorted by priority (lower numbers first).
 *
 * This is separate from the main organization hooks system - addon hooks
 * receive an additional `addonCtx` parameter for inter-addon communication.
 *
 * @example
 * ```ts
 * const addonCtx = createAddonContext(options);
 * const addonHooks = getAddonHook("CreateOrganization", options);
 *
 * // Before hooks - can modify data
 * const modifications = await addonHooks.before({ organization, user }, ctx, addonCtx);
 *
 * // After hooks - side effects only
 * await addonHooks.after({ organization, member, user }, ctx, addonCtx);
 * ```
 */
export const getAddonHook = <H extends AddonHookOptions>(
	hook: H,
	options: ResolvedOrganizationOptions,
) => {
	type Before = NonNullable<AddonHooks[`before${H}`]>;
	type After = NonNullable<AddonHooks[`after${H}`]>;

	// Create addon context once for reuse
	const addonCtx = createAddonContext(options);

	/**
	 * Collects all addon hooks for the given lifecycle event, sorted by priority
	 */
	const collectHooks = <T>(
		hookKey: `before${H}` | `after${H}`,
	): PrioritizedHook<T>[] => {
		const hooks: PrioritizedHook<T>[] = [];

		// Collect hooks from all addons
		for (const addon of options.use ?? []) {
			const addonHook = addon.hooks?.[hookKey];
			if (addonHook) {
				hooks.push({
					priority: addon.priority ?? DEFAULT_ADDON_PRIORITY,
					hookFn: addonHook as T,
					addonId: addon.id,
				});
			}
		}

		// Sort by priority (lower numbers first)
		return hooks.sort((a, b) => a.priority - b.priority);
	};

	type BeforeReturnT = (
		data: Parameters<Before>[0],
		ctx: GenericEndpointContext,
		addonContext?: AddonContext,
	) => Promise<Record<string, any> | null>;

	type AfterReturnT = (
		data: Parameters<After>[0],
		ctx: GenericEndpointContext,
		addonContext?: AddonContext,
	) => Promise<void>;

	type ReturnT = {
		/**
		 * Execute all addon before hooks in priority order.
		 * Returns merged data modifications from all hooks, or null if no modifications.
		 */
		before: BeforeReturnT;
		/**
		 * Execute all addon after hooks in priority order.
		 */
		after: AfterReturnT;
		/**
		 * The addon context used by hooks for inter-addon communication
		 */
		addonCtx: AddonContext;
	};

	return {
		before: async (
			data: Parameters<Before>[0],
			ctx: GenericEndpointContext,
		): Promise<Record<string, any> | null> => {
			const hooks = collectHooks<Before>(`before${hook}`);
			if (hooks.length === 0) return null;

			let mergedData: Record<string, any> | null = null;

			for (const { hookFn } of hooks) {
				try {
					// @ts-expect-error - intentional, complex union types
					const response = await hookFn(data, ctx, addonCtx);

					if (response && typeof response === "object" && "data" in response) {
						const responseData = response.data as Record<string, any>;
						// Merge data modifications using Object.assign to avoid spread type issues
						if (mergedData !== null) {
							mergedData = Object.assign({}, mergedData, responseData);
						} else {
							mergedData = responseData;
						}
					}
				} catch (error) {
					// Re-throw errors (e.g., APIError) to allow hooks to abort operations
					throw error;
				}
			}

			return mergedData;
		},
		after: async (
			data: Parameters<After>[0],
			ctx: GenericEndpointContext,
		): Promise<void> => {
			const hooks = collectHooks<After>(`after${hook}`);
			if (hooks.length === 0) return;

			for (const { hookFn } of hooks) {
				try {
					await hookFn(data, ctx, addonCtx);
				} catch (error) {
					// Re-throw errors to allow hooks to signal failures
					throw error;
				}
			}
		},
		addonCtx,
	} as ReturnT;
};
