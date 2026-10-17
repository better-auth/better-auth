/**
 * SvelteKit exposes virtual runtime modules (`$env/*`, `$app/*`,
 * `$service-worker`) that exist only while its Vite plugin runs. The CLI loads
 * `auth.ts` with jiti, outside Vite, so a config importing them would crash the
 * loader. Each is aliased to an inert stub.
 *
 * The stubs are injected unconditionally — a non-SvelteKit config never imports
 * them, so the unused aliases are harmless, and it keeps this free of project
 * detection. Real path aliases (`$lib` and any `kit.alias`) are deliberately
 * NOT handled here: `svelte-kit sync` writes them into `.svelte-kit/tsconfig.json`,
 * which the tsconfig `paths` matcher in `get-config.ts` resolves.
 *
 * Why the export surface is enumerated by hand: these are *named* exports, and
 * ESM requires every imported name to exist at link time, so an opaque or
 * wildcard stub is impossible. (Vite asset imports are default-export and so
 * can be matched by rule in `vite-virtual-modules.ts`; a static analyzer can
 * ignore these opaquely because it never runs the module — we do, so we have to
 * provide runnable exports.) The shapes mirror SvelteKit's public, documented
 * surface, which is the stable contract; the internal `__sveltekit/*` virtual
 * modules the real files depend on are not, which is why we stub `$app/*`
 * directly rather than resolving SvelteKit's on-disk files.
 *
 * The one exception is `$app/env/{private,public}` (explicit environment
 * variables): their exports are arbitrary names declared in the project's
 * `src/env.ts`, so they cannot be enumerated. They are stubbed with a Proxy
 * default export instead — see `createExplicitEnvModule`.
 *
 * The authoritative export surfaces this mirrors:
 *
 * @see https://github.com/sveltejs/kit/tree/main/packages/kit/src/runtime/app
 * @see https://github.com/sveltejs/kit/blob/main/packages/kit/src/types/ambient.d.ts
 */

export function addSvelteKitVirtualModules(aliases: Record<string, string>) {
	// `$env/*` carry real values (the process env), unlike the inert `$app/*`.
	// Public/private split assumes SvelteKit's default `PUBLIC_` prefix; a custom
	// `kit.env.publicPrefix`/`privatePrefix` is not read here (it would require
	// parsing svelte.config). The values do not affect schema generation, so a
	// custom prefix only changes which `env.*` reads resolve, not the output.
	aliases["$env/dynamic/private"] = createStubModule(
		createDynamicEnvModule("private"),
	);
	aliases["$env/dynamic/public"] = createStubModule(
		createDynamicEnvModule("public"),
	);
	aliases["$env/static/private"] = createStubModule(
		createStaticEnvModule(filterPrivateEnv("PUBLIC_", "")),
	);
	aliases["$env/static/public"] = createStubModule(
		createStaticEnvModule(filterPublicEnv("PUBLIC_", "")),
	);

	// `$app/env/{private,public}` are the explicit-environment-variables form
	// (SvelteKit 2.63+, opt-in via `experimental.explicitEnvironmentVariables`).
	// Unlike `$env/*`, their exports are *arbitrary* names declared in the
	// project's `src/env.ts`, and the public/private split comes from each var's
	// `public: true` config flag rather than a prefix. Since the CLI does not
	// parse `src/env.ts`, the names cannot be enumerated; a Proxy default export
	// resolves any imported name to its `process.env` value instead. Both
	// specifiers share one body: the keys are disjoint by config, so exposing
	// the whole env to each is harmless and the values do not affect schema
	// generation (same rationale as the inert `$app/*` stubs below).
	const explicitEnvStub = createStubModule(createExplicitEnvModule());
	aliases["$app/env/private"] = explicitEnvStub;
	aliases["$app/env/public"] = explicitEnvStub;

	for (const [id, body] of Object.entries(appModuleStubs)) {
		aliases[id] = createStubModule(body);
	}
}

/**
 * `$app/env` is SvelteKit's alias for `$app/environment` with an identical
 * export surface, so both specifiers share this body.
 * @see https://github.com/sveltejs/kit/pull/15934
 */
const environmentStub = `
export const browser = false;
export const building = false;
export const dev = false;
export const version = "";
`;

/**
 * Specifier → module source for the inert `$app/*` and `$service-worker`
 * stubs. The bodies do nothing (the CLI never serves a request); they exist
 * only so every name a config might import resolves. Keep each entry aligned
 * with SvelteKit's documented exports.
 * @see https://svelte.dev/docs/kit/$app-environment
 * @see https://svelte.dev/docs/kit/$app-server
 * @see https://svelte.dev/docs/kit/$service-worker
 */
