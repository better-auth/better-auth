import type { AuthContext, GenericEndpointContext } from "../../types";
import { BetterAuthError } from "../../error";
import type { jwt } from "../jwt";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { OAuthOptions } from "./types";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";

export const getJwtPlugin = (ctx: AuthContext) => {
	const plugin = ctx.options.plugins?.find((plugin) => plugin.id === "jwt");
	if (!plugin) {
		throw new BetterAuthError("jwt_config", "jwt plugin not found");
	}
	return plugin as ReturnType<typeof jwt>;
};

/**
 * Default client secret hasher using SHA-256
 */
export const defaultClientSecretHasher = async (clientSecret: string) => {
	const hash = await createHash("SHA-256").digest(
		new TextEncoder().encode(clientSecret),
	);
	const hashed = base64Url.encode(new Uint8Array(hash), {
		padding: false,
	});
	return hashed;
};

/**
 * Decrypts a storedClientSecret for signing
 */
export async function decryptStoredClientSecret(
	ctx: GenericEndpointContext,
	storageMethod: OAuthOptions["storeClientSecret"],
	storedClientSecret: string,
) {
	if (storageMethod === "encrypted") {
		return await symmetricDecrypt({
			key: ctx.context.secret,
			data: storedClientSecret,
		});
	}
	if (typeof storageMethod === "object" && "decrypt" in storageMethod) {
		return await storageMethod.decrypt(storedClientSecret);
	}

	throw new BetterAuthError(
		`Unsupported decryption storageMethod type '${storageMethod}'`,
	);
}

/**
 * Verify stored client secret against provided client secret
 */
export async function verifyStoredClientSecret(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	storedClientSecret: string,
	clientSecret?: string,
): Promise<boolean> {
	const storageMethod =
		opts.storeClientSecret ?? (opts.disableJWTPlugin ? "encrypted" : "hashed");

	if (storageMethod === "hashed") {
		const hashedClientSecret = clientSecret
			? await defaultClientSecretHasher(clientSecret)
			: undefined;
		return hashedClientSecret === storedClientSecret;
	}
	if (typeof storageMethod === "object" && "hash" in storageMethod) {
		const hashedClientSecret = clientSecret
			? await storageMethod.hash(clientSecret)
			: undefined;
		return hashedClientSecret === storedClientSecret;
	}
	if (
		storageMethod === "encrypted" ||
		(typeof storageMethod === "object" && "decrypt" in storageMethod)
	) {
		const decryptedClientSecret = await decryptStoredClientSecret(
			ctx,
			storageMethod,
			storedClientSecret,
		);
		return decryptedClientSecret === clientSecret;
	}

	throw new BetterAuthError(
		`Unsupported verify storageMethod type '${storageMethod}'`,
	);
}

/**
 * Store client secret according to the configured storage method
 */
export async function storeClientSecret(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	clientSecret: string,
) {
	const storageMethod =
		opts.storeClientSecret ?? (opts.disableJWTPlugin ? "encrypted" : "hashed");

	if (storageMethod === "encrypted") {
		return await symmetricEncrypt({
			key: ctx.context.secret,
			data: clientSecret,
		});
	}
	if (storageMethod === "hashed") {
		return await defaultClientSecretHasher(clientSecret);
	}
	if (typeof storageMethod === "object" && "hash" in storageMethod) {
		return await storageMethod.hash(clientSecret);
	}
	if (typeof storageMethod === "object" && "encrypt" in storageMethod) {
		return await storageMethod.encrypt(clientSecret);
	}

	throw new BetterAuthError(
		`Unsupported storeClientSecret type '${storageMethod}'`,
	);
}
