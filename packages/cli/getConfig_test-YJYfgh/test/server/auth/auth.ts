import {betterAuth} from "better-auth";
			 import {prismaAdapter} from "better-auth/adapters/prisma";			
			 import {db} from "prismaDbClient";

			 export const auth = betterAuth({
					database: prismaAdapter(db, {
							provider: 'sqlite'
					}),
					emailAndPassword: {
						enabled: true,
					}
			 })