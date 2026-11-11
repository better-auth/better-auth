import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as semver from "semver";

const PLATFORM_ENV = "better-auth.cli.cloudflare-env";

// Remote bindings are on by default from 4.36.0, and the option that turns them
// off arrived in 4.46.0.
const MIN_WRANGLER_VERSION = "4.46.0";

// Wrangler's precedence: each name is searched up from the directory first.
const WRANGLER_CONFIG_FILES = [
	"wrangler.json",
	"wrangler.jsonc",
	"wrangler.toml",
];

/**
 * `cloudflare:workers` is a Workers-runtime built-in module. The CLI loads
 * `auth.ts` with jiti, outside that runtime, so a config importing it would
 * crash. It is aliased to an inert stub whose named exports mirror the real
 * module so every import links.
 *
 * Like the SvelteKit stubs, these are *named* exports that must exist at link
 * time, so the surface is enumerated by hand. The list mirrors workerd's
 * `cloudflare:workers` re-export module: the entrypoint/RPC classes are real
 * classes (so `extends` works), and the value/helper exports are recursive
 * proxies that absorb any access (so `env.MY_BINDING.get()` does not throw).
 *
 * `env` resolves to Wrangler's local bindings when they are loaded (see
 * `loadCloudflarePlatformEnv`), and to the stub otherwise.
 *
 * `cloudflare:test` is intentionally NOT stubbed: it is a different module with
 * a different surface, provided only by `@cloudflare/vitest-pool-workers` for
 * test runs, and an auth config never imports it.
 *
 * @see https://github.com/cloudflare/workerd/blob/main/src/cloudflare/workers.ts
 */

const createModule = () => {
	const moduleSource = `
const createStub = (label) => {
  const handler = {
    get(_, prop) {
      if (prop === "toString") return () => label;
      if (prop === "valueOf") return () => label;
      if (prop === Symbol.toPrimitive) return () => label;
      if (prop === Symbol.toStringTag) return "Object";
      if (prop === "then") return undefined;
      return createStub(label + "." + String(prop));
    },
    apply() {
      return createStub(label + "()");
    },
    construct() {
      return createStub(label + "#instance");
    },
  };
  return new Proxy(function () {}, handler);
};

class WorkerEntrypoint {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}
class DurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}
class WorkflowEntrypoint {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}
class RpcTarget {}
class RpcStub {}
class RpcPromise {}
class RpcProperty {}
class ServiceStub {}

// Bindings load before the config imports this module.
const env = globalThis[Symbol.for("${PLATFORM_ENV}")] ?? createStub("env");
const exportsStub = createStub("exports");
const cache = createStub("cache");
const tracing = createStub("tracing");
const withEnv = createStub("withEnv");
const withExports = createStub("withExports");
const withEnvAndExports = createStub("withEnvAndExports");
const waitUntil = createStub("waitUntil");
const abortIsolate = createStub("abortIsolate");

export {
  WorkerEntrypoint,
  DurableObject,
  WorkflowEntrypoint,
  RpcTarget,
  RpcStub,
  RpcPromise,
  RpcProperty,
  ServiceStub,
  env,
  exportsStub as exports,
  cache,
  tracing,
  withEnv,
  withExports,
  withEnvAndExports,
  waitUntil,
  abortIsolate,
};
// jiti dirty hack: .unknown
`;

	return `data:text/javascript;charset=utf-8,${encodeURIComponent(moduleSource)}`;
};

const CLOUDFLARE_STUB_MODULE = createModule();

export function addCloudflareVirtualModules(aliases: Record<string, string>) {
	if (!aliases["cloudflare:workers"]) {
		aliases["cloudflare:workers"] = CLOUDFLARE_STUB_MODULE;
	}
}

function findUp(name: string, dir: string): string | undefined {
	const file = path.join(dir, name);
	if (existsSync(file)) return file;
	const parent = path.dirname(dir);
	return parent === dir ? undefined : findUp(name, parent);
}

function findWranglerConfig(cwd: string) {
	for (const name of WRANGLER_CONFIG_FILES) {
		const file = findUp(name, cwd);
		if (file) return file;
	}
}

function resolveWrangler(cwd: string) {
	const require = createRequire(path.join(cwd, "package.json"));
	try {
		const { version } = require("wrangler/package.json") as { version: string };
		return {
			entry: require.resolve("wrangler"),
			version,
		};
	} catch {
		return null;
	}
}

/**
 * Binds `env` from `cloudflare:workers` to Wrangler's local bindings, so a
 * config that passes `env.DB` reads the same local D1 as `wrangler dev`.
 * Remote bindings stay off so schema commands never touch production. Bindings
 * load once per process, and the workerd process exits with the CLI. When
 * Wrangler can't load them, `env` stays a stub, so configs that don't need a
 * binding still load.
 *
 * @see https://developers.cloudflare.com/workers/wrangler/api/#getplatformproxy
 */
export async function loadCloudflarePlatformEnv(cwd: string) {
	if (Reflect.has(globalThis, Symbol.for(PLATFORM_ENV))) return;
	const configPath = findWranglerConfig(cwd);
	if (!configPath) return;
	const resolved = resolveWrangler(cwd);
	if (!resolved) return;
	if (!semver.satisfies(resolved.version, `>=${MIN_WRANGLER_VERSION}`)) {
		console.warn(
			`Wrangler ${resolved.version} can't keep remote bindings off, so \`env\` from \`cloudflare:workers\` stays a stub. Upgrade to Wrangler ${MIN_WRANGLER_VERSION} or later to read local bindings.`,
		);
		return;
	}
	const wrangler: typeof import("wrangler") = await import(
		pathToFileURL(resolved.entry).href
	);
	const proxy = await wrangler
		.getPlatformProxy({
			configPath,
			// Wrangler commands keep local state next to the config, while this API
			// resolves its default against the working directory.
			persist: {
				path: path.join(path.dirname(configPath), ".wrangler", "state", "v3"),
			},
			remoteBindings: false,
		})
		.catch((error: unknown) => {
			console.warn(
				`Couldn't read Wrangler's local bindings, so \`env\` from \`cloudflare:workers\` stays a stub: ${error instanceof Error ? error.message : String(error)}`,
			);
			return null;
		});
	if (!proxy) return;
	Reflect.set(globalThis, Symbol.for(PLATFORM_ENV), proxy.env);
}
