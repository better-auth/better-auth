import type { GenericEndpointContext } from "@better-auth/core";
import { appendQueryParams } from "@better-auth/core/utils/url";
import type { OAuthInteractionRequestHandler } from "@better-auth/oauth-provider";
import { getOAuthProviderApi } from "@better-auth/oauth-provider";
import { getAcrValuesSupported } from "@better-auth/oauth-provider/internal";
import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import { APPROVAL_PARAMETER } from "./constants";
import { pingClient } from "./delivery";
import { CIBA_ERROR_CODES, oauthError } from "./error-codes";
import type { CibaRequest } from "./schema";

// A missing, decided, or expired request and another user's request fail the
// same way, so the link reveals nothing to anyone but the user it was sent to.
const unknownRequest = () =>
	oauthError("invalid_request", CIBA_ERROR_CODES.UNKNOWN_REQUEST.message);

/**
 * Records `userId`'s decision on a request, then pings a ping-mode client. The
 * guard binds it to the hinted user and makes it one-way, so a second decision
 * or one that outlasts the request fails.
 */
async function recordDecision(
	ctx: GenericEndpointContext,
	id: string,
	userId: string,
	fields: Partial<CibaRequest>,
) {
	const decided = await ctx.context.adapter.incrementOne<CibaRequest>({
		model: "cibaRequest",
		where: [
			{ field: "id", value: id },
			{ field: "userId", value: userId },
			{ field: "status", value: "pending" },
			{ field: "expiresAt", operator: "gt", value: new Date() },
		],
		increment: {},
		set: fields,
	});
	if (!decided) return unknownRequest();
	await pingClient(ctx, decided);
}

/**
 * Lets the user approve a backchannel request from the link they were sent,
 * through the provider's sign-in, post-login, and consent pages. Consent is
 * always shown, and only the user the `login_hint` identified can decide.
 */
export function cibaApprovalRequest(
	resultPage: string,
): OAuthInteractionRequestHandler {
	const resultURL = (ctx: GenericEndpointContext, status?: string) => {
		const url = new URL(resultPage, ctx.context.baseURL).toString();
		return status
			? appendQueryParams(url, new URLSearchParams({ status }))
			: url;
	};

	return {
		load: async ({ ctx, opts, value, signedQuery }) => {
			const session = await getSessionFromCtx(ctx);
			const request = await ctx.context.adapter.findOne<CibaRequest>({
				model: "cibaRequest",
				where: [{ field: "id", value }],
			});
			if (
				!request ||
				!session ||
				request.userId !== session.user.id ||
				request.status !== "pending" ||
				request.expiresAt <= new Date()
			) {
				return unknownRequest();
			}
			const client = await getOAuthProviderApi(ctx, opts).getClient(
				request.clientId,
			);
			if (!client) return unknownRequest();
			const query = {
				[APPROVAL_PARAMETER]: request.id,
				client_id: client.clientId,
				// The consent page may have narrowed the scopes of a signed query.
				scope: signedQuery?.scope ?? request.scope,
				resource: request.resources ?? [],
				binding_message: request.bindingMessage ?? undefined,
			};
			return {
				query,
				client,
				requireConsent: true,
				approve: async (approval) => {
					const scope = approval.query.scope ?? request.scope;
					// CIBA authenticates the user, so the approved scope keeps `openid`;
					// the request stays pending for another try.
					if (!scope.split(" ").includes("openid")) {
						oauthError("invalid_scope", CIBA_ERROR_CODES.INVALID_SCOPE.message);
					}
					await recordDecision(ctx, request.id, approval.userId, {
						status: "approved",
						scope,
						referenceId: approval.referenceId ?? null,
						authTime: new Date(approval.authTime),
						acr: approval.acr ?? null,
						amr: approval.amr ?? null,
					});
					return resultURL(ctx, "approved");
				},
			};
		},
		deny: async ({ ctx, value, userId }) => {
			if (!userId) unknownRequest();
			await recordDecision(ctx, value, userId, { status: "denied" });
			return resultURL(ctx, "denied");
		},
		errorPage: ({ ctx }) => resultURL(ctx),
	};
}

/**
 * Records a decision the deployment obtained itself, such as a one-tap
 * approval in its own app, instead of through the link. The caller states who
 * decided and how they authenticated; the provider checks that it is the
 * hinted user and that the scopes stay within the request.
 */
export const completeCibaRequest = createAuthEndpoint.serverOnly(
	{
		method: "POST",
		body: z.object({
			/** `requestId` from `sendNotification`. */
			requestId: z.string().min(1),
			/** The user who decided; must be the user the `login_hint` identified. */
			userId: z.string().min(1),
			decision: z.enum(["approved", "denied"]),
			/** Approved scopes, a subset of the request's that keeps `openid`. */
			scopes: z.array(z.string()).optional(),
			/** When the user authenticated, issued as `auth_time`. */
			authTime: z.date().optional(),
			/** Issued as the ID token `acr`; must be in `acrValuesSupported`. */
			acr: z.string().optional(),
			/** Issued as the ID token `amr`. */
			amr: z.array(z.string()).optional(),
		}),
	},
	async (ctx) => {
		const { requestId, userId, decision, acr, amr } = ctx.body;
		if (decision === "denied") {
			await recordDecision(ctx, requestId, userId, { status: "denied" });
			return ctx.json({ status: true });
		}
		const request = await ctx.context.adapter.findOne<CibaRequest>({
			model: "cibaRequest",
			where: [{ field: "id", value: requestId }],
		});
		// Another user's request fails as an unknown one, before its scopes are read.
		if (!request || request.userId !== userId) return unknownRequest();
		const requested = request.scope.split(" ");
		const scopes = ctx.body.scopes ?? requested;
		if (scopes.some((scope) => !requested.includes(scope))) {
			oauthError("invalid_scope", CIBA_ERROR_CODES.SCOPE_NOT_REQUESTED.message);
		}
		if (!scopes.includes("openid")) {
			oauthError("invalid_scope", CIBA_ERROR_CODES.INVALID_SCOPE.message);
		}
		const oauthOptions = ctx.context.getPlugin("oauth-provider")!.options;
		if (
			acr !== undefined &&
			!getAcrValuesSupported(oauthOptions).includes(acr)
		) {
			oauthError("invalid_request", CIBA_ERROR_CODES.UNSUPPORTED_ACR.message);
		}
		await recordDecision(ctx, requestId, userId, {
			status: "approved",
			scope: scopes.join(" "),
			authTime: ctx.body.authTime ?? null,
			acr: acr ?? null,
			amr: amr?.length ? amr : null,
		});
		return ctx.json({ status: true });
	},
);
