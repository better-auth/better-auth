import { describe, expect, it } from "vitest";
import { cleanupRows } from "./cleanup";

type TestRow = {
	id: string;
};

describe("cleanupRows", () => {
	it("does not retry rows that were deleted successfully", async () => {
		const deletedRowIds: string[] = [];
		let trackedRows: Record<string, TestRow[]> = {
			user: [{ id: "user-1" }, { id: "user-2" }],
		};
		const deleteRow = async (_model: string, row: TestRow) => {
			deletedRowIds.push(row.id);
		};

		trackedRows = await cleanupRows(trackedRows, deleteRow);
		trackedRows = await cleanupRows(trackedRows, deleteRow);

		expect(deletedRowIds).toEqual(["user-1", "user-2"]);
		expect(trackedRows).toEqual({});
	});

	it("retries only rows whose deletion failed", async () => {
		const attemptedRowIds: string[] = [];
		let secondRowFails = true;
		let trackedRows: Record<string, TestRow[]> = {
			user: [{ id: "user-1" }, { id: "user-2" }, { id: "user-3" }],
		};
		const deleteRow = async (_model: string, row: TestRow) => {
			attemptedRowIds.push(row.id);
			if (row.id === "user-2" && secondRowFails) {
				secondRowFails = false;
				throw new Error("Temporary delete failure");
			}
		};

		trackedRows = await cleanupRows(trackedRows, deleteRow);

		expect(trackedRows).toEqual({ user: [{ id: "user-2" }] });

		trackedRows = await cleanupRows(trackedRows, deleteRow);

		expect(attemptedRowIds).toEqual(["user-1", "user-2", "user-3", "user-2"]);
		expect(trackedRows).toEqual({});
	});
});
