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

export type RawError<K extends string = string> = {
	readonly code: K;
	message: string;
};

export function defineErrorCodes<
	const T extends Record<string, string>,
	R extends {
		[K in keyof T & string]: RawError<K>;
	},
>(codes: ValidateErrorCodes<T>): R {
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
