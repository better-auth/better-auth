const unsafeMarkupPatterns = [
	/https?:\/\//i,
	/!?\[[^\]]*\]\([^)]*\)/,
	/<\/?[A-Za-z][^>]*>/,
	/@[A-Za-z0-9][A-Za-z0-9-]*/,
];

export function containsUnsafeGeneratedMarkup(value: string): boolean {
	const prose = value.replace(/`[^`\r\n]*`/g, "");
	return unsafeMarkupPatterns.some((pattern) => pattern.test(prose));
}
