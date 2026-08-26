import type { BetterAuthOptions } from "@better-auth/core";
import { tryGetCurrentAuthEndpointContext } from "@better-auth/core/context";
import * as z from "zod";

const defaultEmailSchema = z.email();

/**
 * Check an email address with the configured validator, falling back to the
 * default Zod email validation.
 */
export async function isValidEmail(
	email: string,
	options?: BetterAuthOptions | undefined,
): Promise<boolean> {
	const validator = options?.user?.emailValidator;
	if (validator) {
		return await validator(email);
	}
	return defaultEmailSchema.safeParse(email).success;
}

/**
 * Email schema shared by built-in endpoints. The endpoint context makes the
 * configured validator available while keeping validation in the schema layer.
 */
export const emailSchema = z
	.string()
	.refine(
		async (email) => {
			const ctx = tryGetCurrentAuthEndpointContext();
			return await isValidEmail(email, ctx?.context.options);
		},
		{ message: "Invalid email address" },
	)
	.meta({ format: "email" });
