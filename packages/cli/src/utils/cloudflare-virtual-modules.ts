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

const env = createStub("env");
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
