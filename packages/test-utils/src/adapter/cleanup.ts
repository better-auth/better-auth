export type RowsByModel<Row> = Record<string, Row[]>;

export type CleanupResult = "complete" | "retry";

export async function cleanupRows<Row>(
	trackedRows: Readonly<Record<string, readonly Row[]>>,
	cleanupRow: (model: string, row: Row) => Promise<CleanupResult>,
): Promise<RowsByModel<Row>> {
	const rowsToRetry: RowsByModel<Row> = {};

	for (const [model, rows] of Object.entries(trackedRows)) {
		const failedRows: Row[] = [];
		for (const row of rows) {
			try {
				const result = await cleanupRow(model, row);
				if (result === "retry") {
					failedRows.push(row);
				}
			} catch {
				failedRows.push(row);
			}
		}
		if (failedRows.length > 0) {
			rowsToRetry[model] = failedRows;
		}
	}

	return rowsToRetry;
}
