import type { OAuthActorClaim } from "@better-auth/oauth-provider";
import * as z from "zod";
import { CIBA_ERROR_CODES, oauthError } from "./error-codes";

// RFC 8693 §4.1: `sub` names the actor, and a nested `act` the one before it.
const actorSchema: z.ZodType<OAuthActorClaim> = z.lazy(() =>
	z.looseObject({
		sub: z.string().min(1),
		sub_profile: z.string().optional(),
		act: actorSchema.optional(),
	}),
);

/**
 * Checks that an actor from `resolveActor`, or one read back from storage,
 * has the RFC 8693 `act` shape. A malformed actor is a server fault, so it
 * fails with `server_error` instead of issuing a malformed `act`.
 */
export function parseActor(actor: unknown): OAuthActorClaim {
	const result = actorSchema.safeParse(actor);
	if (!result.success) {
		oauthError(
			"server_error",
			CIBA_ERROR_CODES.INVALID_ACTOR.message,
			"INTERNAL_SERVER_ERROR",
		);
	}
	return result.data;
}
