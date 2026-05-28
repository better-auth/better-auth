import type { BetterFetchPlugin, RequestContext } from "@better-fetch/fetch";

const DEPLOYMENT_ID_HEADER = "x-deployment-id";

function isSkewProtectionEnabled(): boolean {
	if (typeof process === "undefined") return true;
	const flag = process.env.VERCEL_SKEW_PROTECTION_ENABLED;
	return flag === undefined || flag === "1";
}

/**
 * Resolves the active deployment id for [Vercel Skew Protection](https://vercel.com/docs/skew-protection).
 *
 * Next.js reads `data-dpl-id` from the document, then removes it and sets `globalThis.NEXT_DEPLOYMENT_ID`.
 * We check that global first, then the attribute (for other frameworks), then build-time env vars.
 */
export function resolveDeploymentIdForSkewProtection(): string | undefined {
	if (typeof globalThis !== "undefined") {
		const fromGlobal = (globalThis as Record<string, unknown>)
			.NEXT_DEPLOYMENT_ID;
		if (typeof fromGlobal === "string" && fromGlobal.length > 0) {
			return fromGlobal;
		}
	}
	if (typeof document !== "undefined") {
		const fromDataset = document.documentElement?.dataset?.dplId;
		if (fromDataset) return fromDataset;
		const fromAttr =
			document.documentElement?.getAttribute("data-dpl-id") ?? undefined;
		if (fromAttr) return fromAttr;
	}
	if (typeof process !== "undefined") {
		if (process.env.VERCEL_DEPLOYMENT_ID) {
			return process.env.VERCEL_DEPLOYMENT_ID;
		}
		if (process.env.NEXT_DEPLOYMENT_ID) {
			return process.env.NEXT_DEPLOYMENT_ID;
		}
	}
	return undefined;
}

/**
 * Adds `x-deployment-id` to auth client fetches so they stay pinned during rolling releases
 * (Vercel does not pin custom `fetch()` calls automatically).
 */
export const vercelSkewProtectionPlugin = {
	id: "vercel-skew-protection",
	name: "Vercel Skew Protection",
	hooks: {
		onRequest(context: RequestContext) {
			if (!isSkewProtectionEnabled()) {
				return context;
			}
			if (context.headers.has(DEPLOYMENT_ID_HEADER)) {
				return context;
			}
			const deploymentId = resolveDeploymentIdForSkewProtection();
			if (!deploymentId) {
				return context;
			}
			context.headers.set(DEPLOYMENT_ID_HEADER, deploymentId);
			return context;
		},
	},
} satisfies BetterFetchPlugin;

export const redirectPlugin = {
	id: "redirect",
	name: "Redirect",
	hooks: {
		onSuccess(context) {
			if (context.data?.url && context.data?.redirect) {
				if (typeof window !== "undefined" && window.location) {
					if (window.location) {
						try {
							window.location.href = context.data.url;
						} catch {}
					}
				}
			}
		},
	},
} satisfies BetterFetchPlugin;
