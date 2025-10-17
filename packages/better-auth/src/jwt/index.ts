import type { JWTPayload } from "jose";
import {
	base64url,
	calculateJwkThumbprint,
	EncryptJWT,
	jwtDecrypt,
} from "jose";
import { hkdf, sha256 } from "@noble/hashes/webcrypto.js";
import { getCurrentAuthContext } from "@better-auth/core/context";
import type { BetterAuthOptions } from "@better-auth/core";

export type JWT = JWTPayload & Record<string, unknown>;

export function isCookieCacheEnabled(options: BetterAuthOptions): boolean {
	return options.session?.cookieCache?.enabled === true;
}

// "BetterAuth.js Generated Encryption Key"
const info: Uint8Array = new Uint8Array([
	66, 101, 116, 116, 101, 114, 65, 117, 116, 104, 46, 106, 115, 32, 71, 101,
	110, 101, 114, 97, 116, 101, 100, 32, 69, 110, 99, 114, 121, 112, 116, 105,
	111, 110, 32, 75, 101, 121,
]);

const now = () => (Date.now() / 1000) | 0;

const alg = "dir";
const enc = "A256CBC-HS512"; // 64 bytes key

type JWTString<T extends JWT> = string & {
	__type?: "jwt_token";
	payload?: T;
};

export async function symmetricEncode<T extends JWT>(
	payload: T,
	salt: string,
): Promise<JWTString<T>> {
	const { context } = await getCurrentAuthContext();
	const secret = context.secret;
	const expiresIn = context.sessionConfig.expiresIn;
	const encryptionSecret = await hkdf(
		sha256,
		new TextEncoder().encode(secret),
		new TextEncoder().encode(salt),
		info,
		64,
	);

	const thumbprint = await calculateJwkThumbprint(
		{ kty: "oct", k: base64url.encode(encryptionSecret) },
		"sha256",
	);
	return await new EncryptJWT(payload)
		.setProtectedHeader({ alg, enc, kid: thumbprint })
		.setIssuedAt()
		.setExpirationTime(now() + expiresIn)
		.setJti(crypto.randomUUID())
		.encrypt(encryptionSecret);
}

export async function symmetricDecode<T extends string>(
	token: T,
	salt: string,
): Promise<T extends JWTString<infer Payload> ? Payload | null : JWT | null> {
	const { context } = await getCurrentAuthContext();
	const secret = context.secret;
	if (!token) return null as any;
	try {
		const { payload } = await jwtDecrypt(
			token,
			async ({ kid }) => {
				const encryptionSecret = await hkdf(
					sha256,
					new TextEncoder().encode(secret),
					new TextEncoder().encode(salt),
					info,
					64,
				);
				if (kid === undefined) return encryptionSecret;

				const thumbprint = await calculateJwkThumbprint(
					{ kty: "oct", k: base64url.encode(encryptionSecret) },
					"sha256",
				);
				if (kid === thumbprint) return encryptionSecret;

				throw new Error("no matching decryption secret");
			},
			{
				clockTolerance: 15,
				keyManagementAlgorithms: [alg],
				contentEncryptionAlgorithms: [enc, "A256GCM"],
			},
		);
		return payload as any;
	} catch (error) {
		return null as any;
	}
}

/**
 * Encode session data with user info into JWT for stateless sessions
 */
export async function encodeSessionJWT<
	TSession extends Record<string, unknown>,
	TUser extends Record<string, unknown>,
>(data: { session: TSession; user: TUser }): Promise<string> {
	const salt = "better-auth-session";

	return symmetricEncode(
		{
			session: data.session,
			user: data.user,
		},
		salt,
	);
}

/**
 * Decode session JWT to get session and user data
 */
export async function decodeSessionJWT(token: string): Promise<{
	session: Record<string, unknown>;
	user: Record<string, unknown>;
} | null> {
	const salt = "better-auth-session";

	const payload = await symmetricDecode(token, salt);
	if (!payload || !payload.session || !payload.user) {
		return null;
	}
	return {
		session: payload.session as Record<string, unknown>,
		user: payload.user as Record<string, unknown>,
	};
}
