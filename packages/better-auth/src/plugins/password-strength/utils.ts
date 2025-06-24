import type { PasswordStrengthOptions, PasswordStrengthResult } from "./types";
function countChars(str: string, predicate: (char: string) => boolean): number {
	return [...str].filter(predicate).length;
}

export function validatePassword(
	password: string,
	options: Required<PasswordStrengthOptions>,
): PasswordStrengthResult {
	const errors: string[] = [];

	if (password.length < options.minLength) {
		errors.push(`Password must be at least ${options.minLength} characters.`);
	}

	const upperCount = countChars(password, (c) => c >= "A" && c <= "Z");
	if (upperCount < options.minUppercase) {
		errors.push(
			`Password must contain at least ${options.minUppercase} uppercase letter(s).`,
		);
	}

	const lowerCount = countChars(password, (c) => c >= "a" && c <= "z");
	if (lowerCount < options.minLowercase) {
		errors.push(
			`Password must contain at least ${options.minLowercase} lowercase letter(s).`,
		);
	}

	const numberCount = countChars(password, (c) => c >= "0" && c <= "9");
	if (numberCount < options.minNumbers) {
		errors.push(
			`Password must contain at least ${options.minNumbers} number(s).`,
		);
	}

	const specialCount = countChars(password, (c) =>
		options.specialChars.includes(c),
	);
	if (specialCount < options.minSpecialChars) {
		errors.push(
			`Password must contain at least ${options.minSpecialChars} special character(s).`,
		);
	}

	const score = 10 - errors.length;

	return {
		isValid: errors.length === 0,
		score: score < 0 ? 0 : score,
		errors,
	};
}
