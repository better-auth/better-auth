import type { Awaitable, GenericEndpointContext } from "@better-auth/core";
import type { SchemaClient, Scope } from "@better-auth/oauth-provider";
import type { InferOptionSchema, User } from "better-auth/types";
import type { schema } from "./schema";

/** CIBA token delivery modes this plugin implements (CIBA §5). */
export type CibaDeliveryMode = "poll" | "ping";

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

	/** Rename the `cibaRequest` model or its fields. */
	schema?: InferOptionSchema<typeof schema>;
}

/** {@link CibaOptions} with defaults applied. */
export type ResolvedCibaOptions = CibaOptions & {
	deliveryModes: CibaDeliveryMode[];
	expiresIn: number;
	interval: number;
};
