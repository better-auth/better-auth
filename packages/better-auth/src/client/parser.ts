const PROTO_POLLUTION_PATTERNS = {
	proto:
		/"(?:_|\\u0{2}5[Ff]){2}(?:p|\\u0{2}70)(?:r|\\u0{2}72)(?:o|\\u0{2}6[Ff])(?:t|\\u0{2}74)(?:o|\\u0{2}6[Ff])(?:_|\\u0{2}5[Ff]){2}"\s*:/,
	constructor:
		/"(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)"\s*:/,
	protoShort: /"__proto__"\s*:/,
	constructorShort: /"constructor"\s*:/,
} as const;

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

type ParseOptions = {
	/** Throw errors instead of returning the original value */
	strict?: boolean | undefined;
	/** Log warnings when suspicious patterns are detected */
	warnings?: boolean | undefined;
	/** Custom reviver function */
	reviver?: ((key: string, value: any) => any) | undefined;
	/** Automatically convert ISO date strings to Date objects */
	parseDates?: boolean | undefined;
};

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

	let date = new Date(
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

	if (
		trimmed.length > 0 &&
		trimmed[0] === '"' &&
		trimmed.endsWith('"') &&
		!trimmed.slice(1, -1).includes('"')
	) {
		return trimmed.slice(1, -1) as T;
	}

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

	const hasProtoPattern = Object.entries(PROTO_POLLUTION_PATTERNS).some(
		([key, pattern]) => {
			const matches = pattern.test(trimmed);
			if (matches && warnings) {
				console.warn(
					`[better-json] Detected potential prototype pollution attempt using ${key} pattern`,
				);
			}
			return matches;
		},
	);

	if (hasProtoPattern && strict) {
		throw new Error(
			"[better-json] Potential prototype pollution attempt detected",
		);
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
				if (warnings) {
					console.warn(
						`[better-json] Dropping "${key}" key to prevent prototype pollution`,
					);
				}
				return undefined;
			}

			if (parseDates && typeof value === "string") {
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
