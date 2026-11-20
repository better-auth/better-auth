import type { HostKind } from "../utils/host";
import { classifyHost } from "../utils/host";

/** An address a host name resolved to. */
export interface ResolvedHostAddress {
	address: string;
	family: 4 | 6;
}

/**
 * Outcome of {@link classifyResolvedHost}. Check `status` to narrow it.
 *
 * - `public`: every address is publicly routable. `addresses` is never empty
 *   and keeps the resolver's order, so the first entry is the one a connection
 *   would try.
 * - `non-public`: the host is not publicly routable, and `kind` says why.
 *   `address` is present only when the host resolved to a non-public address,
 *   and then holds the first offending one from the DNS answer. It is absent
 *   when the host as written was rejected, which is the case for an IP literal
 *   and for a name that {@link classifyHost} rejects, such as `localhost`.
 *   Such a name is reported without a lookup.
 * - `unresolved`: the lookup failed or returned no address. `error` holds the
 *   lookup error or the abort reason, and is absent when the answer was empty.
 * - `no-resolver`: the runtime has no working DNS lookup, such as Cloudflare
 *   Workers. Nothing was resolved.
 */
export type ResolvedHostClassification =
	| {
			status: "public";
			addresses: [ResolvedHostAddress, ...ResolvedHostAddress[]];
	  }
	| { status: "non-public"; kind: HostKind; address?: string }
	| { status: "unresolved"; error?: unknown }
	| { status: "no-resolver" };

export interface ClassifyResolvedHostOptions {
	/** Bounds the DNS lookup. An abort reports `unresolved` with the abort reason. */
	signal?: AbortSignal;
}

const UNENV_LOOKUP_STUB = "[unenv] dns.lookup is not implemented yet!";

/**
 * The runtime exposes a `lookup` that exists but is a stub, as on Cloudflare
 * Workers. Runtimes that set the error code are matched by it. The unenv
 * polyfill that Workers and Nitro use throws a plain `Error` without a code,
 * so its exact stub message is matched too. A broader message match would
 * report an ordinary lookup failure as a missing resolver.
 */
function isResolverUnavailable(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return (
		(error as { code?: unknown }).code === "ERR_METHOD_NOT_IMPLEMENTED" ||
		error.message === UNENV_LOOKUP_STUB
	);
}

function rejectOnAbort(signal: AbortSignal): {
	promise: Promise<never>;
	dispose: () => void;
} {
	let dispose = () => {};
	const promise = new Promise<never>((_, reject) => {
		// A listener added after the abort never fires.
		if (signal.aborted) {
			reject(signal.reason);
			return;
		}
		const onAbort = () => reject(signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
		dispose = () => signal.removeEventListener("abort", onAbort);
	});
	return { promise, dispose };
}

/**
 * Resolve a host name and classify every address it resolves to, so a caller
 * can require that all of them are publicly routable before a server-side
 * request. Classification follows {@link classifyHost}.
 *
 * An IP literal is classified without a lookup, and a public one is returned
 * in its canonical form, which is safe to connect to. A host name is resolved with
 * `node:dns/promises` using `{ all: true, verbatim: true }`, so `addresses`
 * keeps the resolver's order and a caller can pin the connection to the first
 * entry.
 *
 * This function never decides policy. Each caller maps the result. A caller
 * that wants the request to surface its own network error can proceed on
 * `unresolved`, while a caller guarding a URL a client registered can reject
 * it, because a name server could fail the first query and answer the second
 * with an internal address. `no-resolver` means the host name could not be
 * resolved. It already passed {@link classifyHost}, so the caller decides
 * whether that check alone is enough.
 *
 * Residual risk: the check resolves the name once. A connection that resolves
 * it again, as the global `fetch` does, can receive a different answer, so a
 * DNS-rebinding name server can pass the check and then point the request at
 * an internal address. Connect to a returned address instead of the host name
 * where the runtime allows it, and restrict outbound traffic at the network
 * layer when the guarantee must be strict.
 *
 * @internal Shared by Better Auth packages; not a supported public API.
 * @param host - A host name or IP literal, without a port.
 *
 * @example
 * // Proceed only on `public`. Whether `unresolved` and `no-resolver` may
 * // proceed is the caller's policy, so each is handled explicitly.
 * const result = await classifyResolvedHost("idp.example.com");
 * switch (result.status) {
 *   case "public":
 *     // Connect to result.addresses[0] to avoid a second lookup.
 *     break;
 *   case "non-public":
 *     throw new Error(
 *       result.address
 *         ? `resolves to a non-public address (${result.address})`
 *         : "is not a public host",
 *     );
 *   case "unresolved":
 *     throw new Error("could not be resolved", { cause: result.error });
 *   case "no-resolver":
 *     throw new Error("cannot be checked on this runtime");
 * }
 */
export async function classifyResolvedHost(
	host: string,
	options: ClassifyResolvedHostOptions = {},
): Promise<ResolvedHostClassification> {
	const classification = classifyHost(host);
	if (classification.kind !== "public") {
		return { status: "non-public", kind: classification.kind };
	}
	if (classification.literal !== "fqdn") {
		return {
			status: "public",
			addresses: [
				{
					address: classification.canonical,
					family: classification.literal === "ipv6" ? 6 : 4,
				},
			],
		};
	}

	const { signal } = options;
	if (signal?.aborted) return { status: "unresolved", error: signal.reason };

	let dns: typeof import("node:dns/promises");
	try {
		dns = await import("node:dns/promises");
	} catch {
		return { status: "no-resolver" };
	}
	if (typeof dns.lookup !== "function") return { status: "no-resolver" };

	let abort: ReturnType<typeof rejectOnAbort> | undefined;
	let resolved: Array<{ address: string; family: number }>;
	try {
		const lookup = dns.lookup(host, { all: true, verbatim: true });
		// Created after the lookup call, so a synchronous throw cannot leave a
		// rejected abort promise that nothing awaits.
		abort = signal ? rejectOnAbort(signal) : undefined;
		resolved = await (abort ? Promise.race([lookup, abort.promise]) : lookup);
	} catch (error) {
		// The abort rejection shares this catch, and a caller can abort with any
		// error, so only a rejection from the lookup itself can mean a stub.
		const aborted = signal?.aborted === true && error === signal.reason;
		if (!aborted && isResolverUnavailable(error)) {
			return { status: "no-resolver" };
		}
		return { status: "unresolved", error };
	} finally {
		abort?.dispose();
	}
	const [first, ...rest] = resolved;
	if (!first) return { status: "unresolved" };

	for (const { address } of resolved) {
		const { kind } = classifyHost(address);
		if (kind !== "public") return { status: "non-public", kind, address };
	}
	const toEntry = ({ address, family }: (typeof resolved)[number]) => ({
		address,
		family: family === 6 ? (6 as const) : (4 as const),
	});
	return {
		status: "public",
		addresses: [toEntry(first), ...rest.map(toEntry)],
	};
}
