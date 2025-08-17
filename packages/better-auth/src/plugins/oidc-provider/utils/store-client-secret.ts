import type { GenericEndpointContext } from "../../../types";
import type { ResolvedOIDCOptions } from "./resolve-oidc-options";

import { symmetricEncrypt } from "../../../crypto";
import { defaultClientSecretHasher } from "./default-client-secret-hasher";

export async function storeClientSecret(
	ctx: GenericEndpointContext,
	options: ResolvedOIDCOptions,
	clientSecret: string,
) {
	if (options.storeClientSecret === "encrypted") {
		return await symmetricEncrypt({
			key: ctx.context.secret,
			data: clientSecret,
		});
	}
	if (options.storeClientSecret === "hashed") {
		return await defaultClientSecretHasher(clientSecret);
	}
	if (
		typeof options.storeClientSecret === "object" &&
		"hash" in options.storeClientSecret
	) {
		return await options.storeClientSecret.hash(clientSecret);
	}
	if (
		typeof options.storeClientSecret === "object" &&
		"encrypt" in options.storeClientSecret
	) {
		return await options.storeClientSecret.encrypt(clientSecret);
	}

	return clientSecret;
}
