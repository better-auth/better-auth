import type { OAuthOptions, Scope } from "@better-auth/oauth-provider";

/**
 * Get the oauth-provider's resolved options from endpoint context.
 */
export function getOAuthOpts(ctx: {
	context: { getPlugin: (id: string) => any };
}): OAuthOptions<Scope[]> {
	const plugin = ctx.context.getPlugin("oauth-provider");
	if (!plugin?.options) {
		throw new Error("oauth-provider plugin is required for CIBA");
	}
	return plugin.options as OAuthOptions<Scope[]>;
}

/**
 * Validate that a URL uses HTTPS (CIBA spec §10.3).
 * Loopback addresses (localhost, 127.0.0.1, [::1]) are exempt
 * per standard practice for local development (RFC 8252 §8.3).
 */
export function isSecureEndpoint(endpoint: string): boolean {
	try {
		const url = new URL(endpoint);
		const isLoopback =
			url.hostname === "localhost" ||
			url.hostname === "127.0.0.1" ||
			url.hostname === "[::1]";
		return url.protocol === "https:" || isLoopback;
	} catch {
		return false;
	}
}

export interface CibaRequest {
	id: string;
	authReqId: string;
	clientId: string;
	userId: string;
	scope: string;
	bindingMessage?: string;
	authorizationDetails?: string;
	resource?: string;
	agentClaims?: string;
	status: string;
	deliveryMode: string;
	clientNotificationToken?: string;
	clientNotificationEndpoint?: string;
	pollingInterval: number;
	lastPolledAt?: number;
	expiresAt: Date;
	createdAt: Date;
}

export async function findCibaRequest(
	ctx: { context: { adapter: any } },
	authReqId: string,
): Promise<CibaRequest | null> {
	return ctx.context.adapter.findOne({
		model: "cibaRequest",
		where: [{ field: "authReqId", value: authReqId }],
	}) as Promise<CibaRequest | null>;
}

export async function updateCibaRequest(
	ctx: { context: { adapter: any } },
	id: string,
	update: Partial<CibaRequest>,
): Promise<void> {
	await ctx.context.adapter.update({
		model: "cibaRequest",
		where: [{ field: "id", value: id }],
		update,
	});
}

export async function deleteCibaRequest(
	ctx: { context: { adapter: any } },
	authReqId: string,
): Promise<void> {
	await ctx.context.adapter.deleteMany({
		model: "cibaRequest",
		where: [{ field: "authReqId", value: authReqId }],
	});
}
