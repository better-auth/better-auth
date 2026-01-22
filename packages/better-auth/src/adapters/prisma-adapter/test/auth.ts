import { PrismaClient } from "@prisma/client";
import { betterAuth } from "../../../auth";
import { prismaAdapter } from "../prisma-adapter";

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
