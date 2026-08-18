// @vitest-environment node
import type { ReadableAtom } from "nanostores";
import { atom } from "nanostores";
import { expect, it, vi } from "vitest";

// The octane base hooks require a render scope (they throw `missingSlot` when
// `slot === undefined && slotStack.length === 0`), so stub them to capture the
// slot arguments they receive and return sentinel values. This lets the test
// exercise the `useStore` binding + generated-hook forwarding without a full
// Octane component render.
const slotCapture = vi.fn((slot?: symbol) => slot);
vi.mock("octane", () => ({
	// `useStore` forwards `subSlot(slot, "ref"|"subscribe"|"external-store")` to
	// each base hook; capture every slot seen so we can assert it is non-empty
	// and distinct per tag.
	useRef: vi.fn((initial: unknown, slot?: symbol) => {
		slotCapture(slot);
		return { current: initial };
	}),
	useCallback: vi.fn(<F>(fn: F, _deps: unknown, slot?: symbol) => {
		slotCapture(slot);
		return fn;
	}),
	useSyncExternalStore: vi.fn(
		(_subscribe: unknown, getSnapshot: () => unknown, _gs: unknown, slot?: symbol) => {
			slotCapture(slot);
			return getSnapshot();
		},
	),
}));

// Import after mocks so the octane module resolves to the stub above.
import { createAuthClient as createOctaneClient } from "./octane";

it("should call '/api/auth' for octane client", async () => {
	const customFetchImpl = vi.fn(async (url: string | Request | URL) => {
		new URL(url as string); // asserts the path is fully resolved
		expect(new URL(url as string).pathname).toBe("/api/auth/get-session");
		expect(new URL(url as string).origin).toBe("http://localhost:3000");
		return new Response();
	});
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	// use DisposableStack when Node.js 24 is the minimum requirement
	using _ = {
		[Symbol.dispose]() {
			process.env.BETTER_AUTH_URL = undefined;
		},
	};
	const client = createOctaneClient({
		fetchOptions: {
			customFetchImpl,
		},
	});
	await client.getSession();
	expect(customFetchImpl).toBeCalled();
});

it("generated hooks forward the compiler-appended slot to useStore's base hooks", async () => {
	// A plugin with an atom exposes a generated `useX` hook. The octane compiler
	// wraps each `client.useX(...)` call site in `withSlot(sym, hook, ...args,
	// sym)`, so the wrapper receives a trailing per-call-site Symbol.
	const client = createOctaneClient({
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl: async () => new Response(),
		},
		plugins: [
			{
				id: "slot-probe" as const,
				getAtoms() {
					const $probe = atom(0);
					return { probeAtom: $probe as ReadableAtom<number> };
				},
			},
		],
	});

	// Simulate the compiled call site: `client.useProbeAtom(sym)`.
	const callSiteSlot = Symbol.for("test:probe-call-site");
	(client as unknown as { useProbeAtom: (slot?: symbol) => unknown })
		.useProbeAtom(callSiteSlot);

	// `useStore` derives stable child slots from the forwarded slot via
	// `subSlot(slot, "ref"|"subscribe"|"external-store")`; each base hook must
	// therefore receive a NON-undefined slot derived from `callSiteSlot`.
	const seenSlots = slotCapture.mock.results.map((r) => r.value);
	expect(seenSlots.length).toBeGreaterThanOrEqual(3);
	for (const seen of seenSlots) {
		expect(typeof seen).toBe("symbol");
		// `subSlot` mints `Symbol.for((slot.description ?? "") + ":" + tag)`, so
		// every child slot's description must carry the call-site slot's prefix.
		expect((seen as symbol).description ?? "").toContain(
			callSiteSlot.description,
		);
	}
});
