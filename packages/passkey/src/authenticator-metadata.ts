/**
 * Best-effort map of common authenticator AAGUIDs to a human-readable provider
 * name, for labeling passkeys in management UIs.
 *
 * An AAGUID identifies an authenticator *model* (not a device or a user) and is
 * present only in the registration response. Better Auth stores it on every
 * passkey row and returns it from `listPasskeys`, so a display label can be
 * resolved wherever passkeys are rendered.
 *
 * This list is intentionally small and not authoritative. Many authenticators
 * are missing, and privacy-preserving platforms report an all-zero AAGUID
 * (`00000000-0000-0000-0000-000000000000`) that matches nothing here. Notably,
 * Apple devices zero the AAGUID under the default `attestation: "none"` flow, so
 * the Apple entries below only appear in attested or managed contexts. For full
 * coverage, resolve against the community-maintained source instead:
 *
 * - https://github.com/passkeydeveloper/passkey-authenticator-aaguids
 *
 * Names mirror that source verbatim.
 */
export const commonAuthenticatorNames: Record<string, string> = {
	"ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
	"fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "Apple Passwords",
	"dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "iCloud Keychain (Managed)",
	"08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
	"9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello",
	"6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",
	"bada5566-a7aa-401f-bd96-45619a55120d": "1Password",
	"d548826e-79b4-db40-a3d8-11116f7e8349": "Bitwarden",
	"531126d6-e717-415c-9320-3d9aa6981239": "Dashlane",
	"b78a0a55-6ef8-d246-a042-ba0f6d55050c": "LastPass",
	"b84e4048-15dc-4dd0-8640-f4f60813c8af": "NordPass",
	"50726f74-6f6e-5061-7373-50726f746f6e": "Proton Pass",
	"0ea242b4-43c4-4a1b-8b17-dd6d0b6baec6": "Keeper",
	"53414d53-554e-4700-0000-000000000000": "Samsung Pass",
};

/**
 * Resolve a best-effort provider name for an authenticator AAGUID.
 *
 * Returns `undefined` when the AAGUID is unknown, empty, or the all-zero value
 * reported by privacy-preserving platforms. Casing and surrounding whitespace
 * are normalized before lookup.
 *
 * @example
 * ```ts
 * const label = passkey.name || getAuthenticatorName(passkey.aaguid) || "Passkey";
 * ```
 */
// Reserved by WebAuthn for authenticators that decline to identify their model.
const ANONYMOUS_AAGUID = "00000000-0000-0000-0000-000000000000";

export const getAuthenticatorName = (
	aaguid: string | null | undefined,
): string | undefined => {
	const normalized = aaguid?.trim().toLowerCase();
	if (!normalized || normalized === ANONYMOUS_AAGUID) return undefined;
	// Guard the value type so inherited members (`toString`, `__proto__`, ...)
	// reached by index lookup never escape as a "name".
	const name = commonAuthenticatorNames[normalized];
	return typeof name === "string" ? name : undefined;
};
