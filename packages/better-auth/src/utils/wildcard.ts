//https://github.com/axtgr/wildcard-match

/**
 * Escapes a character if it has a special meaning in regular expressions
 * and returns the character as is if it doesn't
 */
function escapeRegExpChar(char: string) {
	if (
		char === "-" ||
		char === "^" ||
		char === "$" ||
		char === "+" ||
		char === "." ||
		char === "(" ||
		char === ")" ||
		char === "|" ||
		char === "[" ||
		char === "]" ||
		char === "{" ||
		char === "}" ||
		char === "*" ||
		char === "?" ||
		char === "\\"
	) {
		return `\\${char}`;
	} else {
		return char;
	}
}

/**
 * Escapes all characters in a given string that have a special meaning in regular expressions
 */
function escapeRegExpString(str: string) {
	let result = "";
	for (let i = 0; i < str.length; i++) {
		result += escapeRegExpChar(str[i]!);
	}
	return result;
}

/**
 * Transforms one or more glob patterns into a RegExp pattern
 */
function transform(
	pattern: string | string[],
	separator: string | boolean = true,
): string {
	if (Array.isArray(pattern)) {
		let regExpPatterns = pattern.map((p) => `^${transform(p, separator)}$`);
		return `(?:${regExpPatterns.join("|")})`;
	}

	let separatorSplitter = "";
	let separatorMatcher = "";
	let wildcard = ".";

	if (separator === true) {
		// In this case forward slashes in patterns match both forward and backslashes in samples:
		//
		// `foo/bar` will match `foo/bar`
		//           will match `foo\bar`
		//
		separatorSplitter = "/";
		separatorMatcher = "[/\\\\]";
		wildcard = "[^/\\\\]";
	} else if (separator) {
		separatorSplitter = separator;
		separatorMatcher = escapeRegExpString(separatorSplitter);

		if (separatorMatcher.length > 1) {
			separatorMatcher = `(?:${separatorMatcher})`;
			wildcard = `((?!${separatorMatcher}).)`;
		} else {
			wildcard = `[^${separatorMatcher}]`;
		}
	}

	// When a separator is explicitly specified in a pattern,
	// it MUST match ONE OR MORE separators in a sample:
	//
	// `foo/bar/` will match  `foo//bar///`
	//            won't match `foo/bar`
	//
	// When a pattern doesn't have a trailing separator,
	// a sample can still optionally have them:
	//
	// `foo/bar` will match `foo/bar//`
	//
	// So we use different quantifiers depending on the index of a segment.
	let requiredSeparator = separator ? `${separatorMatcher}+?` : "";
	let optionalSeparator = separator ? `${separatorMatcher}*?` : "";

	let segments = separator ? pattern.split(separatorSplitter) : [pattern];
	let result = "";

	for (let s = 0; s < segments.length; s++) {
		let segment = segments[s]!;
		let nextSegment = segments[s + 1]!;
		let currentSeparator = "";

		if (!segment && s > 0) {
			continue;
		}

		if (separator) {
			if (s === segments.length - 1) {
				currentSeparator = optionalSeparator;
			} else if (nextSegment !== "**") {
				currentSeparator = requiredSeparator;
			} else {
				currentSeparator = "";
			}
		}

		if (separator && segment === "**") {
			if (currentSeparator) {
				result += s === 0 ? "" : currentSeparator;
				result += `(?:${wildcard}*?${currentSeparator})*?`;
			}
			continue;
		}

		for (let c = 0; c < segment.length; c++) {
			let char = segment[c]!;

			if (char === "\\") {
				if (c < segment.length - 1) {
					result += escapeRegExpChar(segment[c + 1]!);
					c++;
				}
			} else if (char === "?") {
				result += wildcard;
			} else if (char === "*") {
				result += `${wildcard}*?`;
			} else {
				result += escapeRegExpChar(char);
			}
		}

		result += currentSeparator;
	}

	return result;
}

interface WildcardMatchOptions {
	/** Separator to be used to split patterns and samples into segments */
	separator?: string | boolean;

	/** Flags to pass to the RegExp */
	flags?: string;
}

// This overrides the function's signature because for the end user
// the function is always bound to a RegExp
interface isMatch {
	/**
	 * Tests if a sample string matches the pattern(s)
	 *
	 * ```js
	 * isMatch('foo') //=> true
	 * ```
	 */
	(sample: string): boolean;

	/** Compiled regular expression */
	regexp: RegExp;

	/** Original pattern or array of patterns that was used to compile the RegExp */
	pattern: string | string[];

	/** Options that were used to compile the RegExp */
	options: WildcardMatchOptions;
}

function isMatch(regexp: RegExp, sample: string) {
	if (typeof sample !== "string") {
		throw new TypeError(`Sample must be a string, but ${typeof sample} given`);
	}

	return regexp.test(sample);
}

/**
 * Compiles one or more glob patterns into a RegExp and returns an isMatch function.
 * The isMatch function takes a sample string as its only argument and returns `true`
 * if the string matches the pattern(s).
 *
 * ```js
 * wildcardMatch('src/*.js')('src/index.js') //=> true
 * ```
 *
 * ```js
 * const isMatch = wildcardMatch('*.example.com', '.')
 * isMatch('foo.example.com') //=> true
 * isMatch('foo.bar.com') //=> false
 * ```
 */
function wildcardMatch(
	pattern: string | string[],
	options?: string | boolean | WildcardMatchOptions,
) {
	if (typeof pattern !== "string" && !Array.isArray(pattern)) {
		throw new TypeError(
			`The first argument must be a single pattern string or an array of patterns, but ${typeof pattern} given`,
		);
	}

	if (typeof options === "string" || typeof options === "boolean") {
		options = { separator: options };
	}

	if (
		arguments.length === 2 &&
		!(
			typeof options === "undefined" ||
			(typeof options === "object" &&
				options !== null &&
				!Array.isArray(options))
		)
	) {
		throw new TypeError(
			`The second argument must be an options object or a string/boolean separator, but ${typeof options} given`,
		);
	}

	options = options || {};

	if (options.separator === "\\") {
		throw new Error(
			"\\ is not a valid separator because it is used for escaping. Try setting the separator to `true` instead",
		);
	}

	let regexpPattern = transform(pattern, options.separator);
	let regexp = new RegExp(`^${regexpPattern}$`, options.flags);

	let fn = isMatch.bind(null, regexp) as isMatch;
	fn.options = options;
	fn.pattern = pattern;
	fn.regexp = regexp;
	return fn;
}

export { wildcardMatch };
