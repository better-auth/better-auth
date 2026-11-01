import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-auth/api";
import type { Session, User } from "better-auth/types";
import type { OAuthOptions, Scope } from "../types";

/**
 * Action types passed to {@link OAuthOptions.resourcePrivileges}. Mirrors
 * the `clientPrivileges` action vocabulary so admins can reuse the same
 * RBAC patterns.
 */
type ResourceAction =
	| "create"
	| "read"
	| "update"
	| "delete"
	| "list"
	| "link"
	| "unlink";

/**
 * Authorizes a resource action against the configured `resourcePrivileges`
 * hook. Gates every admin resource endpoint and the resource links selected
 * during managed client registration. Mirrors `assertClientPrivileges`:
 * a missing session → 401; a defined `resourcePrivileges` callback that
 * returns falsy → 401 with the original action context preserved.
 *
 * When `resourcePrivileges` is undefined, the gate degrades to "any
 * authenticated session can manage resources" — same forgiving default
 * as `clientPrivileges`. Operators who care about RBAC must define the
 * callback.
 *
 * @internal
 */
export async function assertResourcePrivileges(
	ctx: GenericEndpointContext,
	session: { session: Session; user: User } | null,
	opts: OAuthOptions<Scope[]>,
	action: ResourceAction,
	resourceId?: string,
): Promise<void> {
	if (!session) throw new APIError("UNAUTHORIZED");
	if (!ctx.headers) throw new APIError("BAD_REQUEST");
	if (!opts.resourcePrivileges) return;
	const allowed = await opts.resourcePrivileges({
		headers: ctx.headers,
		action,
		session: session.session,
		user: session.user,
		resourceId,
	});
	if (!allowed) throw new APIError("UNAUTHORIZED");
}
