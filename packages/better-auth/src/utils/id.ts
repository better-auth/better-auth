import { alphabet, generateRandomString } from "oslo/crypto";
export const generateId = () => {
	return generateRandomString(36, alphabet("a-z", "0-9"));
};
