import type { ComponentType } from "react";
import { Callout } from "@/components/ui/callout";

/**
 * Beta docs content is synced from another branch at build time (see
 * scripts/sync-beta-content.ts), so it can reference MDX components that
 * don't exist in this branch's app code — e.g. a component that was removed
 * on `main` while the beta branch still uses it. Rendering such a page would
 * throw "Expected component `X` to be defined" and fail the whole build.
 *
 * This scans the page's markdown for component-like JSX tags and returns a
 * fallback for every tag the app doesn't provide, so cross-branch drift
 * degrades to a visible note instead of a failed deploy.
 */
const JSX_COMPONENT_TAG = /<([A-Z][A-Za-z0-9]*)/g;

export function collectMissingMdxFallbacks(
	markdown: string,
	provided: Record<string, unknown>,
): Record<string, ComponentType> {
	const fallbacks: Record<string, ComponentType> = {};
	for (const [, name] of markdown.matchAll(JSX_COMPONENT_TAG)) {
		if (name in provided || name in fallbacks) continue;
		console.warn(
			`[docs-beta] MDX component \`${name}\` is not provided by this branch; rendering a fallback`,
		);
		fallbacks[name] = MissingMdxComponent;
	}
	return fallbacks;
}

function MissingMdxComponent() {
	return (
		<Callout type="warn">
			This section relies on an interactive component that isn't available in
			this version of the docs.
		</Callout>
	);
}
