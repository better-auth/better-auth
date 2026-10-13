/**
 * Whether a Drizzle column stores its value as a string and passes it to the
 * driver unchanged, such as `timestamp({ mode: "string" })` or SQLite `text()`.
 * Drizzle 0.x names that data type `"string"`, and 1.x names it `"string ..."`,
 * for example `"string timestamp"`.
 */
function isStringColumn(column: unknown): boolean {
	const dataType = (column as { dataType?: unknown } | undefined)?.dataType;
	return typeof dataType === "string" && dataType.split(" ")[0] === "string";
}

/**
 * Converts a `Date` bound for a string column, or each `Date` in an `in` /
 * `not_in` list, into the UTC text Drizzle's own date mode writes: ISO 8601,
 * or `YYYY-MM-DD HH:MM:SS.mmm` for MySQL, which rejects the `T` and `Z`.
 * Other values are returned unchanged.
 */
export function toDriverDate(
	value: unknown,
	column: unknown,
	provider: "pg" | "mysql" | "sqlite",
): unknown {
	if (!isStringColumn(column)) return value;
	const format = (item: unknown) => {
		if (!(item instanceof Date)) return item;
		const iso = item.toISOString();
		return provider === "mysql" ? iso.replace("T", " ").replace("Z", "") : iso;
	};
	return Array.isArray(value) ? value.map(format) : format(value);
}

const DATE_TIME_WITHOUT_OFFSET =
	/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

/**
 * Reads a date column value. A date-time string without an offset is UTC,
 * since that is how `toDriverDate` and Drizzle's date mode write it.
 */
export function fromDriverDate(value: string | number | Date): Date {
	if (typeof value === "string" && DATE_TIME_WITHOUT_OFFSET.test(value)) {
		return new Date(`${value.replace(" ", "T")}Z`);
	}
	return new Date(value);
}
