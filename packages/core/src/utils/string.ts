export function capitalizeFirstLetter(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Pluralizes a model identifier without changing its casing or word shape. */
export function pluralizeIdentifier(identifier: string): string {
	if (!identifier || identifier.endsWith("s")) return identifier;
	if (/[b-df-hj-np-tv-z]y$/i.test(identifier)) {
		return `${identifier.slice(0, -1)}ies`;
	}
	return `${identifier}s`;
}

const WORD_PATTERN =
	/[\p{Ll}\d]+|\p{Lu}+(?!\p{Ll})|\p{Lu}[\p{Ll}\d]+|\p{Lo}+/gu;
const APOSTROPHE_PATTERN = /['\u2019]/g;

function splitWords(input: string): string[] {
	return input.replace(APOSTROPHE_PATTERN, "").match(WORD_PATTERN) ?? [];
}

export function toSnakeCase(input: string): string {
	return splitWords(input)
		.map((word) => word.toLowerCase())
		.join("_");
}

export function toKebabCase(input: string): string {
	return splitWords(input)
		.map((word) => word.toLowerCase())
		.join("-");
}

export function toCamelCase(input: string): string {
	return splitWords(input).reduce((acc, word, i) => {
		return (
			acc +
			(i === 0
				? word.toLowerCase()
				: `${word[0]!.toUpperCase()}${word.slice(1)}`)
		);
	}, "");
}

export function toPascalCase(input: string): string {
	return splitWords(input)
		.map((word) => `${word[0]!.toUpperCase()}${word.slice(1).toLowerCase()}`)
		.join("");
}
