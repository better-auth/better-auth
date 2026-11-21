const JSON_SIGNATURE =
	/^\s*["[{]|^\s*-?\d{1,16}(\.\d{1,17})?([Ee][+-]?\d+)?\s*$/;

const SPECIAL_VALUES = {
	true: true,
	false: false,
	null: null,
	undefined: undefined,
	nan: Number.NaN,
	infinity: Number.POSITIVE_INFINITY,
	"-infinity": Number.NEGATIVE_INFINITY,
} as const;

const ISO_DATE_REGEX =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;

const DEFAULT_DATE_KEY_REGEX =
	/^(?:date|time|timestamp|expires|lastRequest|last_request)$/i;
const SNAKE_DATE_KEY_REGEX = /_(?:at|until|expires|date|time|timestamp)$/i;
const CAMEL_DATE_KEY_REGEX =
	/[a-z0-9](?:At|Until|Expires|Date|Time|Timestamp)$/;
const PERIOD_TRIAL_KEY_REGEX = /(?:period|trial)(?:Start|End|_(?:start|end))$/i;

function isDefaultDateKey(key: string): boolean {
	return (
		DEFAULT_DATE_KEY_REGEX.test(key) ||
		SNAKE_DATE_KEY_REGEX.test(key) ||
		CAMEL_DATE_KEY_REGEX.test(key) ||
		PERIOD_TRIAL_KEY_REGEX.test(key)
	);
}

type ParseOptions = {
	/** Throw errors instead of returning the original value */
	strict?: boolean | undefined;
	/** Log warnings when suspicious patterns are detected */
	warnings?: boolean | undefined;
	/** Custom reviver function */
	reviver?: ((key: string, value: any) => any) | undefined;
	/**
	 * Automatically convert ISO date strings to Date objects for date fields.
	 * Can be boolean (defaults to true), a RegExp testing property keys,
	 * or a predicate function `(key: string, value: string) => boolean`.
	 */
	parseDates?:
		| boolean
		| RegExp
		| ((key: string, value: string) => boolean)
		| undefined;
};

function shouldParseDate(
	key: string,
	value: string,
	parseDates: ParseOptions["parseDates"],
): boolean {
	if (!parseDates) {
		return false;
	}
	if (typeof parseDates === "function") {
		return parseDates(key, value);
	}
	if (parseDates instanceof RegExp) {
		if (parseDates.global || parseDates.sticky) {
			parseDates.lastIndex = 0;
		}
		const matches = parseDates.test(key);
		if (parseDates.global || parseDates.sticky) {
			parseDates.lastIndex = 0;
		}
		return matches;
	}
	return isDefaultDateKey(key);
}

function isValidDate(date: Date): boolean {
	return date instanceof Date && !isNaN(date.getTime());
}

function parseISODate(value: string): Date | null {
	const match = ISO_DATE_REGEX.exec(value);
	if (!match) return null;

	const [
		,
		year,
		month,
		day,
		hour,
		minute,
		second,
		ms,
		offsetSign,
		offsetHour,
		offsetMinute,
	] = match;

	const date = new Date(
		Date.UTC(
			parseInt(year!, 10),
			parseInt(month!, 10) - 1,
			parseInt(day!, 10),
			parseInt(hour!, 10),
			parseInt(minute!, 10),
			parseInt(second!, 10),
			ms ? parseInt(ms.padEnd(3, "0"), 10) : 0,
		),
	);

	if (offsetSign) {
		const offset =
			(parseInt(offsetHour!, 10) * 60 + parseInt(offsetMinute!, 10)) *
			(offsetSign === "+" ? -1 : 1);
		date.setUTCMinutes(date.getUTCMinutes() + offset);
	}

	return isValidDate(date) ? date : null;
}

function betterJSONParse<T = unknown>(
	value: unknown,
	options: ParseOptions = {},
): T {
	const {
		strict = false,
		warnings = false,
		reviver,
		parseDates = true,
	} = options;

	if (typeof value !== "string") {
		return value as T;
	}

	const trimmed = value.trim();

	const lowerValue = trimmed.toLowerCase();
	if (lowerValue.length <= 9 && lowerValue in SPECIAL_VALUES) {
		return SPECIAL_VALUES[lowerValue as keyof typeof SPECIAL_VALUES] as T;
	}

	if (!JSON_SIGNATURE.test(trimmed)) {
		if (strict) {
			throw new SyntaxError("[better-json] Invalid JSON");
		}
		return value as T;
	}

	try {
		const secureReviver = (key: string, value: any) => {
			if (
				key === "__proto__" ||
				(key === "constructor" &&
					value &&
					typeof value === "object" &&
					"prototype" in value)
			) {
				// Decide on parsed keys, not raw text, so a plain `constructor` field passes
				if (strict) {
					throw new Error(
						"[better-json] Potential prototype pollution attempt detected",
					);
				}
				if (warnings) {
					console.warn(
						`[better-json] Dropping "${key}" key to prevent prototype pollution`,
					);
				}
				return undefined;
			}

			if (
				typeof value === "string" &&
				shouldParseDate(key, value, parseDates)
			) {
				const date = parseISODate(value);
				if (date) {
					return date;
				}
			}

			return reviver ? reviver(key, value) : value;
		};

		return JSON.parse(trimmed, secureReviver);
	} catch (error) {
		if (strict) {
			throw error;
		}
		return value as T;
	}
}

export function parseJSON<T = unknown>(
	value: unknown,
	options: ParseOptions = { strict: true },
): T {
	return betterJSONParse<T>(value, options);
}
