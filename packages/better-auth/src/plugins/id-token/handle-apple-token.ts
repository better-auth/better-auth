import { importJWK, jwtVerify, decodeJwt } from "jose";
import { betterFetch } from "@better-fetch/fetch";
import { APIError } from "better-call";
import type { GenericEndpointContext } from "../../types";
import { z } from "zod";

export const APPLE_BASE_URL = "https://appleid.apple.com";
export const JWKS_APPLE_URI = "/auth/keys";

export const getApplePublicKey = async (kid: string) => {
	const { data } = await betterFetch<{
		keys: Array<{
			kid: string;
			alg: string;
			kty: string;
			use: string;
			n: string;
			e: string;
		}>;
	}>(`${APPLE_BASE_URL}${JWKS_APPLE_URI}`);
	if (!data?.keys) {
		throw new APIError("BAD_REQUEST", {
			message: "Keys not found",
		});
	}
	const jwk = data.keys.find((key) => key.kid === kid);
	if (!jwk) {
		throw new Error(`JWK with kid ${kid} not found`);
	}
	return await importJWK(jwk, jwk.alg);
};

export const handleAppleToken = async (ctx: GenericEndpointContext) => {
	const clientId = ctx.context.options.socialProviders?.apple?.clientId;
	const idToken = ctx.body.idToken as string;
	const nonce = ctx.body.nonce as string | undefined;
	if (!clientId) {
		throw new APIError("BAD_REQUEST", {
			message: "Apple client id not found",
		});
	}

	try {
		const decodedHeader = decodeJwt(idToken);
		const { kid, alg: jwtAlg } = decodedHeader.header as {
			kid: string;
			alg: string;
		};
		const publicKey = await getApplePublicKey(kid);
		const { payload: jwtClaims } = await jwtVerify(idToken, publicKey, {
			algorithms: [jwtAlg],
			issuer: APPLE_BASE_URL,
			audience: clientId,
			maxTokenAge: "1h",
		});

		["email_verified", "is_private_email"].forEach((field) => {
			if (jwtClaims[field] !== undefined) {
				jwtClaims[field] = Boolean(jwtClaims[field]);
			}
		});

		const schema = z.object({
			email: z.string().email(),
			email_verified: z.boolean(),
			name: z.string().optional(),
			picture: z.string().url().optional(),
			sub: z.string(),
			is_private_email: z.boolean().optional(),
		});
		const userInfo = schema.parse(jwtClaims);

		if (nonce && jwtClaims.nonce !== nonce) {
			throw new APIError("UNAUTHORIZED", {
				message: "Nonce mismatch",
			});
		}

		return {
			user: {
				email: userInfo.email,
				emailVerified: userInfo.email_verified,
				name: userInfo.name || "",
				image: userInfo.picture,
			},
			account: {
				accountId: userInfo.sub,
				providerId: "apple",
			},
		};
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new APIError("BAD_REQUEST", {
				message: "Invalid token payload",
				details: error.errors,
			});
		}
		if (error instanceof Error) {
			throw new APIError("UNAUTHORIZED", {
				message: "Token verification failed",
				details: error.message,
			});
		}
		throw error;
	}
};
