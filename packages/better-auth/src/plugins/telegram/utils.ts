import { createHash } from "@better-auth/utils/hash";
import { createHMAC } from "@better-auth/utils/hmac";

export const buildTelegramHash = (dataFields: object) => {
	// build data string
	const dataCheckString = Object.keys(dataFields)
		.filter((key) => dataFields[key as keyof typeof dataFields] !== undefined)
		.sort()
		.map((key) => `${key}=${dataFields[key as keyof typeof dataFields]}`)
		.join("\n");

	return dataCheckString;
};

export const verifyMaxAge = ({ authDate }: { authDate: number | string }) => {
	const authDateNumber = parseInt(authDate.toString());
	const currentTime = Math.floor(Date.now() / 1000);
	const maxAge = 60 * 5; // 5 minutes in seconds

	// check if data is expired
	if (currentTime - authDateNumber > maxAge) {
		return false;
	}
	return true;
};

export const verifyHash = async ({
	botToken,
	dataFields,
	hash,
}: {
	botToken: string;
	dataFields: object;
	hash: string;
}) => {
	// build data string
	const dataCheckString = buildTelegramHash(dataFields);

	// create secret key by hashing the bot token with sha256
	const secretKey = await createHash("SHA-256").digest(botToken);

	// create hmac-sha256 signature
	const hmac = createHMAC("SHA-256", "hex");
	const key = await hmac.importKey(secretKey, "sign");
	const calculatedHash = await hmac.sign(key, dataCheckString);

	// compare with received hash
	if (calculatedHash !== hash) {
		return false;
	}
	return true;
};

export const getOriginHostname = (url: string) => {
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.hostname;
	} catch (error) {
		return null;
	}
};
