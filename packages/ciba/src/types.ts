import type { GenericEndpointContext } from "@better-auth/core";

/** CIBA token delivery modes this plugin implements (CIBA §5). */
export type CibaDeliveryMode = "poll" | "ping";

/**
 * Payload handed to {@link CibaOptions.sendNotification} so the deployment can
 * reach the user on a separate device and link them to the approval page.
 */
export interface SendNotificationData {
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
	 * Resolve the user a `login_hint` identifies. Defaults to an email lookup.
	 * Return `null` when no user matches.
	 */
	resolveUser?: (
		loginHint: string,
		ctx: GenericEndpointContext,
	) => Promise<{ id: string } | null> | { id: string } | null;
}
