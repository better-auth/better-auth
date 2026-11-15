import type { Awaitable, GenericEndpointContext } from "@better-auth/core";
import type {
	OAuthActorClaim,
	OAuthAuthorizationDetail,
	SchemaClient,
	Scope,
} from "@better-auth/oauth-provider";
import type { InferOptionSchema, User } from "better-auth/types";
import type { schema } from "./schema";

/** CIBA token delivery modes this plugin implements (CIBA §5). */
export type CibaDeliveryMode = "poll" | "ping";

/** An authorization details type clients may request. */
export interface CibaAuthorizationDetailsType {
	/**
	 * Return `true` when the detail is valid for this type. Check every field,
	 * and reject unknown fields, invalid values, and missing required fields
	 * (RFC 9396 §5): the client receives `invalid_authorization_details`. Runs
	 * for each detail a client requests and each one server code approves
	 * through `completeCibaRequest`.
	 */
	validate: (
		detail: OAuthAuthorizationDetail,
		input: { client: SchemaClient<Scope[]> },
		ctx: GenericEndpointContext,
	) => Awaitable<boolean>;
}

/**
 * A request still waiting for the user's decision: what to show the user
 * before they approve or deny it. {@link CibaNotification} carries it, and
 * `auth.api.getCibaRequest` reads it on your own approval page.
 */
export interface CibaPendingRequest {
	/**
	 * Identifies the request to `auth.api.getCibaRequest` and
	 * `auth.api.completeCibaRequest`, for a deployment that lets the user
	 * decide in its own page or app.
	 */
	requestId: string;
	clientId: string;
	/** Registered display name of the client, when it has one. */
	clientName?: string | undefined;
	/** The scopes the client requested. */
	scopes: string[];
	/** The RFC 8707 resources the client requested the token for. */
	resources?: string[] | undefined;
	/**
	 * Text the client also shows (CIBA §7.1). Display it so the user can
	 * confirm the request is the one they expect.
	 */
	bindingMessage?: string | undefined;
	/**
	 * ACR values the client requested with `acr_values`, in order of
	 * preference. A voluntary request: authenticate the user as strongly as
	 * these ask when you can, and state what the user actually proved as `acr`
	 * when completing the request.
	 */
	acrValues?: string[] | undefined;
	/**
	 * RFC 9396 details of what the client asks to do, such as a payment to
	 * approve. Show them to the user before they decide.
	 */
	authorizationDetails?: OAuthAuthorizationDetail[] | undefined;
	/**
	 * Who acts for the user when the request is approved, as
	 * {@link CibaOptions.resolveActor} returned it. Show it, so the user knows
	 * the tokens go to that actor and not to them.
	 */
	actor?: OAuthActorClaim | undefined;
	expiresAt: Date;
}

/**
 * What {@link CibaOptions.sendNotification} receives to reach the user on a
 * separate device.
 */
export interface CibaNotification extends CibaPendingRequest {
	/** The user the client's `login_hint` identified. */
	user: User;
	/**
	 * Absolute link for the user to approve or deny the request. By default it
	 * opens the provider's sign-in and consent pages; with
	 * {@link CibaOptions.approvalPage} it opens that page, with the request as
	 * `ciba_request_id`. Absent when `approvalPage` is `false`.
	 */
	url?: string | undefined;
}

/**
 * Where the user approves a request: the provider's pages by default, or your
 * own approval path.
 */
export type CibaApprovalOptions =
	| {
			approvalPage?: undefined;
			/**
			 * Path or URL of the page the user lands on after deciding through the
			 * provider's pages, with `status=approved` or `status=denied`, or with
			 * `error` and `error_description` when the link is invalid, expired,
			 * or for another account.
			 */
			resultPage: string;
	  }
	| {
			/**
			 * Approve requests on your own path instead of the provider's sign-in
			 * and consent pages: read each request with `auth.api.getCibaRequest`,
			 * and record the decision with `auth.api.completeCibaRequest`. A path or URL becomes the
			 * notification's `url`, with the request as `ciba_request_id`; `false`
			 * sends no `url`, such as when your own app shows the request. Either
			 * way, `/oauth2/authorize` no longer approves CIBA requests, so the
			 * provider's consent page cannot bypass your checks.
			 */
			approvalPage: string | false;
			resultPage?: never;
	  };

