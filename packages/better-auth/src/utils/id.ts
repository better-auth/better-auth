import { alphabet, generateRandomString } from "../crypto/random";

export const generateId = (size?: number) => {
	return generateRandomString(size || 21, alphabet("a-z", "0-9", "A-Z"));
};
