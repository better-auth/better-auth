export function capitalizeFirstLetter(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

const WORD_PATTERN = (() => {
	try {
		return new RegExp(
			"[\\p{Ll}\\d]+|\\p{Lu}+(?!\\p{Ll})|\\p{Lu}[\\p{Ll}\\d]+|\\p{Lo}+",
			"gu",
		);
	} catch {
		return undefined;
	}
})();
const APOSTROPHE_PATTERN = /['\u2019]/g;
const FALLBACK_SEPARATOR_PATTERN =
	/[\s!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~\u00A0\u00AB\u00B7\u00BB\u2000-\u206F\u3000-\u303F\uFF00-\uFF65]/;

function splitWords(input: string): string[] {
	const normalizedInput = input.replace(APOSTROPHE_PATTERN, "");
	if (WORD_PATTERN) {
		return normalizedInput.match(WORD_PATTERN) ?? [];
	}
	return splitFallbackWords(normalizedInput);
}

function splitFallbackWords(input: string): string[] {
	return input
		.split(FALLBACK_SEPARATOR_PATTERN)
		.flatMap((word) => splitCasedWord(word));
}

function splitCasedWord(word: string): string[] {
	const characters = [...word.normalize("NFC")];
	const words: string[] = [];
	let currentWord = "";

	for (let index = 0; index < characters.length; index++) {
		const character = characters[index]!;
		const previousCharacter = characters[index - 1];
		const nextCharacter = characters[index + 1];
		const isUpperCase =
			character !== character.toLowerCase() &&
			character === character.toUpperCase();
		const isLowerCase =
			character !== character.toUpperCase() &&
			character === character.toLowerCase();
		const isDigit = /\d/.test(character);
		const isCasedOrDigit = isUpperCase || isLowerCase || isDigit;
		const previousIsUpperCase =
			previousCharacter !== undefined &&
			previousCharacter === previousCharacter.toUpperCase() &&
			previousCharacter !== previousCharacter.toLowerCase();
		const previousIsDigit =
			previousCharacter !== undefined && /\d/.test(previousCharacter);
		const previousIsCasedOrDigit =
			previousCharacter !== undefined &&
			(previousIsUpperCase ||
				(previousCharacter !== previousCharacter.toUpperCase() &&
					previousCharacter === previousCharacter.toLowerCase()) ||
				previousIsDigit);
		const nextIsLowerCase =
			nextCharacter !== undefined &&
			nextCharacter !== nextCharacter.toUpperCase() &&
			nextCharacter === nextCharacter.toLowerCase();

		if (
			currentWord &&
			((isUpperCase &&
				(!previousIsUpperCase || nextIsLowerCase)) ||
				(isDigit && previousIsUpperCase) ||
				(isUpperCase && previousIsDigit) ||
				isCasedOrDigit !== previousIsCasedOrDigit)
		) {
			words.push(currentWord);
			currentWord = "";
		}

		currentWord += character;
	}

	return currentWord ? [...words, currentWord] : words;
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
