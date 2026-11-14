import type { Session, User } from "@better-auth/core/db";
import type { ProofError } from "./proof";
import type { Algorithm } from "./protocol";

export type DbscOptions = {
	/**
	 * Lifetime of the bound cookie in seconds. A stolen cookie works on
	 * another device for at most this long. Must be at least 300: Chrome
	 * refreshes 120 seconds before expiry and signs at most 6 times per 9
	 * minutes for a site, so a shorter cookie runs it out of signatures.
	 *
	 * @default 600
	 */
	boundCookieMaxAge?: number | undefined;
	/**
	 * Algorithms offered to the browser, in preference order.
	 *
	 * @default ["ES256", "RS256"]
	 */
	algorithms?: Algorithm[] | undefined;
	/**
	 * Decides whether a newly created session is offered registration, e.g.
	 * to roll DBSC out to a sample of users. Offers every session by default.
	 */
	shouldOffer?:
		| ((input: {
				session: Session;
				user: User;
				request: Request | undefined;
		  }) => boolean | Promise<boolean>)
		| undefined;
	/**
	 * Rejects a bound session that arrives without a fresh bound cookie, so
	 * a copied session cookie stops working once the bound cookie expires.
	 * The request is treated as signed out; the session itself is kept.
	 *
	 * `"monitor"` runs the same check and emits `blocked` events without
	 * rejecting anything, to see what enforcement would do before turning it
	 * on.
	 *
	 * @default false
	 */
	enforce?: boolean | "monitor" | undefined;
	/**
	 * Hosts whose requests may make Chrome refresh the bound cookie, besides
	 * the auth origin itself. The default lets a navigation arriving from any
	 * site refresh first, so the first page already sees the bound cookie.
	 * Narrow it only if nothing links into your app from other sites.
	 *
	 * @default ["*"]
	 */
	allowedRefreshInitiators?: string[] | undefined;
	/**
	 * Observes registrations, refreshes and failures. Errors thrown here are
	 * logged and never change the protocol response.
	 */
	onEvent?: ((event: DbscEvent) => void | Promise<void>) | undefined;
};

export type ResolvedDbscOptions = Omit<
	DbscOptions,
	"boundCookieMaxAge" | "algorithms" | "allowedRefreshInitiators"
> & {
	boundCookieMaxAge: number;
	algorithms: Algorithm[];
	allowedRefreshInitiators: string[];
};

export type DbscEvent =
	| {
			type: "registered";
			bindingId: string;
			sessionId: string;
			userId: string;
	  }
	| {
			type: "refreshed";
			bindingId: string;
	  }
	| {
			type: "rejected";
			reason:
				| ProofError
				| "invalid_ticket"
				| "session_not_found"
				| "already_bound";
			bindingId: string | undefined;
	  }
	| {
			/**
			 * A bound session arrived without a fresh bound cookie. `enforced`
			 * says whether it was treated as signed out or only reported.
			 */
			type: "blocked";
			bindingId: string;
			reason: "missing" | "invalid";
			enforced: boolean;
	  }
	| {
			type: "ended";
			reason: "binding_not_found" | "session_not_found";
			bindingId: string;
	  }
	| {
			/**
			 * Chrome sent a request without refreshing first, e.g. because the
			 * refresh endpoint failed or its signing quota ran out.
			 */
			type: "skipped";
			reason: string;
			bindingId: string | null;
	  };
