import { base64Url } from "@better-auth/utils/base64";
import { hex } from "@better-auth/utils/hex";
import { logger } from "../../env";
import type { BetterAuthOptions } from "../../types";
import { generateId as defaultGenerateId } from "../../utils/id";
import type { BetterAuthDBSchema, DBFieldAttribute } from "../type";
import { initGetDefaultModelName } from "./get-default-model-name";

let warnedSerialDeterministicId = false;

/**
 * Encodes a digest as a primary key that the configured
 * `advanced.database.generateId` strategy keeps when the record is created
 * with `forceAllowId`.
 *
 * Single-use records key their row by an id derived from the value they
 * guard, so a duplicate insert is the first-writer-wins gate. The id field
 * replaces a forced id that does not fit the strategy with a fresh one, which
 * would let every insert win. Under `"uuid"` the first 16 bytes are formatted
 * with version 5 and RFC 9562 variant bits, the shape the id field accepts.
 * Other string strategies get the base64url digest. Under `"serial"` the
 * base64url digest is still replaced by a database number, so the record is
 * not single use; this logs a warning once per process.
 *
 * @internal Shared by Better Auth packages; not a supported public API.
 * @param digest - A hash of the guarded value, at least 16 bytes long.
 */
export function encodeDeterministicId(
	digest: Uint8Array,
	options: Pick<BetterAuthOptions, "advanced">,
): string {
	const generateId = options.advanced?.database?.generateId;
	if (generateId === "serial" && !warnedSerialDeterministicId) {
		// FIXME(serial-derived-ids): a database-generated number cannot hold
		// a derived id, so the id field replaces it and the insert no longer
		// enforces single use. Reject "serial" here in a breaking release, or
		// key these records by a unique column the id strategy does not own.
		warnedSerialDeterministicId = true;
		logger.warn(
			'Single-use checks (such as SAML assertion IDs, DPoP proofs, and private_key_jwt assertions) need string ids and are not enforced with `advanced.database.generateId: "serial"`.',
		);
	}
	if (generateId !== "uuid") {
		return base64Url.encode(digest, { padding: false });
	}
	const bytes = digest.slice(0, 16);
	bytes[6] = (bytes[6]! & 0x0f) | 0x50;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const value = hex.encode(bytes);
	return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export const initGetIdField = ({
	usePlural,
	schema,
	disableIdGeneration,
	options,
	customIdGenerator,
	supportsUUIDs,
}: {
	usePlural?: boolean;
	schema: BetterAuthDBSchema;
	options: BetterAuthOptions;
	disableIdGeneration?: boolean;
	customIdGenerator?: ((props: { model: string }) => string) | undefined;
	supportsUUIDs?: boolean;
}) => {
	const getDefaultModelName = initGetDefaultModelName({
		usePlural: usePlural,
		schema,
	});

	const idField = ({
		customModelName,
		forceAllowId,
	}: {
		customModelName?: string;
		forceAllowId?: boolean;
	}) => {
		const useNumberId = options.advanced?.database?.generateId === "serial";
		const useUUIDs = options.advanced?.database?.generateId === "uuid";

		const shouldGenerateId: boolean = (() => {
			if (disableIdGeneration) {
				return false;
			} else if (useNumberId && !forceAllowId) {
				// if force allow is true, then we should be using their custom provided id.
				return false;
			} else if (useUUIDs) {
				// should only generate UUIDs via JS if the database doesn't support natively generating UUIDs.
				return !supportsUUIDs;
			} else {
				return true;
			}
		})();

		const model = getDefaultModelName(customModelName ?? "id");
		return {
			type: useNumberId ? "number" : "string",
			required: shouldGenerateId ? true : false,
			...(shouldGenerateId
				? {
						defaultValue() {
							if (disableIdGeneration) return undefined;
							const generateId = options.advanced?.database?.generateId;

							// let the database handle id generation
							if (generateId === false || generateId === "serial")
								return undefined;

							// user-provided function takes highest priority
							if (typeof generateId === "function") {
								return generateId({
									model,
								});
							}

							// user-provided "uuid" option
							if (generateId === "uuid") {
								return crypto.randomUUID();
							}

							// database adapter-level custom id generator
							if (customIdGenerator) {
								return customIdGenerator({ model });
							}

							// fallback to default id generation
							return defaultGenerateId();
						},
					}
				: {}),
			transform: {
				input: (value) => {
					// Uncomment if need to debug id transformation
					// console.log(`transforming id: `, {
					// 	id: value,
					// 	...(useNumberId ? { useNumberId } : {}),
					// 	...(useUUIDs ? { useUUIDs } : {}),
					// 	...(forceAllowId ? { forceAllowId } : {}),
					// });
					if (!value) return undefined;

					if (useNumberId) {
						const numberValue = Number(value);
						// if invalid number, fallback to DB generated number id.
						if (isNaN(numberValue)) {
							return undefined;
						}
						return numberValue;
					}

					if (useUUIDs) {
						// if it's generated by us, then we should return the value as is.
						if (shouldGenerateId && !forceAllowId) return value;
						if (disableIdGeneration) return undefined;
						// if forceAllowId is true, it means we should be using the ID provided during the adapter call.
						if (forceAllowId && typeof value === "string") {
							const uuidRegex =
								/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
							if (uuidRegex.test(value)) {
								return value;
							} else {
								const err = new Error();
								const stack = err.stack
									?.split("\n")
									.filter((_, i) => i !== 1)
									.join("\n")
									.replace("Error:", "");
								logger.warn(
									"[Adapter Factory] - Invalid UUID value for field `id` provided when `forceAllowId` is true. Generating a new UUID.",
									stack,
								);
							}
						}
						// if DB will handle UUID generation, then we should return undefined.
						if (supportsUUIDs) return undefined;
						// if the value is not a string, and the database doesn't support generating it's own UUIDs, then we should be generating the UUID.
						if (typeof value !== "string" && !supportsUUIDs) {
							return crypto.randomUUID();
						}
						return undefined;
					}

					return value;
				},
				output: (value) => {
					if (!value) return undefined;
					return String(value);
				},
			},
		} satisfies DBFieldAttribute;
	};

	return idField;
};
