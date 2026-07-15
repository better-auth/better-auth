import { describe, expectTypeOf, it } from "vitest";
import { betterAuth } from "../auth/full";
import { admin } from "../plugins/admin";
import { username } from "../plugins/username";

describe("databaseHooks auth-config type inference", () => {
	it("infers user.additionalFields in databaseHooks", () => {
		betterAuth({
			user: {
				additionalFields: {
					customField: {
						type: "string",
						required: false,
					},
				},
			},
			databaseHooks: {
				user: {
					create: {
						before: async (user) => {
							expectTypeOf(user).not.toBeAny();
							expectTypeOf(user).toHaveProperty("customField");
							expectTypeOf(user.customField).toEqualTypeOf<
								string | null | undefined
							>();
							return { data: user };
						},
						after: async (user) => {
							expectTypeOf(user).toHaveProperty("customField");
						},
					},
					update: {
						before: async (user) => {
							expectTypeOf(user).toHaveProperty("customField");
							return { data: user };
						},
					},
				},
			},
		});
	});

	it("infers username plugin fields in databaseHooks", () => {
		betterAuth({
			plugins: [username()],
			databaseHooks: {
				user: {
					create: {
						before: async (user) => {
							type Expected = string | null | undefined;
							expectTypeOf(user).not.toBeAny();
							expectTypeOf(user).toHaveProperty("username");
							expectTypeOf(user).toHaveProperty("displayUsername");
							expectTypeOf(user.username).toEqualTypeOf<Expected>();
							expectTypeOf(user.displayUsername).toEqualTypeOf<Expected>();
							return { data: user };
						},
						after: async (user) => {
							expectTypeOf(user).toHaveProperty("username");
							expectTypeOf(user).toHaveProperty("displayUsername");
						},
					},
				},
			},
		});
	});

	it("infers plugin + additionalFields together in databaseHooks", () => {
		betterAuth({
			user: {
				additionalFields: {
					customField: {
						type: "string",
						required: false,
					},
				},
			},
			plugins: [admin(), username()],
			databaseHooks: {
				user: {
					create: {
						before: async (user) => {
							expectTypeOf(user).not.toBeAny();
							expectTypeOf(user).toHaveProperty("customField");
							expectTypeOf(user).toHaveProperty("username");
							expectTypeOf(user).toHaveProperty("displayUsername");
							expectTypeOf(user).toHaveProperty("role");
							expectTypeOf(user).toHaveProperty("banned");
							expectTypeOf(user.customField).toEqualTypeOf<
								string | null | undefined
							>();
							expectTypeOf(user.username).toEqualTypeOf<
								string | null | undefined
							>();
							return { data: user };
						},
					},
				},
			},
		});
	});
});