/** Options for {@link ciba}. */
export type CibaOptions = CibaSharedOptions & CibaApprovalOptions;

/** {@link CibaOptions} that do not depend on where the user approves. */
export interface CibaSharedOptions {
	/**
	 * Tell the user about a new request on a channel they trust, such as email
	 * or a push notification, and include `url`. Runs in the background when
	 * `advanced.backgroundTasks` is configured and is awaited otherwise. A
	 * failure is logged, and the client still receives its `auth_req_id`.
	 */
	sendNotification: (
		notification: CibaNotification,
		ctx: GenericEndpointContext,
	) => Awaitable<void>;

	/**
	 * Find the user a `login_hint` identifies. Defaults to an email lookup.
	 * Return `null` when no user matches, and the client receives
	 * `unknown_user_id`. Receives the requesting client, so a deployment with
	 * open client registration can resolve only identifiers that client was
	 * already given, such as its pairwise `sub`.
	 */
	resolveUser?: (
		input: { loginHint: string; client: SchemaClient<Scope[]> },
		ctx: GenericEndpointContext,
	) => Awaitable<User | null>;

	/**
	 * Name who will act for the user, so the access token is a delegated token
	 * (RFC 8693 §4.1): `sub` is the user, and `act` is the returned actor. Runs
	 * at `/oauth2/bc-authorize` after the client authenticates and the user is
	 * found, and the actor is stored with the request. Return `undefined` for a
	 * token without `act`, or throw an `APIError` to refuse the request with
	 * that error.
	 *
	 * The actor is the server's own assertion, so return only an actor you have
	 * verified, such as the authenticated client itself or an agent whose
	 * credential the request carries in `ctx.request`. Set
	 * `sub_profile: "service"` on a client or agent actor, or a pairwise client
	 * reads its `sub` as a user's pairwise subject.
	 *
	 * A delegated token gets no refresh token, because refreshed tokens would
	 * not carry `act`, so the returned scope leaves out `offline_access`.
	 *
	 * @example
	 * ```ts
	 * // The client is an agent acting for the user it names.
	 * resolveActor: ({ client }) => ({
	 * 	sub: client.clientId,
	 * 	sub_profile: "service",
	 * }),
	 * ```
	 */
	resolveActor?: (
		input: {
			client: SchemaClient<Scope[]>;
			user: User;
			scopes: string[];
		},
		ctx: GenericEndpointContext,
	) => Awaitable<OAuthActorClaim | undefined>;

	/**
	 * Token delivery modes clients may register for, as
	 * `backchannel_token_delivery_mode` (CIBA §4). In `ping` mode the server
	 * also calls the client's `backchannel_client_notification_endpoint` once
	 * the user decides.
	 *
	 * @default ["poll"]
	 */
	deliveryModes?: CibaDeliveryMode[];

	/**
	 * Lifetime of a request, in seconds. A client may ask for less with
	 * `requested_expiry`.
	 *
	 * @default 300
	 */
	expiresIn?: number;

	/**
	 * Minimum time between token polls, in seconds. Returned as `interval`;
	 * faster polls receive `slow_down`.
	 *
	 * @default 5
	 */
	interval?: number;

	/**
	 * RFC 9396 authorization details types clients may request with
	 * `authorization_details`, keyed by `type` and advertised as
	 * `authorization_details_types_supported`. Without it, a request that
	 * carries `authorization_details` fails with `invalid_authorization_details`.
	 *
	 * Granted details are returned in the token response and as the
	 * `authorization_details` claim of a JWT access token, or at introspection
	 * of an opaque one. Refreshed tokens would not carry them, so such a request
	 * is issued no refresh token.
	 *
	 * @example
	 * ```ts
	 * authorizationDetailsTypes: {
	 * 	payment_initiation: {
	 * 		// A `z.strictObject`, so unknown fields fail.
	 * 		validate: (detail) => paymentSchema.safeParse(detail).success,
	 * 	},
	 * }
	 * ```
	 */
	authorizationDetailsTypes?: Record<string, CibaAuthorizationDetailsType>;

	/** Rename the `cibaRequest` model or its fields. */
	schema?: InferOptionSchema<typeof schema>;
}

/** {@link CibaOptions} with defaults applied. */
export type ResolvedCibaOptions = CibaOptions & {
	deliveryModes: CibaDeliveryMode[];
	expiresIn: number;
	interval: number;
};
