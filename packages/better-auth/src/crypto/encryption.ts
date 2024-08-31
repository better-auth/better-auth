async function importKeyFromString(keyString: string): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const keyData = encoder.encode(keyString);
	return crypto.subtle.importKey(
		"raw",
		keyData,
		{
			name: "AES-GCM",
			length: 256,
		},
		false,
		["encrypt", "decrypt"],
	);
}

export async function symmetricEncrypt({
	data,
	key,
}: {
	data: string;
	key: string;
}): Promise<string> {
	const _key = await importKeyFromString(key);
	const encoder = new TextEncoder();
	const iv = crypto.getRandomValues(new Uint8Array(12)); // Initialization vector

	const encryptedContent = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv: iv,
		},
		_key,
		encoder.encode(data),
	);

	const encryptedArray = new Uint8Array(
		iv.byteLength + encryptedContent.byteLength,
	);
	encryptedArray.set(iv);
	encryptedArray.set(new Uint8Array(encryptedContent), iv.byteLength);

	return Buffer.from(encryptedArray).toString("base64");
}

export async function symmetricDecrypt({
	data,
	key,
}: {
	data: string;
	key: string;
}): Promise<string> {
	const _key = await importKeyFromString(key);
	const encryptedArray = new Uint8Array(Buffer.from(data, "base64"));
	const iv = encryptedArray.slice(0, 12);
	const encryptedContent = encryptedArray.slice(12);
	const decryptedContent = await crypto.subtle.decrypt(
		{
			name: "AES-GCM",
			iv: iv,
		},
		_key,
		encryptedContent,
	);
	const decoder = new TextDecoder();
	return decoder.decode(decryptedContent);
}
