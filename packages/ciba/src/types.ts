import type { Awaitable, GenericEndpointContext } from "@better-auth/core";
import type { SchemaClient, Scope } from "@better-auth/oauth-provider";
import type { InferOptionSchema, User } from "better-auth/types";
import type { schema } from "./schema";

/** CIBA token delivery modes this plugin implements (CIBA §5). */
export type CibaDeliveryMode = "poll" | "ping";

/**
 * One RFC 9396 authorization detail: a structured permission, such as a
 * payment to approve. `type` selects the deployment-defined fields.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9396.html#section-2
 */
export interface CibaAuthorizationDetail {
	type: string;
	locations?: string[];
	actions?: string[];
	datatypes?: string[];
	identifier?: string;
	privileges?: string[];
	[field: string]: unknown;
}

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
		detail: CibaAuthorizationDetail,
		input: { client: SchemaClient<Scope[]> },
		ctx: GenericEndpointContext,
	) => Awaitable<boolean>;
}

/**
 * What {@link CibaOptions.sendNotification} receives to reach the user on a
 * separate device.
 */
export interface CibaNotification {
	/**
	 * Identifies the request to `auth.api.completeCibaRequest`, for a deployment
	 * that lets the user decide in its own app instead of following `url`.
	 */
	requestId: string;
	/** The user the client's `login_hint` identified. */
	user: User;
	clientId: string;
	/** Registered display name of the client, when it has one. */
	clientName?: string | undefined;
	scopes: string[];
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
	authorizationDetails?: CibaAuthorizationDetail[] | undefined;
	/**
	 * Absolute link that opens the provider's sign-in and consent pages for
	 * this request. Send it to the user.
	 */
	url: string;
	expiresAt: Date;
}

export interface CibaOptions {
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
	 * Path or URL of the page the user lands on after deciding, with
	 * `status=approved` or `status=denied`, or with `error` and
	 * `error_description` when the link is invalid, expired, or for another
	 * account.
	 */
	resultPage: string;

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
	 * Accept clients registered with `token_endpoint_auth_method: "none"`, such
	 * as agents and CLIs that cannot keep a secret. CIBA §7.1 requires client
	 * authentication, so enable this only for public clients that bind their
	 * tokens another way, such as DPoP.
	 *
	 * @default false
	 */
	allowPublicClients?: boolean;

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
	 * `authorization_details` claim of the JWT access token, so a request with
	 * details must name a `resource`. Refreshed tokens would not carry them, so
	 * such a request is issued no refresh token.
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
