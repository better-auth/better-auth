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
    apply(_, __, args) {
      return createStub(label + "()")
    },
    construct() {
      return createStub(label + "#instance");
    },
  };
  const fn = () => createStub(label + "()");
  return new Proxy(fn, handler);
};

class WorkerEntrypoint {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}

class DurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
}

class RpcTarget {
  constructor(value) {
    this.value = value;
  }
}

const RpcStub = RpcTarget;

const env = createStub("env");
const caches = createStub("caches");
const scheduler = createStub("scheduler");
const executionCtx = createStub("executionCtx");

export { DurableObject, RpcStub, RpcTarget, WorkerEntrypoint, caches, env, executionCtx, scheduler };

const defaultExport = {
  DurableObject,
  RpcStub,
  RpcTarget,
  WorkerEntrypoint,
  caches,
  env,
  executionCtx,
  scheduler,
};

export default defaultExport;
// jiti dirty hack: .unknown
`;

	return `data:text/javascript;charset=utf-8,${encodeURIComponent(moduleSource)}`;
};

const CLOUDFLARE_STUB_MODULE = createModule();

export function addCloudflareModules(
	aliases: Record<string, string>,
	_cwd?: string,
) {
	if (!aliases["cloudflare:workers"]) {
		aliases["cloudflare:workers"] = CLOUDFLARE_STUB_MODULE;
	}
	if (!aliases["cloudflare:test"]) {
		aliases["cloudflare:test"] = CLOUDFLARE_STUB_MODULE;
	}
}
