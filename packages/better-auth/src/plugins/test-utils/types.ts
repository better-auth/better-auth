import type { Session, User } from "../../types";

export interface TestUtilsOptions {
	/** Capture OTPs in memory when created (doesn't prevent sending) */
	captureOTP?: boolean;
}

export interface TestCookie {
	name: string;
	value: string;
	domain: string;
	path: string;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "Lax" | "Strict" | "None";
	expires?: number;
}

export interface LoginResult {
	session: Session;
	user: User;
	headers: Headers;
	cookies: TestCookie[];
	token: string;
}

/** Options for creating a session with the test auth helpers. */
export interface TestAuthOptions {
	userId: string;
	/** Additional session fields. Standard session fields are ignored. */
	session?: Record<string, unknown>;
}

export interface TestHelpers {
	// Factories
	createUser(overrides?: Partial<User> & Record<string, unknown>): User;
	createOrganization?(
		overrides?: Record<string, unknown>,
	): Record<string, unknown>;

	// Database helpers
	saveUser(user: User): Promise<User>;
	saveOrganization?(
		org: Record<string, unknown>,
	): Promise<Record<string, unknown>>;
	addMember?(opts: {
		userId: string;
		organizationId: string;
		role?: string;
	}): Promise<Record<string, unknown>>;
	deleteUser(userId: string): Promise<void>;
	deleteOrganization?(orgId: string): Promise<void>;

	// Auth helpers
	login(opts: TestAuthOptions): Promise<LoginResult>;
	getAuthHeaders(opts: TestAuthOptions): Promise<Headers>;
	getCookies(
		opts: TestAuthOptions & { domain?: string },
	): Promise<TestCookie[]>;

	// OTP capture (when captureOTP: true)
	getOTP?(identifier: string): string | undefined;
	clearOTPs?(): void;
}
