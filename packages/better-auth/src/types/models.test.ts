import { describe, it, expectTypeOf } from "vitest";
import { z } from "zod";
import type { BetterAuthOptions, InferUser } from "./models";

describe("Zod schema type inference", () => {
	it("should infer types from custom user schema", () => {
		// Define a custom user schema
		const customUserSchema = z.object({
			id: z.string(),
			email: z.string(),
			username: z.string(),
			role: z.enum(["admin", "user"]),
			organizationId: z.string().optional(),
		});

		// Create options with the custom schema
		type ExampleOptions = BetterAuthOptions & {
			user: {
				schema: typeof customUserSchema;
			};
		};

		// This should infer the custom schema types
		type InferredUser = InferUser<ExampleOptions>;

		expectTypeOf<InferredUser>().toEqualTypeOf<{
			id: string;
			email: string;
			username: string;
			role: "admin" | "user";
			organizationId?: string;
		}>();
	});

	it("should fallback to additionalFields when no schema is provided", () => {
		// Create options with additionalFields but no schema
		type ExampleOptions = BetterAuthOptions & {
			user: {
				additionalFields: {
					role: { type: "string" };
					age: { type: "number" };
					isActive: { type: "boolean" };
				};
			};
		};

		// This should infer the base user + additional fields
		type InferredUser = InferUser<ExampleOptions>;

		expectTypeOf<InferredUser>().toEqualTypeOf<{
			id: string;
			email: string;
			emailVerified: boolean;
			name: string;
			image?: string;
			createdAt: Date;
			updatedAt: Date;
			role: string;
			age: number;
			isActive: boolean;
		}>();
	});

	it("should handle complex nested schemas", () => {
		// Define a complex user schema with nested objects
		const complexUserSchema = z.object({
			id: z.string(),
			email: z.string(),
			profile: z.object({
				firstName: z.string(),
				lastName: z.string(),
				bio: z.string().optional(),
			}),
			preferences: z.object({
				theme: z.enum(["light", "dark"]),
				notifications: z.boolean(),
			}),
			tags: z.array(z.string()),
		});

		// Create options with the complex schema
		type ExampleOptions = BetterAuthOptions & {
			user: {
				schema: typeof complexUserSchema;
			};
		};

		// This should infer the complex schema types
		type InferredUser = InferUser<ExampleOptions>;

		expectTypeOf<InferredUser>().toEqualTypeOf<{
			id: string;
			email: string;
			profile: {
				firstName: string;
				lastName: string;
				bio?: string;
			};
			preferences: {
				theme: "light" | "dark";
				notifications: boolean;
			};
			tags: string[];
		}>();
	});

	it("should handle optional fields in schema", () => {
		// Define a schema with optional fields
		const optionalUserSchema = z.object({
			id: z.string(),
			email: z.string(),
			phone: z.string().optional(),
			address: z.object({
				street: z.string(),
				city: z.string(),
				zipCode: z.string().optional(),
			}).optional(),
		});

		// Create options with the optional schema
		type ExampleOptions = BetterAuthOptions & {
			user: {
				schema: typeof optionalUserSchema;
			};
		};

		// This should infer the optional schema types
		type InferredUser = InferUser<ExampleOptions>;

		expectTypeOf<InferredUser>().toEqualTypeOf<{
			id: string;
			email: string;
			phone?: string;
			address?: {
				street: string;
				city: string;
				zipCode?: string;
			};
		}>();
	});

	it("should work with Auth instance type", () => {
		// Define a custom user schema
		const customUserSchema = z.object({
			id: z.string(),
			email: z.string(),
			role: z.enum(["admin", "user"]),
		});

		// Create a mock Auth instance type
		type MockAuth = {
			options: BetterAuthOptions & {
				user: {
					schema: typeof customUserSchema;
				};
			};
		};

		// This should infer the custom schema types from Auth instance
		type InferredUser = InferUser<MockAuth>;

		expectTypeOf<InferredUser>().toEqualTypeOf<{
			id: string;
			email: string;
			role: "admin" | "user";
		}>();
	});
}); 