import { describe, expect, it } from "vitest";
import type { IncrementManyWhereClause } from "./increment-many";
import {
	assertUniqueIncrementManyIds,
	chunkIncrementManyRows,
	compareAdapterIds,
	findSensitiveIdEq,
	sortIncrementManyRows,
} from "./increment-many";

function idWhere(
	value: string | number,
	overrides: Partial<IncrementManyWhereClause> = {},
): IncrementManyWhereClause {
	return {
		field: "id",
		value,
		operator: "eq",
		connector: "AND",
		mode: "sensitive",
		...overrides,
	};
}

describe("incrementMany helpers", () => {
	it("requires exactly one case-sensitive id equality", () => {
		expect(() => findSensitiveIdEq([], "id")).toThrow(/case-sensitive `id`/);
		expect(() =>
			findSensitiveIdEq([idWhere("a", { mode: "insensitive" })], "id"),
		).toThrow(/case-sensitive `id`/);
		expect(() =>
			findSensitiveIdEq([idWhere("a", { operator: "gt" })], "id"),
		).toThrow(/case-sensitive `id`/);
		expect(findSensitiveIdEq([idWhere("a")], "id").value).toBe("a");
	});

	it("rejects duplicate ids", () => {
		expect(() =>
			assertUniqueIncrementManyIds(
				[{ where: [idWhere("a")] }, { where: [idWhere("a")] }],
				"id",
			),
		).toThrow(/duplicate ids/);
	});

	it("sorts numeric ids numerically and string ids by code unit", () => {
		expect(compareAdapterIds(10, 2)).toBeGreaterThan(0);
		expect(compareAdapterIds("id-2", "id-10")).toBeGreaterThan(0);
		expect(
			sortIncrementManyRows(
				[{ where: [idWhere("c")] }, { where: [idWhere("a")] }],
				"id",
			).map((row) => row.where[0]?.value),
		).toEqual(["a", "c"]);
	});

	it("chunks (id, revision) plus one increment bind to 499 under the SQLite 999 cap", () => {
		const rows = Array.from({ length: 1000 }, (_, index) => ({
			where: [
				idWhere(`id-${index}`),
				{
					field: "revision",
					value: index,
					operator: "eq" as const,
					connector: "AND" as const,
					mode: "sensitive" as const,
				},
			],
		}));
		const chunks = chunkIncrementManyRows(rows, {
			maxParameters: 999,
			assignmentBinds: 1,
		});
		expect(chunks.map((chunk) => chunk.length)).toEqual([499, 499, 2]);
	});

	it("shrinks (id, revision) chunks when increment and set also bind", () => {
		const rows = Array.from({ length: 1000 }, (_, index) => ({
			where: [
				idWhere(`id-${index}`),
				{
					field: "revision",
					value: index,
					operator: "eq" as const,
					connector: "AND" as const,
					mode: "sensitive" as const,
				},
			],
		}));
		const chunks = chunkIncrementManyRows(rows, {
			maxParameters: 999,
			assignmentBinds: 2,
		});
		expect(chunks.map((chunk) => chunk.length)).toEqual([498, 498, 4]);
	});

	it("keeps id-only increment chunks at or below 999 binds", () => {
		const rows = Array.from({ length: 1000 }, (_, index) => ({
			where: [idWhere(`id-${index}`)],
		}));
		const chunks = chunkIncrementManyRows(rows, {
			maxParameters: 999,
			assignmentBinds: 1,
		});
		expect(chunks.map((chunk) => chunk.length)).toEqual([998, 2]);
	});

	it("computes bindsPerRow without spreading into Math.max", () => {
		const rows = Array.from({ length: 200_000 }, (_, index) => ({
			where: [idWhere(`id-${index}`)],
		}));
		const chunks = chunkIncrementManyRows(rows, {
			maxParameters: 999,
			assignmentBinds: 1,
		});
		expect(chunks[0]).toHaveLength(998);
		expect(chunks.at(-1)).toHaveLength(200_000 % 998);
	});

	it("throws when one row cannot fit under maxParameters", () => {
		expect(() =>
			chunkIncrementManyRows(
				[
					{
						where: [
							idWhere("a"),
							{
								field: "revision",
								value: 1,
								operator: "eq",
								connector: "AND",
								mode: "sensitive",
							},
						],
					},
				],
				{ maxParameters: 2, assignmentBinds: 2 },
			),
		).toThrow(/cannot fit a row under maxParameters=2/);
	});
});
