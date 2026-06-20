import * as z from "zod";

const claimRequestMemberSchema = z.union([
	z.null(),
	z.record(z.string(), z.unknown()),
]);

const claimsRequestObjectSchema = z
	.object({
		userinfo: z.record(z.string(), claimRequestMemberSchema).optional(),
		id_token: z.record(z.string(), claimRequestMemberSchema).optional(),
	})
	.passthrough();

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

function parseClaimsRequestObject(value: unknown) {
	const parsed = parseClaimsRequestValue(value);
	const result = claimsRequestObjectSchema.safeParse(parsed);
	return result.success ? result.data : undefined;
}

export const claimsRequestParameterSchema = z
	.union([z.string(), z.record(z.string(), z.unknown())])
	.superRefine((value, ctx) => {
		if (!parseClaimsRequestObject(value)) {
			ctx.addIssue({
				code: "custom",
				message: "claims must be a JSON object",
			});
		}
	});

export function getRequestedUserInfoClaims(
	value: unknown,
	supportedClaims?: Iterable<string>,
) {
	const claimsRequest = parseClaimsRequestObject(value);
	const userInfoClaims = claimsRequest?.userinfo;
	if (!userInfoClaims) return [];
	// `Object.keys` over a parsed object is already unique; no duplicate filtering needed.
	const names = Object.keys(userInfoClaims);
	if (!supportedClaims) return names;
	const allowed = new Set(supportedClaims);
	return names.filter((name) => allowed.has(name));
}

export function filterClaimsRequestUserInfoClaims(
	value: unknown,
	allowedUserInfoClaims: string[],
) {
	const claimsRequest = parseClaimsRequestObject(value);
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
