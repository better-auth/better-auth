import * as z from "zod";

const claimRequestMemberSchema = z.record(z.string(), z.unknown()).nullable();

const acrClaimRequestMemberSchema = z
	.looseObject({
		essential: z.boolean().optional(),
		value: z.string().optional(),
		values: z.array(z.string()).optional(),
	})
	.nullable();

const idTokenClaimsRequestSchema = z
	.object({
		acr: acrClaimRequestMemberSchema.optional(),
	})
	.catchall(claimRequestMemberSchema);

const oidcClaimsRequestObjectSchema = z.looseObject({
	userinfo: z.record(z.string(), claimRequestMemberSchema).optional(),
	id_token: idTokenClaimsRequestSchema.optional(),
});

function parseClaimsRequestValue(value: unknown) {
	if (typeof value === "string") {
		try {
			return JSON.parse(value) as unknown;
		} catch {
			return undefined;
		}
	}
	return value;
}

function parseOidcClaimsRequestObject(value: unknown) {
	const parsed = parseClaimsRequestValue(value);
	const result = oidcClaimsRequestObjectSchema.safeParse(parsed);
	return result.success ? result.data : undefined;
}

const claimsRequestParameterValueSchema = z.union([
	z.string(),
	z.record(z.string(), z.unknown()),
]);

export const claimsRequestInputSchema = claimsRequestParameterValueSchema;

export const claimsRequestParameterSchema =
	claimsRequestParameterValueSchema.refine(
		(value) => parseOidcClaimsRequestObject(value) !== undefined,
		{
			error: "claims must be a valid Claims request object",
		},
	);

export function isValidOidcClaimsRequest(value: unknown) {
	return (
		value === undefined || parseOidcClaimsRequestObject(value) !== undefined
	);
}

export function getRequestedUserInfoClaims(
	value: unknown,
	supportedClaims?: Iterable<string>,
) {
	const claimsRequest = parseOidcClaimsRequestObject(value);
	const userInfoClaims = claimsRequest?.userinfo;
	if (!userInfoClaims) return [];
	// `Object.keys` over a parsed object is already unique; no duplicate filtering needed.
	const names = Object.keys(userInfoClaims);
	if (!supportedClaims) return names;
	const allowed = new Set(supportedClaims);
	return names.filter((name) => allowed.has(name));
}

export function canSatisfyEssentialAcrRequest(
	value: unknown,
	currentAcr: string,
) {
	const claimsRequest = parseOidcClaimsRequestObject(value);
	if (!claimsRequest) return value === undefined;

	const acrRequest = claimsRequest.id_token?.acr;
	if (!acrRequest || acrRequest.essential !== true) return true;

	const valueMatches =
		acrRequest.value === undefined || acrRequest.value === currentAcr;
	const valuesMatch =
		acrRequest.values === undefined || acrRequest.values.includes(currentAcr);
	return valueMatches && valuesMatch;
}

export function filterClaimsRequestUserInfoClaims(
	value: unknown,
	allowedUserInfoClaims: string[],
) {
	const claimsRequest = parseOidcClaimsRequestObject(value);
	if (!claimsRequest) return undefined;
	const allowedClaimSet = new Set(allowedUserInfoClaims);
	const userInfoClaims = Object.fromEntries(
		Object.entries(claimsRequest.userinfo ?? {}).filter(([claim]) =>
			allowedClaimSet.has(claim),
		),
	);
	const filteredClaimsRequest = Object.keys(userInfoClaims).length
		? { ...claimsRequest, userinfo: userInfoClaims }
		: Object.fromEntries(
				Object.entries(claimsRequest).filter(([key]) => key !== "userinfo"),
			);
	return Object.keys(filteredClaimsRequest).length
		? filteredClaimsRequest
		: undefined;
}
