import { generateState as generateStateOAuth } from "oslo/oauth2";
import { z } from "zod";
import { hashToBase64 } from "../crypto/hash";
import { APIError } from "better-call";

export async function generateState(callbackURL?: string) {
	const code = generateStateOAuth();
	const raw = JSON.stringify({
		code,
		callbackURL,
	});
	const hash = await hashToBase64(raw);
	return { raw, hash };
}

export function parseState(state: string) {
	const data = z
		.object({
			code: z.string(),
			callbackURL: z.string().optional(),
			currentURL: z.string().optional(),
		})
		.safeParse(JSON.parse(state));
	return data;
}
