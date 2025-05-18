import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "pg" }),
	secret: "some-secret-value-here",
	emailAndPassword: {
		enabled: true,
	},
	user: {
		additionalFields: {
			test: {
				type: "decimal",
				required: false,
				precision: 10,
				scale: 2,
			},
		},
	},
});

// const createAuth = (env: CloudflareBindings) =>
// 	betterAuth({
// 		database: drizzleAdapter(createDrizzle(env.DB), { provider: "sqlite" }),
// 		secret: "some-secret-value-here",
// 		emailAndPassword: {
// 			enabled: true,
// 		},
// 		user: {
// 			additionalFields: {
// 				test: {
// 					type: "string",
// 					required: false,
// 					defaultValue: "test",
// 				},
// 			},
// 		},
// 	});

// export default createAuth;

// export type Auth = ReturnType<typeof createAuth>;
