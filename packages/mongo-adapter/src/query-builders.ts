/**
 * Escape special regex characters for safe use in MongoDB $regex.
 * @see https://www.pcre.org/original/doc/html/pcrepattern.html
 */
export function escapeForMongoRegex(input: string, maxLength = 256): string {
	if (typeof input !== "string") return "";
	return input.slice(0, maxLength).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-insensitive equality using $regex.
 */
export function insensitiveEq(field: string, value: string) {
	return {
		[field]: {
			$regex: `^${escapeForMongoRegex(value)}$`,
			$options: "i" as const,
		},
	};
}

/**
 * Case-insensitive IN using $or with regex for each value.
 */
export function insensitiveIn(field: string, values: string[]) {
	return {
		$or: values.map((v) => ({
			[field]: {
				$regex: `^${escapeForMongoRegex(v)}$`,
				$options: "i" as const,
			},
		})),
	};
}

/**
 * Case-insensitive NOT IN using $nor.
 */
export function insensitiveNotIn(field: string, values: string[]) {
	return {
		$nor: values.map((v) => ({
			[field]: {
				$regex: `^${escapeForMongoRegex(v)}$`,
				$options: "i" as const,
			},
		})),
	};
}

/**
 * Case-insensitive inequality using $not + $regex.
 */
export function insensitiveNe(field: string, value: string) {
	return {
		[field]: {
			$not: {
				$regex: `^${escapeForMongoRegex(value)}$`,
				$options: "i" as const,
			},
		},
	};
}

/**
 * Case-insensitive contains (LIKE %value%).
 */
export function insensitiveContains(field: string, value: string) {
	return {
		[field]: {
			$regex: `.*${escapeForMongoRegex(value)}.*`,
			$options: "i" as const,
		},
	};
}

/**
 * Case-insensitive starts_with (LIKE value%).
 */
export function insensitiveStartsWith(field: string, value: string) {
	return {
		[field]: {
			$regex: `^${escapeForMongoRegex(value)}`,
			$options: "i" as const,
		},
	};
}

/**
 * Case-insensitive ends_with (LIKE %value).
 */
export function insensitiveEndsWith(field: string, value: string) {
	return {
		[field]: {
			$regex: `${escapeForMongoRegex(value)}$`,
			$options: "i" as const,
		},
	};
}
