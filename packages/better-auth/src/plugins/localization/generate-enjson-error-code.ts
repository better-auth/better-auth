import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { betterAuth } from "../../index";
import {
	admin,
	anonymous,
	apiKey,
	emailOTP,
	genericOAuth,
	haveIBeenPwned,
	multiSession,
	organization,
	phoneNumber,
	twoFactor,
	username,
} from "../index";

const auth = betterAuth({});
const errorCodeSources = {
	auth: auth.$ERROR_CODES,
	organization: organization().$ERROR_CODES,
	twoFactor: twoFactor().$ERROR_CODES,
	username: username().$ERROR_CODES,
	// bearer: bearer().$ERROR_CODES,
	// magicLink: magicLink().$ERROR_CODES,
	phoneNumber: phoneNumber().$ERROR_CODES,
	anonymous: anonymous().$ERROR_CODES,
	admin: admin().$ERROR_CODES,
	genericOAuth: genericOAuth({ config: [] }).$ERROR_CODES,
	// jwt: jwt().$ERROR_CODES,
	multiSession: multiSession().$ERROR_CODES,
	emailOTP: emailOTP({ sendVerificationOTP: async () => {} }).$ERROR_CODES,
	// oneTap: oneTap().$ERROR_CODES,
	// oAuthProxy: oAuthProxy().$ERROR_CODES,
	// customSession: customSession().$ERROR_CODES,
	// openAPI: openAPI().$ERROR_CODES,
	// oidcProvider: oidcProvider({ loginPage: "" }).$ERROR_CODES,
	// captcha: captcha({ secretKey: "", provider: "google-recaptcha" }).$ERROR_CODES,
	apiKey: apiKey().$ERROR_CODES,
	haveIBeenPwned: haveIBeenPwned().$ERROR_CODES,
	// oneTimeToken: oneTimeToken().$ERROR_CODES,
	// mcp: mcp({ loginPage: "" }).$ERROR_CODES,
};

export const generateEnJsonErrorCodes = () => {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	const outputPath = path.resolve(
		__dirname,
		// "../../locales/error-codes/en.json",
		"../../locales/en.json",
	);
	const outputDir = path.dirname(outputPath);
	// create directory if not exists
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}
	// write all error codes to JSON without grouping by auth, organization, etc.
	const allErrorEntries = Object.entries(errorCodeSources).flatMap(
		([, codes]) => Object.entries(codes),
	);

	const errorCodeDict = allErrorEntries.reduce(
		(acc, [key, value]) => {
			acc[key] = value;
			return acc;
		},
		{} as Record<string, string>,
	);

	// sort by key
	const sortedErrorCodeDict = Object.keys(errorCodeDict)
		.sort()
		.reduce(
			(acc, key) => {
				acc[key] = errorCodeDict[key];
				return acc;
			},
			{} as Record<string, string>,
		);

	fs.writeFileSync(
		outputPath,
		JSON.stringify(sortedErrorCodeDict, null, 2),
		"utf-8",
	);
};

// ESM環境で直接実行された場合のみ実行
if (import.meta.url === `file://${process.argv[1]}`) {
	generateEnJsonErrorCodes();
}
