import type { GenericEndpointContext } from "../../../types";
import type { ResolvedOIDCOptions } from "./resolve-oidc-options";

import { symmetricDecrypt } from "../../../crypto";
import { defaultClientSecretHasher } from "./default-client-secret-hasher";

export async function verifyStoredClientSecret(
	ctx: GenericEndpointContext,
	options: ResolvedOIDCOptions,
	storedClientSecret: string,
	clientSecret: string,
): Promise<boolean> {
	if (options.storeClientSecret === "encrypted") {
		return (
			(await symmetricDecrypt({
				key: ctx.context.secret,
				data: storedClientSecret,
			})) === clientSecret
		);
	}
	if (options.storeClientSecret === "hashed") {
		const hashedClientSecret = await defaultClientSecretHasher(clientSecret);
		return hashedClientSecret === storedClientSecret;
	}
	if (
		typeof options.storeClientSecret === "object" &&
		"hash" in options.storeClientSecret
	) {
		const hashedClientSecret =
			await options.storeClientSecret.hash(clientSecret);
		return hashedClientSecret === storedClientSecret;
	}
	if (
		typeof options.storeClientSecret === "object" &&
		"decrypt" in options.storeClientSecret
	) {
		const decryptedClientSecret =
			await options.storeClientSecret.decrypt(storedClientSecret);
		return decryptedClientSecret === clientSecret;
	}

	return clientSecret === storedClientSecret;
}