const appModuleStubs: Record<string, string> = {
	"$app/environment": environmentStub,
	"$app/env": environmentStub,
	"$app/server": `
export function getRequestEvent() {}
export function read() {}
export function query() {}
export function prerender() {}
export function command() {}
export function form() {}
export const requested = false;
`,
	"$app/paths": `
export const base = "";
export const assets = "";
export function resolve(path) { return path; }
export function resolveRoute(path) { return path; }
export function asset(value) { return value; }
export async function match() { return null; }
`,
	"$app/navigation": `
export function goto() {}
export function invalidate() {}
export function invalidateAll() {}
export function preloadData() {}
export function preloadCode() {}
export function beforeNavigate() {}
export function afterNavigate() {}
export function onNavigate() {}
export function disableScrollHandling() {}
export function pushState() {}
export function replaceState() {}
export function refreshAll() {}
`,
	"$app/state": `
export const page = {};
export const navigating = {};
export const updated = { check() { return Promise.resolve(false); } };
`,
	"$app/stores": `
export const page = { subscribe() { return () => {}; } };
export const navigating = { subscribe() { return () => {}; } };
export const updated = { subscribe() { return () => {}; }, check() { return Promise.resolve(false); } };
export function getStores() { return { page, navigating, updated }; }
`,
	"$app/forms": `
export function applyAction() {}
export function deserialize() {}
export function enhance() {}
`,
	"$service-worker": `
export const base = "";
export const build = [];
export const files = [];
export const prerendered = [];
export const version = "";
`,
};

/**
 * Wraps a module body as a `data:` URI for use as a jiti alias target. The
 * trailing marker is load-bearing: without an "extension", jiti resolves the
 * alias value as a file path and fails with ENOENT, so the comment gives it an
 * unknown extension and forces a native import instead. (Stubs injected by the
 * Babel plugin in `vite-virtual-modules.ts` set the specifier directly and do
 * not go through alias resolution, so they need no marker.)
 */
function createStubModule(body: string): string {
	const source = `${body}\n// jiti dirty hack: .unknown\n`;
	return `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
}

function createStaticEnvModule(env: Record<string, string>) {
	return Object.keys(env)
		.filter((k) => validIdentifier.test(k) && !reserved.has(k))
		.map((k) => `export const ${k} = ${JSON.stringify(env[k])};`)
		.join("\n");
}

function createDynamicEnvModule(visibility: "public" | "private") {
	// Mirror SvelteKit: `public` exposes only PUBLIC_-prefixed vars, `private`
	// exposes the rest. Kept as a live view over process.env so values loaded
	// from .env files after this module is built are still visible.
	const predicate =
		visibility === "public"
			? `key.startsWith("PUBLIC_")`
			: `!key.startsWith("PUBLIC_")`;
	return `
const keep = (key) => typeof key === "string" && ${predicate};
export const env = new Proxy(
  {},
  {
    get: (_, key) => (keep(key) ? process.env[key] : undefined),
    has: (_, key) => keep(key) && key in process.env,
    ownKeys: () => Object.keys(process.env).filter(keep),
    getOwnPropertyDescriptor: (_, key) =>
      keep(key) && key in process.env
        ? { value: process.env[key], enumerable: true, configurable: true }
        : undefined,
  },
);`;
}

/**
 * Body for the explicit `$app/env/{private,public}` modules. Their exports are
 * named after the vars declared in `src/env.ts`, which the CLI cannot know, so
 * unlike the other stubs this cannot enumerate them. A Proxy exported as the
 * *default* sidesteps that: jiti compiles `import { FOO } from "..."` to a
 * member access on the (interop) default, which the Proxy answers from
 * process.env. No prefix filtering — the public/private split is a `src/env.ts`
 * config concern that does not affect schema generation.
 */
function createExplicitEnvModule() {
	return `
export default new Proxy(
  {},
  {
    get: (_, key) =>
      typeof key === "string" ? process.env[key] : undefined,
    has: (_, key) => typeof key === "string" && key in process.env,
    ownKeys: () => Object.keys(process.env),
    getOwnPropertyDescriptor: (_, key) =>
      typeof key === "string" && key in process.env
        ? { value: process.env[key], enumerable: true, configurable: true }
        : undefined,
  },
);`;
}

function filterPrivateEnv(publicPrefix: string, privatePrefix: string) {
	return Object.fromEntries(
		Object.entries(process.env).filter(
			([k]) =>
				k.startsWith(privatePrefix) &&
				(publicPrefix === "" || !k.startsWith(publicPrefix)),
		),
	) as Record<string, string>;
}

function filterPublicEnv(publicPrefix: string, privatePrefix: string) {
	return Object.fromEntries(
		Object.entries(process.env).filter(
			([k]) =>
				k.startsWith(publicPrefix) &&
				(privatePrefix === "" || !k.startsWith(privatePrefix)),
		),
	) as Record<string, string>;
}

const validIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const reserved = new Set([
	"do",
	"if",
	"in",
	"for",
	"let",
	"new",
	"try",
	"var",
	"case",
	"else",
	"enum",
	"eval",
	"null",
	"this",
	"true",
	"void",
	"with",
	"await",
	"break",
	"catch",
	"class",
	"const",
	"false",
	"super",
	"throw",
	"while",
	"yield",
	"delete",
	"export",
	"import",
	"public",
	"return",
	"static",
	"switch",
	"typeof",
	"default",
	"extends",
	"finally",
	"package",
	"private",
	"continue",
	"debugger",
	"function",
	"arguments",
	"interface",
	"protected",
	"implements",
	"instanceof",
]);
