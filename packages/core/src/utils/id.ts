import { createRandomStringGenerator } from "@better-auth/utils/random";

export const generateId = (size?: number) => {
	return createRandomStringGenerator("a-z", "A-Z", "0-9")(size || 32);
};

export const generateUUIDv7 = (): string => {
	// 1. Generate 16 random bytes (128 bits)
	const value = new Uint8Array(16);
	crypto.getRandomValues(value);

	// 2. Get current timestamp in ms (48 bits)
	const timestamp = BigInt(Date.now());

	// 3. Inject timestamp into the first 6 bytes (Big-Endian)
	value[0] = Number((timestamp >> 40n) & 0xffn);
	value[1] = Number((timestamp >> 32n) & 0xffn);
	value[2] = Number((timestamp >> 24n) & 0xffn);
	value[3] = Number((timestamp >> 16n) & 0xffn);
	value[4] = Number((timestamp >> 8n) & 0xffn);
	value[5] = Number(timestamp & 0xffn);

	// 4. Set Version to 7 (0111) - index 6, high nibble
	value[6] = (value[6]! & 0x0f) | 0x70;

	// 5. Set Variant to 1 (10xx) - index 8, high nibble
	value[8] = (value[8]! & 0x3f) | 0x80;

	// 6. Convert to Hex String (00000000-0000-0000-0000-000000000000)
	return [...value]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
};
