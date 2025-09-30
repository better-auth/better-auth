export function ensureUTC(date: Date): Date {
	const utcTimestamp = Date.UTC(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
		date.getHours(),
		date.getMinutes(),
		date.getSeconds(),
		date.getMilliseconds(),
	);

	return new Date(utcTimestamp);
}
