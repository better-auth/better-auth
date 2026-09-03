export type RowsByModel<Row> = Record<string, Row[]>;

export async function cleanupRows<Row>(
	trackedRows: Readonly<Record<string, readonly Row[]>>,
	deleteRow: (model: string, row: Row) => Promise<void>,
): Promise<RowsByModel<Row>> {
	const rowsToRetry: RowsByModel<Row> = {};

	for (const [model, rows] of Object.entries(trackedRows)) {
		const failedRows: Row[] = [];
		for (const row of rows) {
			try {
				await deleteRow(model, row);
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
