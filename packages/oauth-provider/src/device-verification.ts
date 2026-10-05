import type { GenericEndpointContext } from "@better-auth/core";
import { appendQueryParams } from "@better-auth/core/utils/url";
import { APIError, getSessionFromCtx } from "better-auth/api";
import type { DeviceCode } from "better-auth/plugins/device-authorization";
import {
	claimDeviceCode,
	findDeviceCodeByUserCode,
	recordDeviceCodeDecision,
} from "better-auth/plugins/device-authorization";
import type { InteractionSession, OAuthRedirectResult } from "./authorize";
import {
	findRequiredInteraction,
	handleRedirect,
	redirectToInteraction,
	redirectWithPromptCode,
} from "./authorize";
import { saveConsent } from "./consent";
import type { OAuthOptions, Scope } from "./types";
import { getClient } from "./utils";

/** OAuth-owned fields added to the device authorization record. */
export type OAuthDeviceCodeFields = {
	oauthClientId?: string | null;
	resources?: string[] | null;
	referenceId?: string | null;
	authTime?: Date | null;
};

type OAuthDeviceCode = DeviceCode &
	OAuthDeviceCodeFields & { oauthClientId: string };

/** Whether a device code was issued to an OAuth Provider client. */
export function isOAuthDeviceCode(
	deviceCode: DeviceCode & OAuthDeviceCodeFields,
): deviceCode is OAuthDeviceCode {
	return typeof deviceCode.oauthClientId === "string";
}

type DeviceVerificationFailure = {
	error: string;
	error_description: string;
};

const invalidUserCode = {
	error: "invalid_request",
	error_description: "Invalid user code",
} satisfies DeviceVerificationFailure;

const alreadyProcessed = {
	error: "invalid_request",
	error_description: "Device code already processed",
} satisfies DeviceVerificationFailure;

export function parseScopes(scope: string | null | undefined): string[] {
	const normalized = scope?.trim();
	return normalized ? normalized.split(/\s+/) : [];
}

/**
 * Whether a resumed OAuth interaction belongs to a device authorization. Only
 * device verification signs a query with `user_code` and no `response_type`;
 * every authorization request carries `response_type`.
 */
export function isDeviceVerificationQuery(query: URLSearchParams) {
	return query.has("user_code") && !query.has("response_type");
}

async function findPendingDeviceCode(
	ctx: GenericEndpointContext,
	userCode: string,
): Promise<OAuthDeviceCode | DeviceVerificationFailure> {
	if (!ctx.context.getPlugin("device-authorization")) return invalidUserCode;
	const deviceCode: (DeviceCode & OAuthDeviceCodeFields) | null =
		await findDeviceCodeByUserCode(ctx, userCode);
	if (!deviceCode || !isOAuthDeviceCode(deviceCode)) return invalidUserCode;
	if (deviceCode.expiresAt < new Date()) {
		return {
			error: "expired_token",
			error_description: "User code has expired",
		};
	}
	if (deviceCode.status !== "pending") return alreadyProcessed;
	return deviceCode;
}

/**
 * The signed query carried through the login, post-login, and consent pages.
 * It mirrors the authorization request parameters a consent page already
 * renders, plus the `user_code` the person compares with the device.
 */
function toDeviceVerificationQuery(deviceCode: OAuthDeviceCode) {
	return {
		user_code: deviceCode.userCode,
		client_id: deviceCode.oauthClientId,
		scope: deviceCode.scope || undefined,
		resource: deviceCode.resources?.length ? deviceCode.resources : undefined,
	};
}

function matchesDeviceVerificationQuery(
	deviceCode: OAuthDeviceCode,
	query: URLSearchParams,
) {
	const resources = deviceCode.resources ?? [];
	const queryResources = query.getAll("resource");
	return (
		query.get("client_id") === deviceCode.oauthClientId &&
		(query.get("scope") ?? "") === (deviceCode.scope ?? "") &&
		queryResources.length === resources.length &&
		queryResources.every((resource, index) => resource === resources[index])
	);
}

