/**
 * The one binding `integrations/cloudflare.ts` needs from the Workers runtime.
 *
 * Declared locally so the package does not pull `@cloudflare/workers-types`
 * into every file, where its globals would collide with the `node` and `bun`
 * globals this package already builds against.
 */
declare module "cloudflare:workers" {
	export function waitUntil(promise: Promise<unknown>): void;
}
