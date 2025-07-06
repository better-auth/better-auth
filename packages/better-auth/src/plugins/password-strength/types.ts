export interface PasswordStrengthOptions {
	minLength?: number;
	minUppercase?: number;
	minLowercase?: number;
	minNumbers?: number;
	minSpecialChars?: number;
	specialChars?: string;
}

export interface PasswordStrengthResult {
	isValid: boolean;
	score: number;
	errors: string[];
}
