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

	if (utcTimestamp === date.getTime()) {
		return date;
	}

	return new Date(utcTimestamp);
}
