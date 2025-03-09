import type { SupportedSocialProvider } from "../supported-social-providers";

export const generateSocialProviders = (
	socialProviders: SupportedSocialProvider[],
) => {
	let socialProvidersCode = "";

	if (socialProviders.length > 0) {
		socialProvidersCode = `socialProviders: {\n`;
		for (const socialProvider of socialProviders) {
			socialProvidersCode += `${socialProvider.id}: {\n`;
			for (const key of socialProvider.requiredKeys) {
				socialProvidersCode += `${key}: process.env.${convertToEnvCase(
					socialProvider.id,
				)}_${convertToEnvCase(key)}!,\n`;
			}
			socialProvidersCode += `},\n`;
		}
		socialProvidersCode += `},`;
	}
	return socialProvidersCode;
};

function convertToEnvCase(str: string) {
	// replace capital letters with _<capital letter>
	// then uppercase the string
	return str
		.replace(/[A-Z]/g, (match) => `_${match.toUpperCase()}`)
		.toUpperCase();
}
