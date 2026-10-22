import type { AuthContext } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { describe, expect, it } from "vitest";
import { getOrgAdapter } from "./adapter";

type Row = Record<string, unknown>;
type Where = { field: string; value: unknown; operator?: string }[];

/**
 * Mimics Postgres: after a failed statement every later statement in the
 * same transaction fails with 25P02 until the transaction ends.
 */
function createAbortingAdapter(insertError: Error) {
	const teamMembers: Row[] = [];
	const team: Row = { id: "team-1", memberCount: 0 };
	let aborted = false;
	let racingRow: Row | undefined;

	const guard = () => {
		if (aborted) {
			throw Object.assign(
				new Error("current transaction is aborted, commands ignored"),
				{ code: "25P02" },
			);
		}
	};
	const matches = (row: Row, where: Where) =>
		where.every((w) => row[w.field] === w.value);

	const trx = {
		async findOne<T>(args: { model: string; where: Where }) {
			guard();
			if (args.model !== "teamMember") return null;
			return (teamMembers.find((r) => matches(r, args.where)) ?? null) as T;
		},
		async count() {
			guard();
			return teamMembers.length;
		},
		async incrementOne<T>(args: {
			where: Where;
			increment: Record<string, number>;
			set?: Record<string, unknown>;
		}) {
			guard();
			const limit = args.where.find((w) => w.operator === "lt");
			const gte = args.where.find((w) => w.operator === "gte");
			const current = team.memberCount as number;
			if (limit && !(current < (limit.value as number))) return null;
			if (gte && !(current >= (gte.value as number))) return null;
			team.memberCount = current + (args.increment.memberCount ?? 0);
			return team as T;
		},
		async create(_args: { model: string; data: Row }) {
			guard();
			aborted = true;
			if (racingRow) teamMembers.push(racingRow);
			throw insertError;
		},
	};
	const adapter = {
		...trx,
		options: { adapterConfig: { transaction: true } },
		async transaction<R>(cb: (t: typeof trx) => Promise<R>) {
			const snapshot = team.memberCount;
			try {
				return await cb(trx);
			} catch (error) {
				team.memberCount = snapshot;
				throw error;
			} finally {
				aborted = false;
			}
		},
	};
	return {
		team,
		adapter,
		raceWith(row: Row) {
			racingRow = row;
		},
		orgAdapter: getOrgAdapter({
			adapter: adapter as unknown as DBAdapter,
		} as unknown as AuthContext),
	};
}

/**
 * @see https://github.com/better-auth/better-auth/issues/11947
 */
describe("team member insert failure inside an aborted transaction", () => {
	const data = { teamId: "team-1", userId: "user-1" };

	it("returns the existing member when a concurrent add wins the insert", async () => {
		const unique = Object.assign(new Error("duplicate key"), {
			code: "23505",
		});
		const { orgAdapter, raceWith } = createAbortingAdapter(unique);
		raceWith({ id: "tm-1", ...data, membershipKey: "k" });
		await expect(
			orgAdapter.findOrCreateTeamMember(data),
		).resolves.toMatchObject({ id: "tm-1", ...data });
	});

	it("returns the existing member on the limit path and keeps the seat count", async () => {
		const unique = Object.assign(new Error("duplicate key"), {
			code: "23505",
		});
		const { orgAdapter, raceWith, team } = createAbortingAdapter(unique);
		raceWith({ id: "tm-1", ...data, membershipKey: "k" });
		await expect(
			orgAdapter.addTeamMemberWithLimit({ ...data, maximumMembersPerTeam: 5 }),
		).resolves.toMatchObject({ status: "added", member: { id: "tm-1" } });
		expect(team.memberCount).toBe(0);
	});

	it("surfaces the original insert error instead of 25P02", async () => {
		const deadlock = Object.assign(new Error("deadlock detected"), {
			code: "40P01",
		});
		const { orgAdapter } = createAbortingAdapter(deadlock);
		await expect(orgAdapter.findOrCreateTeamMember(data)).rejects.toBe(
			deadlock,
		);
	});

	it("surfaces the original insert error on the limit path", async () => {
		const deadlock = Object.assign(new Error("deadlock detected"), {
			code: "40P01",
		});
		const { orgAdapter } = createAbortingAdapter(deadlock);
		await expect(
			orgAdapter.addTeamMemberWithLimit({ ...data, maximumMembersPerTeam: 5 }),
		).rejects.toBe(deadlock);
	});
});