/**
 * Sends the person back to the device verification page with the outcome, so
 * it can tell them to return to their device or to start again.
 */
function redirectToVerificationPage(
	ctx: GenericEndpointContext,
	params: Record<string, string>,
) {
	const verificationUri =
		ctx.context.getPlugin("device-authorization")?.options.verificationUri ||
		"/device";
	let verificationURL: URL;
	try {
		verificationURL = new URL(verificationUri);
	} catch {
		verificationURL = new URL(verificationUri, ctx.context.baseURL);
	}
	return handleRedirect(
		ctx,
		appendQueryParams(verificationURL.toString(), new URLSearchParams(params)),
	);
}

/**
 * Binds the code to the reviewing user and confirms its client can still be
 * authorized. Returns the failure to show on the verification page.
 */
async function authorizeDeviceReviewer(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	deviceCode: OAuthDeviceCode,
	session: InteractionSession,
): Promise<DeviceVerificationFailure | undefined> {
	const client = await getClient(ctx, opts, deviceCode.oauthClientId);
	if (!client || client.disabled) {
		return {
			error: "invalid_client",
			error_description: "The client is no longer available",
		};
	}
	if (!(await claimDeviceCode(ctx, deviceCode, session.user.id))) {
		return {
			error: "access_denied",
			error_description: "This code belongs to another account",
		};
	}
	return undefined;
}

function getRequestHeaders(ctx: GenericEndpointContext) {
	return ctx.request?.headers ?? ctx.headers ?? new Headers();
}

/**
 * Runs the provider's user interaction for a device code: sign-in, account
 * selection, registration steps, post-login selection, and then consent.
 */
async function continueDeviceInteraction(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	deviceCode: OAuthDeviceCode,
	gates: { includeAccountSelection: boolean; postLoginCleared: boolean },
): Promise<OAuthRedirectResult> {
	ctx.query = toDeviceVerificationQuery(deviceCode);
	const session = await getSessionFromCtx(ctx);
	if (!session) {
		return redirectWithPromptCode(ctx, opts, "login");
	}
	const failure = await authorizeDeviceReviewer(ctx, opts, deviceCode, session);
	if (failure) return redirectToVerificationPage(ctx, failure);

	const interaction = await findRequiredInteraction(ctx, opts, {
		headers: getRequestHeaders(ctx),
		session,
		scopes: parseScopes(deviceCode.scope),
		...gates,
	});
	if (interaction) return redirectToInteraction(ctx, opts, interaction);

	// RFC 8628 section 5.4: the person approving does not hold the device, so a
	// stored consent or `skipConsent` never approves a device code on its own.
	return redirectWithPromptCode(ctx, opts, "consent", {
		sessionId: session.session.id,
	});
}

/**
 * Starts the provider interaction for a user code entered on the device
 * verification page. Unknown, expired, or processed codes fail inline so the
 * page can ask the person to check the code.
 */
export async function verifyDeviceUserCode(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	userCode: string,
): Promise<OAuthRedirectResult> {
	const deviceCode = await findPendingDeviceCode(ctx, userCode);
	if ("error" in deviceCode) {
		throw new APIError("BAD_REQUEST", deviceCode);
	}
	return continueDeviceInteraction(ctx, opts, deviceCode, {
		includeAccountSelection: true,
		postLoginCleared: false,
	});
}

/**
 * Resumes a device interaction after sign-in, account selection,
 * registration, or post-login selection.
 */
export async function resumeDeviceVerification(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	settings: { postLogin?: boolean | undefined },
): Promise<OAuthRedirectResult> {
	const userCode = ctx.query?.user_code;
	const deviceCode = await findPendingDeviceCode(
		ctx,
		typeof userCode === "string" ? userCode : "",
	);
	if ("error" in deviceCode) {
		return redirectToVerificationPage(ctx, deviceCode);
	}
	return continueDeviceInteraction(ctx, opts, deviceCode, {
		includeAccountSelection: false,
		postLoginCleared: settings.postLogin === true,
	});
}

/**
 * Records the person's consent for a device code: resolves the consent
 * reference, saves the consent like an authorization code grant does, and
 * returns the fields the token exchange needs.
 */
