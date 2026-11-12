/**
 * Runtimes Better Auth supports, named by their WinterTC runtime keys.
 * Add a key together with its detection.
 *
 * @see https://runtime-keys.proposal.wintertc.org/
 */
export type RuntimeName = "workerd" | "deno" | "bun" | "node";

/**
 * @see https://developers.cloudflare.com/workers/runtime-apis/web-standards/#navigatoruseragent
 */
export const isWorkerd = () =>
	globalThis.navigator?.userAgent === "Cloudflare-Workers";

export const isDeno = () => "Deno" in globalThis;

export const isBun = () => "Bun" in globalThis;

/**
 * Also true on runtimes with Node.js compatibility, such as Deno, Bun, and
 * Workers with `nodejs_compat`. Use {@link getRuntimeName} to tell them apart.
 */
export const isNode = () => Boolean(globalThis.process?.versions?.node);

/**
 * The current runtime, or `undefined` for a runtime Better Auth does not
 * detect.
 */
export function getRuntimeName(): RuntimeName | undefined {
	// Each of these also reports a Node.js version, so Node.js comes last.
	if (isWorkerd()) return "workerd";
	if (isDeno()) return "deno";
	if (isBun()) return "bun";
	if (isNode()) return "node";
	return undefined;
}
