import { describe, expect, it } from "vitest";
import type { CleanupResult } from "./cleanup";
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
		const cleanupRow = async (
			_model: string,
			row: TestRow,
		): Promise<CleanupResult> => {
			deletedRowIds.push(row.id);
			return "complete";
		};

		trackedRows = await cleanupRows(trackedRows, cleanupRow);
		trackedRows = await cleanupRows(trackedRows, cleanupRow);

		expect(deletedRowIds).toEqual(["user-1", "user-2"]);
		expect(trackedRows).toEqual({});
	});

	it("retries only rows whose deletion failed", async () => {
		const attemptedRowIds: string[] = [];
		let secondRowFails = true;
		let trackedRows: Record<string, TestRow[]> = {
			user: [{ id: "user-1" }, { id: "user-2" }, { id: "user-3" }],
		};
		const cleanupRow = async (
			_model: string,
			row: TestRow,
		): Promise<CleanupResult> => {
			attemptedRowIds.push(row.id);
			if (row.id === "user-2" && secondRowFails) {
				secondRowFails = false;
				throw new Error("Temporary delete failure");
			}
			return "complete";
		};

		trackedRows = await cleanupRows(trackedRows, cleanupRow);

		expect(trackedRows).toEqual({ user: [{ id: "user-2" }] });

		trackedRows = await cleanupRows(trackedRows, cleanupRow);

		expect(attemptedRowIds).toEqual(["user-1", "user-2", "user-3", "user-2"]);
		expect(trackedRows).toEqual({});
	});

	it("retains rows explicitly marked for retry", async () => {
		let modelAvailable = false;
		let trackedRows: Record<string, TestRow[]> = {
			customModel: [{ id: "custom-1" }],
		};
		const cleanupRow = async (): Promise<CleanupResult> =>
			modelAvailable ? "complete" : "retry";

		trackedRows = await cleanupRows(trackedRows, cleanupRow);

		expect(trackedRows).toEqual({ customModel: [{ id: "custom-1" }] });

		modelAvailable = true;
		trackedRows = await cleanupRows(trackedRows, cleanupRow);

		expect(trackedRows).toEqual({});
	});
});
