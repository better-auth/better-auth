import type { Awaitable, GenericEndpointContext } from "@better-auth/core";
import type { InferOptionSchema, User } from "better-auth/types";
import type { schema } from "./schema";

/**
 * What {@link CibaOptions.sendNotification} receives to reach the user on a
 * separate device.
 */
export interface CibaNotification {
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
	 * `unknown_user_id`.
	 */
	resolveUser?: (
		loginHint: string,
		ctx: GenericEndpointContext,
	) => Awaitable<User | null>;

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