export async function acceptDeviceConsent(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	input: {
		deviceCode: OAuthDeviceCode;
		session: InteractionSession;
		scopes: string[];
	},
) {
	const { deviceCode, session, scopes } = input;
	const referenceId = await opts.postLogin?.consentReferenceId?.({
		user: session.user,
		session: session.session,
		scopes,
	});
	// Consent rows reference a stored client registration. A client resolved
	// only through client discovery has none, so its approval is not recorded.
	const storedClient = await ctx.context.adapter.findOne({
		model: "oauthClient",
		where: [{ field: "clientId", value: deviceCode.oauthClientId }],
	});
	if (storedClient) {
		await saveConsent(ctx, {
			clientId: deviceCode.oauthClientId,
			userId: session.user.id,
			referenceId,
			scopes,
			requestedUserInfoClaims: [],
			resources: deviceCode.resources?.length
				? deviceCode.resources
				: undefined,
		});
	}
	return {
		scope: scopes.join(" "),
		referenceId: referenceId ?? null,
		// Captured now: the token exchange happens later, on the device.
		authTime: new Date(session.session.createdAt),
	} satisfies Pick<DeviceCode, "scope"> & OAuthDeviceCodeFields;
}

/**
 * Handles `/oauth2/consent` for a device code. Denial is recorded at once;
 * approval runs the remaining interaction gates, records consent, and approves
 * the code with the accepted scopes and consent reference.
 */
export async function completeDeviceConsent(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	body: { accept: boolean; scope?: string | undefined; claims?: unknown },
	oauthRequest: {
		query: URLSearchParams;
		postLoginClearedForSession?: string | undefined;
	},
): Promise<OAuthRedirectResult> {
	ctx.headers?.set("accept", "application/json");
	const { query } = oauthRequest;
	const deviceCode = await findPendingDeviceCode(
		ctx,
		query.get("user_code") ?? "",
	);
	if ("error" in deviceCode) {
		return redirectToVerificationPage(ctx, deviceCode);
	}
	if (!matchesDeviceVerificationQuery(deviceCode, query)) {
		return redirectToVerificationPage(ctx, invalidUserCode);
	}
	const session = await getSessionFromCtx(ctx);
	if (!session) {
		throw new APIError("UNAUTHORIZED");
	}
	const failure = await authorizeDeviceReviewer(ctx, opts, deviceCode, session);
	if (failure) return redirectToVerificationPage(ctx, failure);

	if (body.accept !== true) {
		const denied = await recordDeviceCodeDecision(ctx, {
			deviceCode,
			userId: session.user.id,
			status: "denied",
		});
		return redirectToVerificationPage(
			ctx,
			denied ? { status: "denied" } : alreadyProcessed,
		);
	}

	const requestedScopes = parseScopes(deviceCode.scope);
	const acceptedScopes =
		body.scope !== undefined ? parseScopes(body.scope) : requestedScopes;
	if (!acceptedScopes.every((scope) => requestedScopes.includes(scope))) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description: "Scope not originally requested",
		});
	}
	if (body.claims !== undefined) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description: "Claim not originally requested",
		});
	}

	const interaction = await findRequiredInteraction(ctx, opts, {
		headers: getRequestHeaders(ctx),
		session,
		scopes: acceptedScopes,
		includeAccountSelection: false,
		postLoginCleared:
			oauthRequest.postLoginClearedForSession !== undefined &&
			oauthRequest.postLoginClearedForSession === session.session.id,
	});
	if (interaction) {
		ctx.query = toDeviceVerificationQuery(deviceCode);
		return redirectToInteraction(ctx, opts, interaction);
	}

	const approved = await recordDeviceCodeDecision(ctx, {
		deviceCode,
		userId: session.user.id,
		status: "approved",
		fields: await acceptDeviceConsent(ctx, opts, {
			deviceCode,
			session,
			scopes: acceptedScopes,
		}),
	});
	return redirectToVerificationPage(
		ctx,
		approved ? { status: "approved" } : alreadyProcessed,
	);
}
