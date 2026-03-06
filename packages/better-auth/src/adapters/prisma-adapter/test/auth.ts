import { prismaAdapter } from "@better-auth/prisma-adapter";
import { PrismaClient } from "@prisma/client";
import { betterAuth } from "../../../auth/full";

const db = new PrismaClient();

export const auth = betterAuth({
	database: prismaAdapter(db, {
		provider: "sqlite",
	}),

	advanced: {
		database: {
			generateId: "uuid",
		},
	},
});
