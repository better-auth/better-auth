import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { StoreIdentifierOption } from "../types";

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
