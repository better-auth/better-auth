import type { GenericEndpointContext } from "@better-auth/core";
import type { SchemaClient, Scope } from "@better-auth/oauth-provider";
import * as z from "zod";
import { CIBA_ERROR_CODES, oauthError } from "./error-codes";
import type { CibaAuthorizationDetail, ResolvedCibaOptions } from "./types";

// RFC 9396 §2 and §2.2: a `type` and, when present, well-typed common fields.
const detailsSchema = z.array(
	z.looseObject({
		type: z.string(),
		locations: z.array(z.string()).optional(),
		actions: z.array(z.string()).optional(),
		datatypes: z.array(z.string()).optional(),
		identifier: z.string().optional(),
		privileges: z.array(z.string()).optional(),
	}),
);

const invalid = (): never =>
	oauthError(
		"invalid_authorization_details",
		CIBA_ERROR_CODES.INVALID_AUTHORIZATION_DETAILS.message,
	);

/**
 * Checks authorization details against RFC 9396 §2 and the configured types,
 * running each type's `validate`. Anything else fails with
 * `invalid_authorization_details` (RFC 9396 §5).
 */
export async function validateAuthorizationDetails(
	details: unknown,
	input: {
		options: ResolvedCibaOptions;
		client: SchemaClient<Scope[]>;
		ctx: GenericEndpointContext;
		/** When set, each detail's type must be among these. */
		allowedTypes?: string[];
	},
): Promise<CibaAuthorizationDetail[]> {
	const parsed = detailsSchema.safeParse(details);
	if (!parsed.success) return invalid();
	const types = input.options.authorizationDetailsTypes ?? {};
	for (const detail of parsed.data) {
		if (
			!Object.hasOwn(types, detail.type) ||
			(input.allowedTypes && !input.allowedTypes.includes(detail.type))
		) {
			return invalid();
		}
		const valid = await types[detail.type]!.validate(
			detail,
			{ client: input.client },
			input.ctx,
		);
		if (!valid) return invalid();
	}
	return parsed.data;
}

/** Serializes details for the `cibaRequest.authorizationDetails` column. */
export function storeAuthorizationDetails(
	details: CibaAuthorizationDetail[] | undefined,
): string | null {
	return details?.length ? JSON.stringify(details) : null;
}

/** Reads the stored details; `undefined` when the request has none. */
export function readAuthorizationDetails(
	stored: string | null | undefined,
): CibaAuthorizationDetail[] | undefined {
	return stored ? (JSON.parse(stored) as CibaAuthorizationDetail[]) : undefined;
}

/**
 * Parses the form-encoded `authorization_details` (RFC 9396 §2), which a
 * request must send as a non-empty JSON array when it sends it at all.
 */
export function parseAuthorizationDetails(value: string): unknown {
	let details: unknown;
	try {
		details = JSON.parse(value);
	} catch {
		return invalid();
	}
	if (Array.isArray(details) && details.length === 0) return invalid();
	return details;
}
