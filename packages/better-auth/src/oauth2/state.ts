import {
	generateCodeVerifier,
	generateState as generateStateOAuth,
} from "oslo/oauth2";
import { z } from "zod";
import { hashToBase64, hmac } from "../crypto/hash";
import type { GenericEndpointContext } from "../types";
import { APIError } from "better-call";

export async function generateState(
	callbackURL?: string,
	link?: {
		email: string;
		userId: string;
	},
) {
	const code = generateStateOAuth();
	const raw = JSON.stringify({
		code,
		callbackURL,
		link,
	});
	const hash = await hashToBase64(raw);
	return { raw, hash };
}

export async function generateState2(c: GenericEndpointContext) {
	const callbackURL = c.body?.callbackURL;
	if (!callbackURL) {
		throw new APIError("BAD_REQUEST", {
			message: "callbackURL is required",
		});
	}
	const codeVerifier = generateCodeVerifier();
	const data = JSON.stringify({
		callbackURL,
		codeVerifier,
		errorURL: c.query?.currentURL || `${c.context.baseURL}/error`,
	});
	const signedHash = await hmac.sign({
		secret: c.context.secret,
		value: data,
	});
	return {
		state: `${data}.${signedHash}`,
		codeVerifier,
	};
}

export function parseState(state: string) {
	const data = z
		.object({
			callbackURL: z.string(),
			errorURL: z.string(),
			codeVerifier: z.string(),
			link: z
				.object({
					email: z.string(),
					userId: z.string(),
				})
				.optional(),
		})
		.safeParse(JSON.parse(state));
	return data;
}
