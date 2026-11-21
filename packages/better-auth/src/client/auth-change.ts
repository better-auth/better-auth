import type { Atom } from "nanostores";
import type { AuthQueryAtom } from "./query";

/**
 * Whether a change sets who is signed in or only updates their data.
 */
export type AuthChange = "identity" | "data";

type BeginAuthChange = (change: AuthChange) => () => Promise<void>;

const begins = new WeakMap<Atom, BeginAuthChange[]>();

/**
 * A session change made without a known session can only be a sign-in.
 */
export function classifyAuthChange(
	atoms: Record<string, Atom>,
	signals: readonly string[],
): AuthChange {
	if (!signals.includes("$sessionSignal")) return "data";
	const session = atoms.session as AuthQueryAtom<unknown> | undefined;
	return session?.value.data === null ? "identity" : "data";
}

/**
 * Call each returned `end` right before toggling `signal`.
 */
export function beginAuthChange(signal: Atom, change: AuthChange) {
	return (begins.get(signal) ?? []).map((begin) => begin(change));
}

/**
 * Returns whether an identity change is open, during which a signed-out
 * result may predate the new credentials.
 */
export function bindAuthChange<T>(
	signals: readonly Atom[],
	atom: AuthQueryAtom<T>,
	latest: () => Promise<unknown> | undefined,
) {
	let identities = 0;
	const begin = (change: AuthChange) => {
		if (change === "identity") {
			identities++;
			const current = atom.value;
			// A new identity makes missing data unknown again.
			if (current.data === null && !current.isPending) {
				atom.set({
					...current,
					isPending: true,
				});
			}
		}
		return async () => {
			if (change === "identity") identities--;
			// Wait for the refetch the caller's toggle starts, and for any request
			// that replaces it.
			await Promise.resolve();
			let request = latest();
			while (request) {
				await request;
				const next = latest();
				if (next === request) break;
				request = next;
			}
		};
	};
	for (const signal of signals) {
		begins.set(signal, [...(begins.get(signal) ?? []), begin]);
	}
	return () => identities > 0;
}
