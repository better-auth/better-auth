export async function hmac(secretKey: string, message: string) {
	const enc = new TextEncoder();
	const algorithm = { name: "HMAC", hash: "SHA-256" };
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(secretKey),
		algorithm,
		false,
		["sign", "verify"],
	);
	const signature = await crypto.subtle.sign(
		algorithm.name,
		key,
		enc.encode(message),
	);
	return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
