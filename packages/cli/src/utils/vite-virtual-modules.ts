/**
 * Stub modules for Vite's "special" imports (asset and query-suffixed
 * modules). Vite resolves these through its plugin pipeline at build time; the
 * CLI loads auth configs with jiti, where no such pipeline exists and there is
 * no file on disk to read. Without a substitute, a config that transitively
 * imports e.g. `./logo.svg`, `./app.css?inline`, or `./worker.ts?worker`
 * crashes the loader.
 *
 * Detection mirrors Vite's own classification. The query-suffix patterns are
 * tested against the full specifier, the extension membership against the
 * specifier with its query stripped, and query patterns take precedence over
 * extension membership (so `./a.css?raw` is raw text, not a stylesheet). The
 * regexes are not part of Vite's public API, so they are copied here.
 *
 * @see https://github.com/vitejs/vite/blob/main/packages/vite/src/node/constants.ts
 * @see https://github.com/vitejs/vite/blob/main/packages/vite/src/node/plugins/asset.ts
 */

const WORKER_RE = /[?&](?:worker|sharedworker)(?:&|$)/;
const URL_RE = /[?&]url(?:&|$)/;
const RAW_RE = /[?&]raw(?:&|$)/;
const INLINE_RE = /[?&]inline(?:&|$)/;
const WASM_INIT_RE = /\.wasm\?init\b/;
const CSS_MODULE_RE =
	/\.module\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;
const CSS_LANGS_RE =
	/\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;
const KNOWN_ASSET_RE =
	/\.(?:apng|bmp|png|jpe?g|jfif|pjpeg|pjp|gif|svg|ico|webp|avif|cur|jxl|mp4|webm|ogg|mp3|wav|flac|aac|opus|mov|m4a|vtt|woff2?|eot|ttf|otf|webmanifest|pdf|txt)(?:\?.*)?$/i;

// The Babel plugin sets this as an import specifier directly, so it is imported
// natively and needs none of the alias-resolution marker that the SvelteKit
// stubs in `sveltekit-virtual-modules.ts` require.
function createDataUriModule(body: string): string {
	return `data:text/javascript;charset=utf-8,${encodeURIComponent(body)}`;
}

/**
 * Returns a data-URI stub module for a Vite special import, or `undefined`
 * when the specifier is an ordinary module that should resolve normally. The
 * stub's runtime shape matches what Vite would emit (a string for raw/url, a
 * worker constructor, a class-name proxy for CSS Modules, and so on).
 */
export function getViteAssetStub(specifier: string): string | undefined {
	if (WORKER_RE.test(specifier)) {
		// `?worker&url` yields the worker URL; otherwise a constructor wrapper.
		return createDataUriModule(
			URL_RE.test(specifier)
				? `export default "";`
				: `export default function () {};`,
		);
	}
	if (WASM_INIT_RE.test(specifier)) {
		// Vite's `?init` resolves to a WebAssembly.Instance-like object exposing
		// `.exports`, so mirror that shape.
		return createDataUriModule(`export default async () => ({ exports: {} });`);
	}
	if (
		RAW_RE.test(specifier) ||
		INLINE_RE.test(specifier) ||
		URL_RE.test(specifier)
	) {
		return createDataUriModule(`export default "";`);
	}
	if (CSS_MODULE_RE.test(specifier)) {
		// CSS Modules expose a map of class names; an identity proxy answers any
		// default or named access with the requested key.
		return createDataUriModule(
			`export default new Proxy({}, { get: (_, key) => String(key) });`,
		);
	}
	if (CSS_LANGS_RE.test(specifier)) {
		// A plain stylesheet import is side-effect only outside the browser.
		return createDataUriModule(`export default undefined;`);
	}
	if (KNOWN_ASSET_RE.test(specifier)) {
		return createDataUriModule(`export default "";`);
	}
	return undefined;
}
