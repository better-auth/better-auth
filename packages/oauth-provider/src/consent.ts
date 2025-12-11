import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, getSessionFromCtx } from "better-auth/api";
import { authorizeEndpoint, formatErrorURL } from "./authorize";
import { oAuthState } from "./oauth";
import type { OAuthConsent, OAuthOptions, Scope } from "./types";

export async function consentEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	// Obtain oauth query
	const _query = (await oAuthState.get())?.query as string | undefined;
	if (!_query) {
		throw new APIError("BAD_REQUEST", {
			error_description: "missing oauth query",
			error: "invalid_request",
		});
	}
	const query = new URLSearchParams(_query);
	const originalRequestedScopes = query.get("scope")?.split(" ") ?? [];
	const clientId = query.get("client_id");
	if (!clientId) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client_id is required",
			error: "invalid_client",
		});
	}

	// Check scopes if received (can only be equal or lesser than originally requested scopes)
	const requestedScopes = (ctx.body.scope as string | undefined)?.split(" ");
	if (requestedScopes) {
		if (!requestedScopes.every((sc) => originalRequestedScopes?.includes(sc))) {
			throw new APIError("BAD_REQUEST", {
				error_description: "Scope not originally requested",
				error: "invalid_request",
			});
		}
	}

	// Consent not accepted (ensure it's strictly boolean true)
	const accepted = ctx.body.accept === true;
	if (!accepted) {
		return {
			redirect: true,
			uri: formatErrorURL(
				query.get("redirect_uri") ?? "",
				"access_denied",
				"User denied access",
				query.get("state") ?? undefined,
			),
		};
	}

	// Consent accepted
	const session = await getSessionFromCtx(ctx);
	const referenceId = await opts.postLogin?.consentReferenceId?.({
		user: session?.user!,
		session: session?.session!,
		scopes: requestedScopes ?? originalRequestedScopes,
	});
	const foundConsent = await ctx.context.adapter.findOne<OAuthConsent<Scope[]>>(
		{
			model: "oauthConsent",
			where: [
				{
					field: "clientId",
					value: clientId,
				},
				{
					field: "userId",
					value: session?.user.id!,
				},
				...(referenceId
					? [
							{
								field: "referenceId",
								value: referenceId,
							},
						]
					: []),
			],
		},
	);
	const iat = Math.floor(Date.now() / 1000);
	const consent: Omit<OAuthConsent<Scope[]>, "id"> = {
		clientId: clientId,
		userId: session?.user.id!,
		scopes: requestedScopes ?? originalRequestedScopes,
		createdAt: new Date(iat * 1000),
		updatedAt: new Date(iat * 1000),
		referenceId,
	};
	foundConsent?.id
		? await ctx.context.adapter.update({
				model: "oauthConsent",
				where: [
					{
						field: "id",
						value: foundConsent.id,
					},
				],
				update: {
					scopes: consent.scopes,
					updatedAt: new Date(iat * 1000),
				},
			})
		: await ctx.context.adapter.create({
				model: "oauthConsent",
				data: {
					...consent,
					scopes: consent.scopes,
				},
			});

	// Return authorization code
	ctx?.headers?.set("accept", "application/json");
	let prompts = query.get("prompt")?.split(" ");
	const foundPrompt = prompts?.findIndex((v) => v === "consent") ?? -1;
	if (foundPrompt >= 0) {
		prompts?.splice(foundPrompt, 1);
		prompts?.length
			? query.set("prompt", prompts.join(" "))
			: query.delete("prompt");
	}
	ctx.context.postLogin = true;
	ctx.query = Object.fromEntries(query);
	const { url } = await authorizeEndpoint(ctx, opts);
	return {
		redirect: true,
		uri: url,
	};
}
