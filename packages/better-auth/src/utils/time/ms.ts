// https://github.com/vercel/ms/blob/0d5ab182ef22686cb4086fe9b67b1276bcb644ef/src/index.ts
/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2025 Vercel, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
// Helpers.
const s = 1000;
const m = s * 60;
const h = m * 60;
const d = h * 24;
const w = d * 7;
const y = d * 365.25;

type Years = "years" | "year" | "yrs" | "yr" | "y";
type Weeks = "weeks" | "week" | "w";
type Days = "days" | "day" | "d";
type Hours = "hours" | "hour" | "hrs" | "hr" | "h";
type Minutes = "minutes" | "minute" | "mins" | "min" | "m";
type Seconds = "seconds" | "second" | "secs" | "sec" | "s";
type Milliseconds = "milliseconds" | "millisecond" | "msecs" | "msec" | "ms";
type Unit = Years | Weeks | Days | Hours | Minutes | Seconds | Milliseconds;

type UnitAnyCase = Capitalize<Unit> | Uppercase<Unit> | Unit;

export type StringValue =
	| `${number}`
	| `${number}${UnitAnyCase}`
	| `${number} ${UnitAnyCase}`;

interface Options {
	/**
	 * Set to `true` to use verbose formatting. Defaults to `false`.
	 */
	long?: boolean;
}

/**
 * Parse or format the given value.
 *
 * @param value - The string or number to convert
 * @param options - Options for the conversion
 * @throws Error if `value` is not a non-empty string or a number
 */
export function ms(value: StringValue, options?: Options): number;
export function ms(value: number, options?: Options): string;
export function ms(
	value: StringValue | number,
	options?: Options,
): number | string {
	if (typeof value === "string") {
		return parse(value);
	} else if (typeof value === "number") {
		return format(value, options);
	}
	throw new Error(
		`Value provided to ms() must be a string or number. value=${JSON.stringify(value)}`,
	);
}

/**
 * Parse the given string and return milliseconds.
 *
 * @param str - A string to parse to milliseconds
 * @returns The parsed value in milliseconds, or `NaN` if the string can't be
 * parsed
 */
export function parse(str: string): number {
	if (typeof str !== "string" || str.length === 0 || str.length > 100) {
		throw new Error(
			`Value provided to ms.parse() must be a string with length between 1 and 99. value=${JSON.stringify(str)}`,
		);
	}
	const match =
		/^(?<value>-?\d*\.?\d+) *(?<unit>milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
			str,
		);

	if (!match?.groups) {
		return NaN;
	}

	// Named capture groups need to be manually typed today.
	// https://github.com/microsoft/TypeScript/issues/32098
	const { value, unit = "ms" } = match.groups as {
		value: string;
		unit: string | undefined;
	};

	const n = parseFloat(value);

	const matchUnit = unit.toLowerCase() as Lowercase<Unit>;

	/* istanbul ignore next - istanbul doesn't understand, but thankfully the TypeScript the exhaustiveness check in the default case keeps us type safe here */
	switch (matchUnit) {
		case "years":
		case "year":
		case "yrs":
		case "yr":
		case "y":
			return n * y;
		case "weeks":
		case "week":
		case "w":
			return n * w;
		case "days":
		case "day":
		case "d":
			return n * d;
		case "hours":
		case "hour":
		case "hrs":
		case "hr":
		case "h":
			return n * h;
		case "minutes":
		case "minute":
		case "mins":
		case "min":
		case "m":
			return n * m;
		case "seconds":
		case "second":
		case "secs":
		case "sec":
		case "s":
			return n * s;
		case "milliseconds":
		case "millisecond":
		case "msecs":
		case "msec":
		case "ms":
			return n;
		default:
			matchUnit satisfies never;
			throw new Error(
				`Unknown unit "${matchUnit}" provided to ms.parse(). value=${JSON.stringify(str)}`,
			);
	}
}

/**
 * Parse the given StringValue and return milliseconds.
 *
 * @param value - A typesafe StringValue to parse to milliseconds
 * @returns The parsed value in milliseconds, or `NaN` if the string can't be
 * parsed
 */
export function parseStrict(value: StringValue): number {
	return parse(value);
}

/**
 * Short format for `ms`.
 */
function fmtShort(ms: number): StringValue {
	const msAbs = Math.abs(ms);
	if (msAbs >= d) {
		return `${Math.round(ms / d)}d`;
	}
	if (msAbs >= h) {
		return `${Math.round(ms / h)}h`;
	}
	if (msAbs >= m) {
		return `${Math.round(ms / m)}m`;
	}
	if (msAbs >= s) {
		return `${Math.round(ms / s)}s`;
	}
	return `${ms}ms`;
}

/**
 * Long format for `ms`.
 */
function fmtLong(ms: number): StringValue {
	const msAbs = Math.abs(ms);
	if (msAbs >= d) {
		return plural(ms, msAbs, d, "day");
	}
	if (msAbs >= h) {
		return plural(ms, msAbs, h, "hour");
	}
	if (msAbs >= m) {
		return plural(ms, msAbs, m, "minute");
	}
	if (msAbs >= s) {
		return plural(ms, msAbs, s, "second");
	}
	return `${ms} ms`;
}

/**
 * Format the given integer as a string.
 *
 * @param ms - milliseconds
 * @param options - Options for the conversion
 * @returns The formatted string
 */
export function format(ms: number, options?: Options): string {
	if (typeof ms !== "number" || !Number.isFinite(ms)) {
		throw new Error("Value provided to ms.format() must be of type number.");
	}
	return options?.long ? fmtLong(ms) : fmtShort(ms);
}

/**
 * Pluralization helper.
 */
function plural(
	ms: number,
	msAbs: number,
	n: number,
	name: string,
): StringValue {
	const isPlural = msAbs >= n * 1.5;
	return `${Math.round(ms / n)} ${name}${isPlural ? "s" : ""}` as StringValue;
}
