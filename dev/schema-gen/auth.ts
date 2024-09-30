import { betterAuth } from "better-auth";
import { prismaAdapter,  } from "better-auth/adapters";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const auth = betterAuth({
	database: prismaAdapter({
		db: prisma,
		provider: "sqlite",
	}),
	provider: "sqlite",
});
