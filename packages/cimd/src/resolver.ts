import type { GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import type {
	OAuthOptions,
	SchemaClient,
	Scope,
} from "@better-auth/oauth-provider";
import { toExpJWT } from "better-auth/plugins";
import {
	createMetadataDocumentClient,
	refreshMetadataDocumentClient,
} from "./client-store";
import type { CimdOptions } from "./types";
import { isUrlClientId } from "./validate-metadata-document";

/**
 * Signature of the `resolve` function on a {@link ClientDiscovery}. Kept
 * here to avoid a circular import back into `@better-auth/oauth-provider`.
 */
type CimdResolver = (
	ctx: GenericEndpointContext,
	clientId: string,
	existing: SchemaClient<Scope[]> | null,
) => Promise<SchemaClient<Scope[]> | null>;

function toDate(value: unknown): Date | null {
	if (value instanceof Date) {
		return Number.isFinite(value.getTime()) ? value : null;
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		const parsed = new Date(value);
		return Number.isFinite(parsed.getTime()) ? parsed : null;
	}
	if (typeof value === "bigint") {
		const parsed = new Date(Number(value));
		return Number.isFinite(parsed.getTime()) ? parsed : null;
	}
	if (typeof value === "string") {
		const asNumber = Number(value);
		if (Number.isFinite(asNumber)) {
			const parsed = new Date(asNumber);
			return Number.isFinite(parsed.getTime()) ? parsed : null;
		}
		const parsed = new Date(value);
		return Number.isFinite(parsed.getTime()) ? parsed : null;
	}
	return null;
}

function isStale(
	existing: SchemaClient<Scope[]>,
	refreshRate: number | string,
) {
	// Records with no usable timestamp are always considered stale — we
	// would rather re-fetch once than risk serving a record that never
	// refreshes for its lifetime.
	const updatedAt =
		toDate(existing.updatedAt) ?? toDate(existing.createdAt) ?? new Date(0);
	const updatedSec = Math.floor(updatedAt.getTime() / 1000);
	// `toExpJWT` treats numbers as absolute timestamps, so convert numeric
	// seconds to a relative offset for correct TTL behavior.
	const staleAt =
		typeof refreshRate === "number"
			? updatedSec + refreshRate
			: toExpJWT(refreshRate, updatedSec);
	return staleAt < Math.floor(Date.now() / 1000);
}

/**
 * Build the `resolve` function for a CIMD {@link ClientDiscovery}.
 *
 * Exposed for advanced composition. Most users should call
 * {@link cimdClientDiscovery} (to pass a complete discovery to
 * `oauthProvider({ clientDiscovery })`) or install the `cimd()` plugin.
 */
export function createCimdResolver(
	cimdOptions: CimdOptions = {},
): CimdResolver {
	const refreshRate = cimdOptions.refreshRate ?? "60m";

	return async (ctx, clientId, existing) => {
		if (!isUrlClientId(clientId)) {
			return null;
		}

		const provider = ctx.context.getPlugin("oauth-provider");
		if (!provider) {
			throw new BetterAuthError(
				"cimd discovery invoked without the oauth-provider plugin installed",
			);
		}
		const oauthOptions = provider.options as OAuthOptions<Scope[]>;

		if (!existing) {
			return await createMetadataDocumentClient(
				ctx,
				clientId,
				cimdOptions,
				oauthOptions,
			);
		}

		if (isStale(existing, refreshRate)) {
			return await refreshMetadataDocumentClient(
				ctx,
				clientId,
				existing,
				cimdOptions,
				oauthOptions,
			);
		}

		return existing;
	};
}
