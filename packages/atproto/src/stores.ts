import type {
	NodeSavedSession,
	NodeSavedSessionStore,
	NodeSavedState,
	NodeSavedStateStore,
} from "@atproto/oauth-client-node";

const STATE_TTL_MS = 10 * 60 * 1000;
const STATE_SWEEP_PROBABILITY = 0.01;

export interface AtprotoAdapter {
	findOne: (...args: any[]) => Promise<any>;
	create: (...args: any[]) => Promise<any>;
	update: (...args: any[]) => Promise<any>;
	delete: (...args: any[]) => Promise<any>;
	deleteMany: (...args: any[]) => Promise<any>;
}

export function createStateStore(adapter: AtprotoAdapter): NodeSavedStateStore {
	return {
		set: async (key: string, val: NodeSavedState) => {
			const now = new Date();
			const expiresAt = new Date(now.getTime() + STATE_TTL_MS);
			const data = { state: JSON.stringify(val), expiresAt };
			// Update-first → create-on-null → update-on-race-loss. The unique
			// constraint on `key` makes this race-safe: only one of two
			// concurrent creates can win, and the loser falls back to update.
			const updated = await adapter.update({
				model: "atprotoState",
				where: [{ field: "key", value: key }],
				update: data,
			});
			if (updated === null) {
				try {
					await adapter.create({
						model: "atprotoState",
						data: { key, ...data },
					});
				} catch {
					await adapter.update({
						model: "atprotoState",
						where: [{ field: "key", value: key }],
						update: data,
					});
				}
			}

			// Opportunistic sweep of expired rows.
			if (Math.random() < STATE_SWEEP_PROBABILITY) {
				await adapter.deleteMany({
					model: "atprotoState",
					where: [{ field: "expiresAt", operator: "lt", value: new Date() }],
				});
			}
		},
		get: async (key: string): Promise<NodeSavedState | undefined> => {
			const row = (await adapter.findOne({
				model: "atprotoState",
				where: [{ field: "key", value: key }],
			})) as { state: string; expiresAt: Date } | null;
			if (!row) return undefined;
			if (new Date(row.expiresAt) < new Date()) {
				await adapter.delete({
					model: "atprotoState",
					where: [{ field: "key", value: key }],
				});
				return undefined;
			}
			return JSON.parse(row.state) as NodeSavedState;
		},
		del: async (key: string) => {
			await adapter.delete({
				model: "atprotoState",
				where: [{ field: "key", value: key }],
			});
		},
	};
}

export function createSessionStore(
	adapter: AtprotoAdapter,
): NodeSavedSessionStore {
	return {
		set: async (sub: string, val: NodeSavedSession) => {
			const updatedAt = new Date();
			const data = { session: JSON.stringify(val), updatedAt };
			// Update-first → create-on-null → update-on-race-loss. The unique
			// constraint on `did` makes this race-safe across concurrent writers
			// (e.g. multi-instance deployments where NodeOAuthClient's per-DID
			// `requestLock` doesn't span processes).
			const updated = await adapter.update({
				model: "atprotoSession",
				where: [{ field: "did", value: sub }],
				update: data,
			});
			if (updated === null) {
				try {
					// userId is backfilled by the callback handler once it knows
					// which better-auth user this DID belongs to. Stored as null
					// (rather than empty string) to satisfy FK constraints.
					await adapter.create({
						model: "atprotoSession",
						data: { did: sub, ...data, userId: null },
					});
				} catch {
					await adapter.update({
						model: "atprotoSession",
						where: [{ field: "did", value: sub }],
						update: data,
					});
				}
			}
		},
		get: async (sub: string): Promise<NodeSavedSession | undefined> => {
			const row = (await adapter.findOne({
				model: "atprotoSession",
				where: [{ field: "did", value: sub }],
			})) as { session: string } | null;
			if (!row) return undefined;
			return JSON.parse(row.session) as NodeSavedSession;
		},
		del: async (sub: string) => {
			await adapter.delete({
				model: "atprotoSession",
				where: [{ field: "did", value: sub }],
			});
		},
	};
}
