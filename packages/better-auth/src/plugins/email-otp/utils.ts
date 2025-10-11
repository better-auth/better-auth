import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
export const defaultKeyHasher = async (otp: string) => {
	const hash = await createHash("SHA-256").digest(
		new TextEncoder().encode(otp),
	);
	const hashed = base64Url.encode(new Uint8Array(hash), {
		padding: false,
	});
	return hashed;
};

export function splitAtLastColon(input: string): [string, string] {
	const idx = input.lastIndexOf(":");
	if (idx === -1) {
		return [input, ""];
	}
	return [input.slice(0, idx), input.slice(idx + 1)];
}
