import { z } from "zod";


export const accountSchema = z.object({
	id: z.string(),
	providerId: z.string(),
	accountId: z.string(),
	userId: z.string(),
	accessToken: z.string().nullable().optional(),
	refreshToken: z.string().nullable().optional(),
	idToken: z.string().nullable().optional(),
	accessTokenExpiresAt: z.date().nullable().optional(),
	refreshTokenExpiresAt: z.date().nullable().optional(),
})

export const userSchema = z.object({
	id: z.string(),
	email: z.string().transform((val) => val.toLowerCase()),
	emailVerified: z.boolean().default(false),
	name: z.string(),
	image: z.string().optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export const sessionSchema = z.object({
	id: z.string(),
	userId: z.string(),
	expiresAt: z.date(),
});

export type User = z.infer<typeof userSchema>;
export type Account = z.infer<typeof accountSchema>;
export type Session = z.infer<typeof sessionSchema>;
export interface MigrationTable {
	name: string;
	timestamp: string;
}
