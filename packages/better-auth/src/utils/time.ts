// Time constants (in milliseconds)
const SEC = 1000;
const MIN = SEC * 60;
const HOUR = MIN * 60;
const DAY = HOUR * 24;
const WEEK = DAY * 7;
const MONTH = DAY * 30;
const YEAR = DAY * 365.25;

// Unit type definitions
type Years = "years" | "year" | "yrs" | "yr" | "y";
type Months = "months" | "month" | "mo";
type Weeks = "weeks" | "week" | "w";
type Days = "days" | "day" | "d";
type Hours = "hours" | "hour" | "hrs" | "hr" | "h";
type Minutes = "minutes" | "minute" | "mins" | "min" | "m";
type Seconds = "seconds" | "second" | "secs" | "sec" | "s";
type Unit = Years | Months | Weeks | Days | Hours | Minutes | Seconds;
type UnitAnyCase = Capitalize<Unit> | Uppercase<Unit> | Unit;
type Suffix = " ago" | " from now";
type Prefix = "+" | "-" | "+ " | "- ";

// Base time string formats
type BaseTimeString = `${number}${UnitAnyCase}` | `${number} ${UnitAnyCase}`;

/**
 * A typed string representing a time duration.
 * Supports formats like "7d", "30m", "1 hour", "2 hours ago", "-5m", etc.
 */
export type TimeString =
	| BaseTimeString
	| `${BaseTimeString}${Suffix}`
	| `${Prefix}${BaseTimeString}`;

const REGEX =
	/^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|mo|years?|yrs?|y)(?: (ago|from now))?$/i;

function parse(value: string): number {
	const match = REGEX.exec(value);

	if (!match || (match[4] && match[1])) {
		throw new TypeError(
			`Invalid time string format: "${value}". Use formats like "7d", "30m", "1 hour", etc.`,
		);
	}

	const n = parseFloat(match[2]!);
	const unit = match[3]!.toLowerCase();

	let result: number;
	switch (unit) {
		case "years":
		case "year":
		case "yrs":
		case "yr":
		case "y":
			result = n * YEAR;
			break;
		case "months":
		case "month":
		case "mo":
			result = n * MONTH;
			break;
		case "weeks":
		case "week":
		case "w":
			result = n * WEEK;
			break;
		case "days":
		case "day":
		case "d":
			result = n * DAY;
			break;
		case "hours":
		case "hour":
		case "hrs":
		case "hr":
		case "h":
			result = n * HOUR;
			break;
		case "minutes":
		case "minute":
		case "mins":
		case "min":
		case "m":
			result = n * MIN;
			break;
		case "seconds":
		case "second":
		case "secs":
		case "sec":
		case "s":
			result = n * SEC;
			break;
		default:
			throw new TypeError(`Unknown time unit: "${unit}"`);
	}

	if (match[1] === "-" || match[4] === "ago") {
		return -result;
	}

	return result;
}

/**
 * Parse a time string and return the value in milliseconds.
 *
 * @param value - A time string like "7d", "30m", "1 hour", "2 hours ago"
 * @returns The parsed value in milliseconds
 * @throws TypeError if the string format is invalid
 *
 * @example
 * ms("1d")          // 86400000
 * ms("2 hours")     // 7200000
 * ms("30s")         // 30000
 * ms("2 hours ago") // -7200000
 */
export function ms(value: TimeString): number {
	return parse(value);
}

/**
 * Parse a time string and return the value in seconds.
 *
 * @param value - A time string like "7d", "30m", "1 hour", "2 hours ago"
 * @returns The parsed value in seconds (rounded)
 * @throws TypeError if the string format is invalid
 *
 * @example
 * sec("1d")          // 86400
 * sec("2 hours")     // 7200
 * sec("-30s")        // -30
 * sec("2 hours ago") // -7200
 */
export function sec(value: TimeString): number {
	return Math.round(parse(value) / 1000);
}
