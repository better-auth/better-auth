import { BetterAuthError } from "@better-auth/core/error";
import type { DBTransactionAdapter, Where } from "better-auth";
import { describe, expect, it, vi } from "vitest";
import type { SCIMConnection } from "./configuration";
import {
	acquireSCIMGroupMutationLocks,
	markSCIMGroupsModified,
} from "./group-state";
import type { SCIMGroup } from "./persistence";

const connection: SCIMConnection = {
	id: "workforce",
	provisioningDomainId: "workspace-acme",
};

function createGroup(overrides: Partial<SCIMGroup> = {}): SCIMGroup {
	return {
		id: "group-a",
		connectionId: connection.id,
		provisioningDomainId: connection.provisioningDomainId,
		revision: 1,
		displayName: "Engineering",
		displayNameKey: "engineering",
		orderKey: "engineering",
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		...overrides,
	};
}

function clauseValue(where: Where[] | undefined, field: string) {
	return where?.find((clause) => clause.field === field)?.value;
}

function createDatabase(groups: SCIMGroup[]) {
	const incrementOne = vi.fn(async () => {
		throw new Error("acquireSCIMGroupMutationLocks should use incrementMany");
	});
	const incrementMany = vi.fn(
		async (input: Parameters<DBTransactionAdapter["incrementMany"]>[0]) => {
			const updated: SCIMGroup[] = [];
			for (const row of input.rows) {
				const groupId = clauseValue(row.where, "id");
				const revision = clauseValue(row.where, "revision");
				const group = groups.find((candidate) => candidate.id === groupId);
				if (!group || group.revision !== revision) continue;
				group.revision += input.increment.revision ?? 0;
				if (input.set) Object.assign(group, input.set);
				updated.push({ ...group });
			}
			return updated;
		},
	);
	const findMany = vi.fn(
		async (input: Parameters<DBTransactionAdapter["findMany"]>[0]) => {
			const ids = clauseValue(input.where, "id");
			const connectionId = clauseValue(input.where, "connectionId");
			const requestedIds: unknown[] = Array.isArray(ids) ? ids : [];
			return groups.filter(
				(group) =>
					requestedIds.includes(group.id) &&
					group.connectionId === connectionId,
			);
		},
	);

	return {
		findMany,
		incrementOne,
		incrementMany,
	} as unknown as DBTransactionAdapter & {
		findMany: typeof findMany;
		incrementOne: typeof incrementOne;
		incrementMany: typeof incrementMany;
	};
}

describe("acquireSCIMGroupMutationLocks", () => {
	it("locks every Group in one incrementMany", async () => {
		const groups = [
			createGroup({ id: "group-b", revision: 3 }),
			createGroup({ id: "group-a", revision: 1 }),
		];
		const database = createDatabase(groups);

		const locked = await acquireSCIMGroupMutationLocks(database, connection, [
			"group-b",
			"group-a",
			"group-b",
		]);

		expect(database.incrementOne).not.toHaveBeenCalled();
		expect(database.incrementMany).toHaveBeenCalledOnce();
		expect(database.incrementMany).toHaveBeenCalledWith({
			model: "scimGroup",
			increment: { revision: 1 },
			rows: [
				{
					where: [
						{ field: "id", value: "group-a" },
						{ field: "connectionId", value: "workforce" },
						{ field: "revision", value: 1 },
					],
				},
				{
					where: [
						{ field: "id", value: "group-b" },
						{ field: "connectionId", value: "workforce" },
						{ field: "revision", value: 3 },
					],
				},
			],
		});
		expect(locked.map((group) => group.id).sort()).toEqual([
			"group-a",
			"group-b",
		]);
		expect(groups.map((group) => group.revision).sort()).toEqual([2, 4]);
	});

	it("does not write when no Group ids are provided", async () => {
		const database = createDatabase([]);

		await expect(
			acquireSCIMGroupMutationLocks(database, connection, []),
		).resolves.toEqual([]);
		expect(database.findMany).not.toHaveBeenCalled();
		expect(database.incrementMany).not.toHaveBeenCalled();
	});

	it("treats a missing Group as a concurrent mutation", async () => {
		const database = createDatabase([createGroup({ id: "group-a" })]);

		await expect(
			acquireSCIMGroupMutationLocks(database, connection, [
				"group-a",
				"group-missing",
			]),
		).rejects.toBeInstanceOf(BetterAuthError);
		expect(database.incrementMany).not.toHaveBeenCalled();
	});

	it("treats a revision guard miss as a concurrent mutation", async () => {
		const groups = [
			createGroup({ id: "group-a", revision: 1 }),
			createGroup({ id: "group-b", revision: 1 }),
		];
		const database = createDatabase(groups);
		database.incrementMany.mockResolvedValueOnce([
			{ ...groups[0]!, revision: 2 },
		]);

		await expect(
			acquireSCIMGroupMutationLocks(database, connection, [
				"group-a",
				"group-b",
			]),
		).rejects.toBeInstanceOf(BetterAuthError);
	});
});

describe("markSCIMGroupsModified", () => {
	it("stamps every Group in one incrementMany", async () => {
		const groups = [
			createGroup({ id: "group-a", revision: 2 }),
			createGroup({ id: "group-b", revision: 4 }),
		];
		const database = createDatabase(groups);
		const updatedAt = new Date("2026-02-01T00:00:00.000Z");

		await markSCIMGroupsModified(database, connection.id, groups, updatedAt);

		expect(database.incrementOne).not.toHaveBeenCalled();
		expect(database.incrementMany).toHaveBeenCalledOnce();
		expect(database.incrementMany).toHaveBeenCalledWith({
			model: "scimGroup",
			increment: {},
			set: { updatedAt },
			rows: [
				{
					where: [
						{ field: "id", value: "group-a" },
						{ field: "connectionId", value: "workforce" },
						{ field: "revision", value: 2 },
					],
				},
				{
					where: [
						{ field: "id", value: "group-b" },
						{ field: "connectionId", value: "workforce" },
						{ field: "revision", value: 4 },
					],
				},
			],
		});
		expect(groups.every((group) => group.updatedAt === updatedAt)).toBe(true);
	});
});
