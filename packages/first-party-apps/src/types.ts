import type { GenericEndpointContext } from "@better-auth/core";
import type {
	OAuthBeforeTokenIssuanceInput,
	SchemaClient,
	Scope,
	StoredAuthorizationQuery,
} from "@better-auth/oauth-provider";
import type { User } from "better-auth/types";

/**
 * Where an `auth_session` stands.
 *
 * - `pending`: the user has not finished signing in.
 * - `authenticated`: the user signed in and a code was issued. The handle
 *   stays usable while its sign-in session is live.
 * - `step_up`: the token endpoint asked for stronger authentication of an
 *   existing grant (draft §6.2).
 */
export type FirstPartyAuthSessionState =
	| "pending"
	| "authenticated"
	| "step_up";

/**
 * The `auth_session` a strategy is called for. Read it to continue a
 * challenge the strategy started on an earlier request.
 */
export interface FirstPartyAuthSession {
	state: FirstPartyAuthSessionState;
	/**
	 * The validated authorization request: `client_id`, `scope`, `login_hint`,
	 * and the other authorization parameters of the first request.
	 */
	query: StoredAuthorizationQuery & { client_id: string };
	/** The user an earlier round identified, such as before a second factor. */
	userId?: string;
	/** Methods earlier rounds verified (RFC 8176). */
	amr: string[];
	/** The challenge an earlier round of this strategy answered with. */
	challenge?: {
		/** The `challengeType` the strategy returned. */
		type: string;
		/** The `state` the strategy returned with it. */
		state?: Record<string, unknown>;
	};
	/** For a `step_up` session: the `acr_values` the step-up requires. */
	acrValues?: string;
}

/** What a strategy receives for one request. */
export interface FirstPartyAuthInput {
	ctx: GenericEndpointContext;
	/**
	 * The client, already authenticated and checked to be a first-party app.
	 */
	client: SchemaClient<Scope[]>;
	authSession: FirstPartyAuthSession;
	/**
	 * The request's own parameters, including the strategy's credential
	 * parameters. Values are strings when the request is form-encoded.
	 */
	params: Record<string, unknown>;
}

/**
 * The outcome of one credential round.
 *
 * - `{ user, amr }`: the user proved who they are. The plugin creates a
 *   session and issues the authorization code.
 * - `insufficient_authorization`: another round is needed, such as a second
 *   factor. The client receives `challenge_type` and `fields`, and the next
 *   request with the same `auth_session` comes back to this strategy.
 * - `authentication_failed`: the credentials were wrong. The failure counts
 *   against the account (`userId`), or against `identifier` when no account
 *   matched.
 * - `redirect_to_web`: the user must finish in a browser, for example to
 *   verify an email address or use a method this app cannot offer.
 */
export type FirstPartyAuthResult =
	| {
			user: User & Record<string, unknown>;
			/** Methods this round verified, combined with earlier rounds' (RFC 8176). */
			amr: string[];
	  }
	| {
			error: "insufficient_authorization";
			/**
			 * Sent to the client as `challenge_type`, and the budget key for the
			 * next round's failures.
			 */
			challengeType: string;
			/** Server-side state for the next round. Never sent to the client. */
			state?: Record<string, unknown>;
			/** The user this round identified. */
			user?: User;
			/** Methods this round verified. */
			amr?: string[];
			/** Extra response fields for the client, such as a masked phone number. */
			fields?: Record<string, unknown>;
	  }
	| {
			error: "authentication_failed";
			/** The account whose credentials were wrong. */
			userId?: string;
			/** The normalized identifier the client sent, when no account matched. */
			identifier?: string;
	  }
	| { error: "redirect_to_web" };

/**
 * A way for a first-party app to sign a user in at the authorization
 * challenge endpoint, such as a password or a passkey.
 *
 * The plugin authenticates the client, checks the DPoP key, counts failures,
 * creates the session, and issues the code. A strategy only checks
 * credentials. Throw an `APIError` with an OAuth error, such as
 * `invalid_request`, for a malformed request.
 */
export interface FirstPartyAuthStrategy {
	/**
	 * Names the strategy in stored `auth_session` state, and keys the failure
	 * budget for its first round. Must be unique across strategies.
	 */
	id: string;
	/**
	 * Request parameters that carry this strategy's credentials, such as
	 * `password`. A request that has none of them on a fresh `auth_session` is
	 * not sent to this strategy. They are never stored with the authorization
	 * request.
	 */
	params: string[];
	authenticate: (input: FirstPartyAuthInput) => Promise<FirstPartyAuthResult>;
	/**
	 * Starts a step-up the token endpoint asked for (draft §6.2), when this
	 * strategy can satisfy `authSession.acrValues` in the app. Without it, or
	 * when it returns `redirect_to_web`, the client is sent to the browser with
	 * `acr_values` and `max_age=0`.
	 */
	stepUp?: (input: FirstPartyAuthInput) => Promise<FirstPartyAuthResult>;
}

/** A failure budget: at most `max` failures per `window` seconds. */
export interface FirstPartyFailureBudget {
	/** @default 900 for an account, 60 for a client */
	window?: number;
	/** @default 10 for an account, 100 for a client */
	max?: number;
}

/** What the token endpoint asks for when a grant needs stronger authentication. */
export interface FirstPartyStepUpRequirement {
	/** The `acr_values` the new sign-in must satisfy. */
	acrValues?: string;
}

export interface FirstPartyAppsOptions {
	/**
	 * How users sign in, in order of preference. The first strategy whose
	 * `params` the request carries handles it.
	 */
	strategies: FirstPartyAuthStrategy[];
	authSession?: {
		/**
		 * Seconds a `pending` or `step_up` `auth_session` stays usable. An
		 * `authenticated` one lives as long as its sign-in session.
		 *
		 * @default 600
		 */
		expiresIn?: number;
		/**
		 * Failed rounds one `auth_session` allows. The next failure answers
		 * `redirect_to_web` and revokes the handle.
		 *
		 * @default 3
		 */
		maxFailures?: number;
	};
	/**
	 * Limits on failed credential checks, in addition to the per-IP rate limit.
	 * An account that spent its budget for a method still answers
	 * `authentication_failed`, even for correct credentials, until the window
	 * ends. A client that spent its budget answers `redirect_to_web` for every
	 * credential round, so its users sign in through the browser.
	 */
	budget?: {
		/** Per account and method. @default { window: 900, max: 10 } */
		account?: FirstPartyFailureBudget;
		/** Per client, across all accounts. @default { window: 60, max: 100 } */
		client?: FirstPartyFailureBudget | false;
	};
	/**
	 * Decides at the token endpoint whether a first-party app's grant needs
	 * stronger authentication first (draft §6.2). Return a requirement to
	 * answer `insufficient_authorization` with an `auth_session` the client
	 * takes to the authorization challenge endpoint.
	 */
	requireStepUp?: (
		input: OAuthBeforeTokenIssuanceInput,
	) =>
		| FirstPartyStepUpRequirement
		| null
		| undefined
		| Promise<FirstPartyStepUpRequirement | null | undefined>;
}

/** @internal */
export interface ResolvedFirstPartyAppsOptions extends FirstPartyAppsOptions {
	authSession: { expiresIn: number; maxFailures: number };
	budget: {
		account: { window: number; max: number };
		client: { window: number; max: number } | false;
	};
}
