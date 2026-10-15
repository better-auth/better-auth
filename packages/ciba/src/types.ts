import type { GenericEndpointContext } from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import type { SchemaClient, Scope } from "@better-auth/oauth-provider";
import type { schema } from "./schema";

/** CIBA token delivery modes this plugin implements (CIBA §5). */
export type CibaDeliveryMode = "poll" | "ping";

/** A user's decision on a backchannel request. */
export type CibaDecision = "approved" | "denied";

/**
 * A stored backchannel request, including any `additionalFields` the
 * deployment declared in `schema`.
 */
export interface CibaRequest {
	/** Internal id. Use it to approve from a list of the user's requests. */
	id: string;
	/** The hashed `auth_req_id`. */
	authReqId: string;
	clientId: string;
	userId: string;
	scope: string;
	bindingMessage?: string | null;
	/** Space-separated `acr_values` the client requested (CIBA §7.1). */
	acrValues?: string | null;
	/** RFC 9396 `authorization_details`, validated against the configured types. */
	authorizationDetails?: AuthorizationDetail[] | null;
	/** RFC 8707 resource indicators the issued token is bound to. */
	resources?: string[] | null;
	status: "pending" | CibaDecision;
	/** Creation time of the approving session, issued as `auth_time`. */
	authTime?: Date | null;
	expiresAt: Date;
	createdAt: Date;
	[additionalField: string]: unknown;
}

/** One RFC 9396 authorization details object. */
export interface AuthorizationDetail {
	type: string;
	[field: string]: unknown;
}

/** The request as `validateRequest` sees it, before it is stored. */
export interface CibaRequestInput {
	clientId: string;
	userId: string;
	scope: string;
	bindingMessage?: string;
	acrValues?: string;
	authorizationDetails?: AuthorizationDetail[];
	resources?: string[];
}

/**
 * Payload handed to {@link CibaOptions.sendNotification} so the deployment can
 * reach the user on a separate device and link them to the approval page.
 */
export interface SendNotificationData {
	/** Internal id of the stored request. */
	requestId: string;
	/** The user the client is asking to authenticate. */
	userId: string;
	/** The authenticated client requesting authorization. */
	clientId: string;
	/** Registered display name of the client, when known. */
	clientName?: string;
	/** Space-delimited scopes the client requested. */
	scope: string;
	/** Message to display on both devices to bind the session (CIBA §7.1). */
	bindingMessage?: string;
	acrValues?: string;
	authorizationDetails?: AuthorizationDetail[];
	/**
	 * Absolute URL of the approval page, with the `auth_req_id` attached. Send
	 * this to the user; the page calls the CIBA endpoints to approve or deny.
	 */
	approvalUrl: string;
}

export interface CibaOptions {
	/**
	 * Notify the user of a pending backchannel request on a separate channel
	 * (email, push, SMS). Runs in the background when
	 * `advanced.backgroundTasks` is configured, and is awaited otherwise. A
	 * rejected promise is logged; the client still receives its `auth_req_id`.
	 */
	sendNotification: (
		data: SendNotificationData,
		ctx: GenericEndpointContext,
	) => Promise<void> | void;

	/**
	 * Path or URL of the approval page the user opens from the notification. The
	 * `auth_req_id` is appended as a query parameter.
	 */
	approvalPage: string;

	/**
	 * Token delivery modes the deployment supports. Each client registers one in
	 * its `backchannel_token_delivery_mode` metadata.
	 *
	 * @default ["poll"]
	 */
	deliveryModes?: CibaDeliveryMode[];

	/**
	 * Lifetime of a backchannel request, in seconds. A client may ask for less
	 * with `requested_expiry`.
	 *
	 * @default 300
	 */
	expiresIn?: number;

	/**
	 * Minimum time between token polls, in seconds. Returned as `interval`.
	 *
	 * @default 5
	 */
	interval?: number;

	/**
	 * Accept clients registered with `token_endpoint_auth_method: "none"`. CIBA
	 * §7.1 requires client authentication, so leave this off unless your
	 * clients are public and bind their tokens another way, such as DPoP.
	 *
	 * @default false
	 */
	allowPublicClients?: boolean;

	/**
	 * RFC 9396 `authorization_details` types the backchannel endpoint accepts.
	 * Requests carrying any other type are rejected with
	 * `invalid_authorization_details`. Omit to reject `authorization_details`.
	 */
	authorizationDetailsTypes?: string[];

	/**
	 * Resolve the user a `login_hint` identifies. Defaults to an email lookup.
	 * Return `null` when no user matches.
	 */
	resolveUser?: (
		loginHint: string,
		ctx: GenericEndpointContext,
	) => Promise<{ id: string } | null> | { id: string } | null;

	/**
	 * Validate a backchannel request before it is stored, for example to check
	 * `acr_values` or `authorization_details` against policy. Throw an
	 * `APIError` to reject it. Return `additionalFields` to store with it.
	 */
	validateRequest?: (input: {
		request: CibaRequestInput;
		client: SchemaClient<Scope[]>;
		ctx: GenericEndpointContext;
	}) =>
		| Promise<{ additionalFields?: Record<string, unknown> } | void>
		| { additionalFields?: Record<string, unknown> }
		| void;

	/**
	 * Runs at the token endpoint for an approved request, before it is claimed.
	 * Throw an `APIError` to refuse issuance (for example to require step-up);
	 * the request stays approved so the client can poll again. Return
	 * `accessTokenClaims` to add to this access token.
	 */
	beforeTokenIssuance?: (input: {
		request: CibaRequest;
		ctx: GenericEndpointContext;
	}) =>
		| Promise<{ accessTokenClaims?: Record<string, unknown> } | void>
		| { accessTokenClaims?: Record<string, unknown> }
		| void;

	/**
	 * Rename the model or its fields, or add `additionalFields` that
	 * `validateRequest` and `completeCibaRequest` can set.
	 */
	schema?: {
		cibaRequest?: {
			modelName?: string;
			fields?: {
				[K in keyof (typeof schema)["cibaRequest"]["fields"]]?: string;
			};
			additionalFields?: Record<string, DBFieldAttribute>;
		};
	};
}
