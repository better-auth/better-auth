import { createAuthEndpoint } from "@better-auth/core/api";
import type { ResolvedAgentAuthOptions } from "../types";

/**
 * Public endpoint that returns the gateway configuration.
 *
 * The MCP gateway process calls this on startup to discover
 * which providers are configured in the plugin. No auth required —
 * only returns provider names, no secrets.
 */
export function gatewayConfig(opts: ResolvedAgentAuthOptions) {
	const providers = (opts.mcpProviders ?? []).map((p) =>
		typeof p === "string" ? p : { name: p.name, displayName: p.displayName },
	);

	return createAuthEndpoint(
		"/agent/gateway-config",
		{
			method: "GET",
			metadata: {
				openapi: {
					description:
						"Returns gateway configuration for the MCP gateway process.",
				},
			},
		},
		async (ctx) => {
			return ctx.json({ providers });
		},
	);
}
