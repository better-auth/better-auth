import type { GenericEndpointContext } from "@better-auth/core";
import type { Session } from "../../types";
import { getOrgAdapter } from "./adapter";
import type { OrganizationOptions } from "./types";

/**
 * Helper function to automatically set the lastUsed organization as active on sign-in.
 * This should be called from databaseHooks.session.create.after
 *
 * @example
 * ```ts
 * import { organization, setLastUsedOrganizationAsActive } from "better-auth/plugins/organization";
 *
 * const orgPlugin = organization();
 *
 * const auth = betterAuth({
 *   plugins: [orgPlugin],
 *   databaseHooks: {
 *     session: {
 *       create: {
 *         after: async (session, ctx) => {
 *           await setLastUsedOrganizationAsActive(session, ctx, orgPlugin.options);
 *         }
 *       }
 *     }
 *   }
 * });
 * ```
 */
export async function setLastUsedOrganizationAsActive<
	O extends OrganizationOptions,
>(
	session: Session & { activeOrganizationId?: string | null },
	ctx: GenericEndpointContext | undefined,
	options: O,
): Promise<void> {
	// If context is not provided, skip
	if (!ctx || !ctx.context) {
		return;
	}

	// If session already has an active organization, don't override it
	if (session.activeOrganizationId) {
		return;
	}

	// Get the user ID from the session
	const userId = session.userId;
	if (!userId) {
		return;
	}

	// Get the organization adapter using ctx.context which is AuthContext
	const adapter = getOrgAdapter<O>(ctx.context, options);

	// Find the lastUsed organization for this user
	const lastUsedOrg = await adapter.findLastUsedOrganization(userId);

	if (lastUsedOrg) {
		// Set it as active
		await adapter.setActiveOrganization(session.token, lastUsedOrg.id, ctx);
	}
	// If no lastUsed organization exists, let it fall through to default behavior
	// (or whatever the user has configured in databaseHooks)
}
