import type { AuthContext } from "@better-auth/core";
import { generateRandomString } from "../../crypto";
import type { User } from "../../types";

export function createUserFactory(ctx: AuthContext) {
	return (overrides: Partial<User> & Record<string, unknown> = {}): User => {
		const generatedId = ctx.generateId({ model: "user" });
		const id =
			overrides.id ||
			(generatedId === false
				? generateRandomString(24, "a-z", "A-Z", "0-9")
				: generatedId);
		const now = new Date();

		return {
			id,
			email:
				overrides.email ||
				`test-${generateRandomString(8, "a-z", "0-9")}@example.com`,
			name: overrides.name || "Test User",
			emailVerified: overrides.emailVerified ?? true,
			image: overrides.image ?? null,
			createdAt: overrides.createdAt || now,
			updatedAt: overrides.updatedAt || now,
			...overrides,
		} as User;
	};
}

export function createOrganizationFactory(ctx: AuthContext) {
	return (overrides: Record<string, unknown> = {}): Record<string, unknown> => {
		const generatedId = ctx.generateId({ model: "organization" });
		const id =
			(overrides.id as string) ||
			(generatedId === false
				? generateRandomString(24, "a-z", "A-Z", "0-9")
				: generatedId);
		const now = new Date();
		const name = (overrides.name as string) || "Test Organization";
		const slug =
			(overrides.slug as string) ||
			`${name.toLowerCase().replace(/\s+/g, "-")}-${generateRandomString(4, "a-z", "0-9")}`;

		return {
			id,
			name,
			slug,
			logo: overrides.logo ?? null,
			metadata: overrides.metadata ?? null,
			createdAt: overrides.createdAt || now,
			...overrides,
		};
	};
}
