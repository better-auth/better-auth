import { describe, it, expect, expectTypeOf } from "vitest";
import { z } from "zod";
import { betterAuth } from "../index";
import { getTestInstance } from "../test-utils/test-instance";

describe("Custom Schema Integration", () => {
	it("should work with custom user schema", async () => {
		// Define a custom user schema
		const customUserSchema = z.object({
			id: z.string(),
			email: z.string(),
			name: z.string(),
			role: z.enum(["admin", "user", "moderator"]),
			organizationId: z.string().optional(),
			createdAt: z.date().default(() => new Date()),
			updatedAt: z.date().default(() => new Date()),
		});

		// Create auth instance with custom schema
		const { auth, signInWithTestUser } = await getTestInstance({
			user: {
				schema: customUserSchema,
			},
		});

		// Test type inference
		type CustomUser = typeof auth.$Infer.Session.user;
		expectTypeOf<CustomUser>().toEqualTypeOf<{
			id: string;
			email: string;
			name: string;
			role: "admin" | "user" | "moderator";
			organizationId?: string;
			createdAt: Date;
			updatedAt: Date;
		}>();

		// Test that we can sign up with the custom schema
		const signUpResult = await auth.api.signUpEmail({
			email: "test@example.com",
			password: "password123",
			name: "Test User",
			role: "user",
			organizationId: "org123",
		});

		expect(signUpResult.user).toBeDefined();
		expect(signUpResult.user.email).toBe("test@example.com");
		expect(signUpResult.user.name).toBe("Test User");
		expect(signUpResult.user.role).toBe("user");
		expect(signUpResult.user.organizationId).toBe("org123");

		// Test that we can update user with custom fields
		const updateResult = await auth.api.updateUser({
			id: signUpResult.user.id,
			role: "moderator",
			organizationId: "org456",
		});

		expect(updateResult.user.role).toBe("moderator");
		expect(updateResult.user.organizationId).toBe("org456");
	});

	it("should maintain backward compatibility with additionalFields", async () => {
		// Test that additionalFields still work when no schema is provided
		const { auth } = await getTestInstance({
			user: {
				additionalFields: {
					role: {
						type: "string",
						defaultValue: "user",
					},
					age: {
						type: "number",
						required: false,
					},
				},
			},
		});

		// Test type inference for additionalFields
		type UserWithAdditionalFields = typeof auth.$Infer.Session.user;
		expectTypeOf<UserWithAdditionalFields>().toMatchTypeOf<{
			id: string;
			email: string;
			emailVerified: boolean;
			name: string;
			image?: string;
			createdAt: Date;
			updatedAt: Date;
			role: string;
			age?: number;
		}>();

		// Test sign up with additionalFields
		const signUpResult = await auth.api.signUpEmail({
			email: "test2@example.com",
			password: "password123",
			name: "Test User 2",
			age: 25,
		});

		expect(signUpResult.user.role).toBe("user"); // default value
		expect(signUpResult.user.age).toBe(25);
	});

	it("should prioritize schema over additionalFields", async () => {
		// Test that when both schema and additionalFields are provided, schema takes precedence
		const customUserSchema = z.object({
			id: z.string(),
			email: z.string(),
			name: z.string(),
			role: z.enum(["admin", "user"]),
		});

		const { auth } = await getTestInstance({
			user: {
				schema: customUserSchema,
				additionalFields: {
					age: {
						type: "number",
						defaultValue: 18,
					},
				},
			},
		});

		// The type should only include fields from the schema, not additionalFields
		type SchemaUser = typeof auth.$Infer.Session.user;
		expectTypeOf<SchemaUser>().toEqualTypeOf<{
			id: string;
			email: string;
			name: string;
			role: "admin" | "user";
		}>();

		// additionalFields should be ignored when schema is provided
		expectTypeOf<SchemaUser>().not.toHaveProperty("age");
	});

	it("should handle complex nested schemas", async () => {
		const complexUserSchema = z.object({
			id: z.string(),
			email: z.string(),
			name: z.string(),
			profile: z.object({
				bio: z.string().optional(),
				avatar: z.string().url().optional(),
			}),
			preferences: z.object({
				theme: z.enum(["light", "dark", "auto"]),
				notifications: z.boolean(),
			}).default({
				theme: "auto",
				notifications: true,
			}),
			createdAt: z.date().default(() => new Date()),
			updatedAt: z.date().default(() => new Date()),
		});

		const { auth } = await getTestInstance({
			user: {
				schema: complexUserSchema,
			},
		});

		// Test type inference for complex schema
		type ComplexUser = typeof auth.$Infer.Session.user;
		expectTypeOf<ComplexUser>().toEqualTypeOf<{
			id: string;
			email: string;
			name: string;
			profile: {
				bio?: string;
				avatar?: string;
			};
			preferences: {
				theme: "light" | "dark" | "auto";
				notifications: boolean;
			};
			createdAt: Date;
			updatedAt: Date;
		}>();

		// Test sign up with complex schema
		const signUpResult = await auth.api.signUpEmail({
			email: "complex@example.com",
			password: "password123",
			name: "Complex User",
			profile: {
				bio: "A test user",
				avatar: "https://example.com/avatar.jpg",
			},
			preferences: {
				theme: "dark",
				notifications: false,
			},
		});

		expect(signUpResult.user.profile.bio).toBe("A test user");
		expect(signUpResult.user.profile.avatar).toBe("https://example.com/avatar.jpg");
		expect(signUpResult.user.preferences.theme).toBe("dark");
		expect(signUpResult.user.preferences.notifications).toBe(false);
	});
}); 