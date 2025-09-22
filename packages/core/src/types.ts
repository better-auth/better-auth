// Core types shared between better-auth and client packages

// User and Session types
export interface User {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image?: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface Session {
	id: string;
	userId: string;
	expiresAt: Date;
	token: string;
	ipAddress?: string | null;
	userAgent?: string | null;
}

// Helper types
export type Prettify<T> = Omit<T, never>;

export type PrettifyDeep<T> = {
	[K in keyof T]: T[K] extends object
		? T[K] extends Function
			? T[K]
			: PrettifyDeep<T[K]>
		: T[K];
} & {};

export type UnionToIntersection<U> = (
	U extends any
		? (k: U) => void
		: never
) extends (k: infer I) => void
	? I
	: never;

export type StripEmptyObjects<T> = T extends { [K in keyof T]: never }
	? never
	: T extends object
		? {
				[K in keyof T as T[K] extends never ? never : K]: StripEmptyObjects<
					T[K]
				>;
			}
		: T;

export type LiteralUnion<T extends U, U = string> =
	| T
	| (U & Record<never, never>);

export type HasRequiredKeys<BaseType extends object> =
	RequiredKeysOf<BaseType> extends never ? false : true;

type RequiredKeysOf<BaseType extends object = object> = Exclude<
	{
		[Key in keyof BaseType]: BaseType extends Record<Key, BaseType[Key]>
			? Key
			: never;
	}[keyof BaseType],
	undefined
>;

// Types from better-call needed for client
export interface InputContext<Path extends string = string, Input = any> {
	path: Path;
	method?: string;
	body?: Input extends { body: infer B } ? B : any;
	query?: Input extends { query: infer Q } ? Q : any;
	params?: Input extends { params: infer P } ? P : any;
	headers?: Record<string, string>;
}

export interface EndpointOptions {
	metadata?: Record<string, any>;
	error?: StandardSchemaV1;
	[key: string]: any;
}

export interface Endpoint<
	Path extends string = string,
	Handler extends (...args: any[]) => any = (...args: any[]) => any,
> {
	path: Path;
	options: EndpointOptions;
	handler?: Handler;
	method?: string;
}

export interface StandardSchemaV1<Input = unknown, Output = unknown> {
	readonly "~standard": {
		readonly version: 1;
		readonly vendor?: string;
		readonly validate?: (value: unknown) => unknown;
		readonly types?: {
			readonly input?: Input;
			readonly output?: Output;
		};
	};
}

// Error codes
export const BASE_ERROR_CODES = {
	// OAuth errors
	FAILED_TO_GET_USER_INFO: "Failed to get user info",
	PROVIDER_ERROR: "Provider returned an error",
	FAILED_TO_REFRESH_ACCESS_TOKEN: "Failed to refresh access token",
	INVALID_ACCESS_TOKEN: "Invalid access token",
	INVALID_REFRESH_TOKEN: "Invalid refresh token",
	// Auth errors
	INVALID_EMAIL_OR_PASSWORD: "Invalid email or password",
	INVALID_PASSWORD: "Invalid password",
	USER_NOT_FOUND: "User not found",
	FAILED_TO_CREATE_USER: "Failed to create user",
	REQUEST_LIMIT_EXCEEDED: "Too many requests. Please try again later",
	INVALID_EMAIL: "Invalid email",
	EMAIL_ALREADY_IN_USE: "Email already in use",
	PASSWORD_TOO_SHORT: "Password must be at least 8 characters",
	PASSWORD_TOO_LONG: "Password must be at most 256 characters",
	INVALID_SESSION: "Invalid session",
	CREDENTIAL_ACCOUNT_NOT_FOUND: "Credential account not found",
	INVALID_CREDENTIALS: "Invalid credentials",
	SESSION_NOT_FOUND: "Session not found",
	MULTIPLE_CREDENTIALS_ACCOUNT: "Multiple credentials account",
	INVALID_CODE: "Invalid code",
	UNABLE_TO_VERIFY_EMAIL: "Unable to verify email. Invalid code",
	USER_ALREADY_EXISTS: "User already exists",
	ACCESS_DENIED: "Access denied",
	FORBIDDEN: "Forbidden",
	SOCIAL_ACCOUNT_ALREADY_LINKED: "Social account already linked",
	PROVIDER_NOT_FOUND: "Provider not found",
	INVALID_TOKEN: "Invalid token",
	SOCIAL_LOGIN_FAILED: "Social login failed",
	SIGN_UP_DISABLED: "Sign up is disabled",
	INVALID_FIELDS: "Invalid fields",
	NOT_FOUND: "Not found",
	METHOD_NOT_ALLOWED: "Method not allowed",
} as const;
