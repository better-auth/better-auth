import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { StoreIdentifierOption } from "../types";

/**
 * Prefix for single-use two-factor verification identifiers, including the
 * per-challenge attempt counters (`2fa-attempts-*`) and OTP rows (`2fa-otp-*`).
 * The secondary-storage retry in the internal adapter matches this prefix, so
 * every writer of a `2fa-*` identifier must build it from this constant —
 * a literal here would silently diverge from the matcher and lose the retry.
 *
 * Owned by the db layer (not the two-factor plugin) so the internal adapter
 * can share it without a db-to-plugin import. The plugin re-exports it from
 * its own constant module; import it from either side, never redeclare it.
 */
export const TWO_FACTOR_VERIFICATION_PREFIX = "2fa-";

const defaultKeyHasher = async (identifier: string) => {
	const hash = await createHash("SHA-256").digest(
		new TextEncoder().encode(identifier),
	);
	return base64Url.encode(new Uint8Array(hash), { padding: false });
};

export async function processIdentifier(
	identifier: string,
	option: StoreIdentifierOption | undefined,
): Promise<string> {
	if (!option || option === "plain") {
		return identifier;
	}
	if (option === "hashed") {
		return defaultKeyHasher(identifier);
	}
	if (typeof option === "object" && "hash" in option) {
		return option.hash(identifier);
	}
	return identifier;
}

export function getStorageOption(
	identifier: string,
	config:
		| StoreIdentifierOption
		| {
				default: StoreIdentifierOption;
				overrides?: Record<string, StoreIdentifierOption>;
		  }
		| undefined,
): StoreIdentifierOption | undefined {
	if (!config) {
		return undefined;
	}

	if (typeof config === "object" && "default" in config) {
		if (config.overrides) {
			for (const [prefix, option] of Object.entries(config.overrides)) {
				if (identifier.startsWith(prefix)) {
					return option;
				}
			}
		}
		return config.default;
	}

	return config;
}
