import { createHash } from "@better-auth/utils/hash";
import { base64Url } from "@better-auth/utils/base64";

export const hashClientSecret = async (clientSecret: string) => {
	const hash = await createHash("SHA-256").digest(
		new TextEncoder().encode(clientSecret),
	);
	const hashed = base64Url.encode(new Uint8Array(hash), {
		padding: false,
	});
	return hashed;
};
