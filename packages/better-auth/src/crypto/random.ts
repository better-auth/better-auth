import { createRandomStringGenerator } from "@better-auth/utils/random";
export const generateRandomString = createRandomStringGenerator(
	"a-z",
	"0-9",
	"A-Z",
	"-_",
);
