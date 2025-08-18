import type { GenericEndpointContext } from "../../../types";
import type { ResolvedOIDCOptions } from "./resolve-oidc-options";

import { symmetricDecrypt } from "../../../crypto";
import { hashClientSecret } from "./hash-client-secret";

export async function verifyClientSecret(
	ctx: GenericEndpointContext,
	options: ResolvedOIDCOptions,
	storedClientSecret: string,
	clientSecret: string,
): Promise<boolean> {
	if (options.storeClientSecret === "encrypted") {
		const decryptedClientSecret = await symmetricDecrypt({
			key: ctx.context.secret,
			data: storedClientSecret,
		});
		return decryptedClientSecret === clientSecret;
	}
	if (options.storeClientSecret === "hashed") {
		const hashedClientSecret = await hashClientSecret(clientSecret);
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
