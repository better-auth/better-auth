import type { AuthContext } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { describe, expect, it, vi } from "vitest";
import { getOrgAdapter } from "./adapter";

type Row = Record<string, unknown>;
type Where = { field: string; value: unknown; operator?: string }[];

/**
 * Mimics Postgres: after a failed statement every later statement in the
 * same transaction fails with 25P02 until the transaction ends.
 */
function createAbortingAdapter(
	insertError: Error | null,
	opts: {
		transaction?: boolean;
		failIncrement?: (args: { where: Where }) => Error | undefined;
	} = {},
) {
	const transactional = opts.transaction ?? true;
	const logger = { error: vi.fn() };
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
			const failure = opts.failIncrement?.(args);
			if (failure) throw failure;
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
			if (!insertError) {
				const row = { id: "tm-new", ..._args.data };
				teamMembers.push(row);
				return row;
			}
			aborted = transactional;
			if (racingRow) teamMembers.push(racingRow);
			throw insertError;
		},
	};
	const adapter = {
		...trx,
		options: { adapterConfig: { transaction: transactional } },
		async transaction<R>(cb: (t: typeof trx) => Promise<R>) {
			const snapshot = team.memberCount;
			try {
				return await cb(trx);
			} catch (error) {
				if (transactional) team.memberCount = snapshot;
				throw error;
			} finally {
				aborted = false;
			}
		},
	};
	return {
		team,
		logger,
		adapter,
		raceWith(row: Row) {
			racingRow = row;
		},
		orgAdapter: getOrgAdapter({
			adapter: adapter as unknown as DBAdapter,
			logger,
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

	describe("without transactions", () => {
		const insertFailure = Object.assign(new Error("insert failed"), {
			code: "40P01",
		});

		it("rejects when a step after the insert fails", async () => {
			const counterError = new Error("counter failed");
			const { orgAdapter } = createAbortingAdapter(null, {
				transaction: false,
				failIncrement: ({ where }) =>
					where.every((w) => !w.operator) ? counterError : undefined,
			});
			await expect(orgAdapter.findOrCreateTeamMember(data)).rejects.toBe(
				counterError,
			);
		});

		it("releases the seat after a failed insert and keeps the insert error", async () => {
			const { orgAdapter, team } = createAbortingAdapter(insertFailure, {
				transaction: false,
			});
			await expect(
				orgAdapter.addTeamMemberWithLimit({
					...data,
					maximumMembersPerTeam: 5,
				}),
			).rejects.toBe(insertFailure);
			expect(team.memberCount).toBe(0);
		});

		it("logs a failed seat release without hiding the insert error", async () => {
			const releaseError = new Error("release failed");
			const { orgAdapter, logger } = createAbortingAdapter(insertFailure, {
				transaction: false,
				failIncrement: ({ where }) =>
					where.some((w) => w.operator === "gte") ? releaseError : undefined,
			});
			await expect(
				orgAdapter.addTeamMemberWithLimit({
					...data,
					maximumMembersPerTeam: 5,
				}),
			).rejects.toBe(insertFailure);
			expect(logger.error).toHaveBeenCalledWith(
				expect.stringContaining("release team seat"),
				releaseError,
			);
		});
	});
});
