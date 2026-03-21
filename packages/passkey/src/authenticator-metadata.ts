// Known AAGUID values are based on:
// - https://github.com/passkeydeveloper/passkey-authenticator-aaguids
const KNOWN_AUTHENTICATOR_PROVIDERS: Record<string, string> = {
	// Google Password Manager
	"ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",

	// Apple Passwords / iCloud Keychain
	"fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "Apple Passwords",
	"dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "iCloud Keychain",

	// Dashlane
	"531126d6-e717-415c-9320-3d9aa6981239": "Dashlane",

	// Microsoft Windows Hello
	"08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
	"9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello",
	"6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",

	// 1Password
	"bada5566-a7aa-401f-bd96-45619a55120d": "1Password",
	"b5397571-8af2-4d30-9d48-eeb8eee6e9c6": "1Password",

	// Bitwarden
	"d548826e-79b4-db40-a3d8-11116f7e8349": "Bitwarden",
	"cc45f64e-52a2-451b-831a-4edd8022a202": "Bitwarden",
};

export const getKnownAuthenticatorName = (
	aaguid: string,
): string | undefined => {
	const normalized = aaguid.trim().toLowerCase();
	return KNOWN_AUTHENTICATOR_PROVIDERS[normalized];
};
