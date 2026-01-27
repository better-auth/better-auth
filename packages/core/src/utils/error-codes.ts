type UpperLetter =
	| "A"
	| "B"
	| "C"
	| "D"
	| "E"
	| "F"
	| "G"
	| "H"
	| "I"
	| "J"
	| "K"
	| "L"
	| "M"
	| "N"
	| "O"
	| "P"
	| "Q"
	| "R"
	| "S"
	| "T"
	| "U"
	| "V"
	| "W"
	| "X"
	| "Y"
	| "Z";
type SpecialCharacter = "_";

type IsValidUpperSnakeCase<S extends string> = S extends `${infer F}${infer R}`
	? F extends UpperLetter | SpecialCharacter
		? IsValidUpperSnakeCase<R>
		: false
	: true;

type InvalidKeyError<K extends string> =
	`Invalid error code key: "${K}" - must only contain uppercase letters (A-Z) and underscores (_)`;

type ValidateErrorCodes<T> = {
	[K in keyof T]: K extends string
		? IsValidUpperSnakeCase<K> extends false
			? InvalidKeyError<K>
			: T[K]
		: T[K];
};

export type RawError = {
	code: string;
	message: string;
};

export function defineErrorCodes<const T extends Record<string, string>>(
	codes: ValidateErrorCodes<T>,
): {
	[K in keyof T]: RawError;
} {
	return Object.fromEntries(
		Object.entries(codes).map(([key, value]) => [
			key,
			{
				code: key,
				message: value,
				toString: () => key,
			},
		]),
	) as any;
}
