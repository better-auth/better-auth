import { BetterAuthError } from "@better-auth/core/error";
import type {
	ExactRoleStatements,
	Role,
	RoleAuthorizeRequest,
	RoleInput,
	Statements,
} from "./types";

export type AuthorizeResponse = { error: string | null };

export function role<
	const TRoleStatements extends Statements,
	TAuthorizeStatements extends Statements = TRoleStatements,
>(
	statements: TRoleStatements,
): Role<ExactRoleStatements<TRoleStatements>, TAuthorizeStatements> {
	return {
		authorize(
			request: RoleAuthorizeRequest<TAuthorizeStatements>,
			connector: "OR" | "AND" = "AND",
		): AuthorizeResponse {
			let success = false;
			for (const [requestedResource, requestedActions] of Object.entries(
				request,
			)) {
				const allowedActions = statements[requestedResource];
				if (!allowedActions) {
					if (connector === "AND") {
						return {
							error: `You are not allowed to access resource: ${requestedResource}`,
						};
					}
					success = false;
					continue;
				}
				if (Array.isArray(requestedActions)) {
					success =
						requestedActions.length > 0 &&
						(requestedActions as string[]).every((requestedAction) =>
							allowedActions.includes(requestedAction),
						);
				} else {
					if (typeof requestedActions === "object") {
						const actions = requestedActions as {
							actions: string[];
							connector: "OR" | "AND";
						};
						if (
							!Array.isArray(actions.actions) ||
							actions.actions.length === 0
						) {
							success = false;
						} else if (actions.connector === "OR") {
							success = actions.actions.some((requestedAction) =>
								allowedActions.includes(requestedAction),
							);
						} else {
							success = actions.actions.every((requestedAction) =>
								allowedActions.includes(requestedAction),
							);
						}
					} else {
						throw new BetterAuthError("Invalid access control request");
					}
				}
				if (success && connector === "OR") {
					return { error: null };
				}
				if (!success && connector === "AND") {
					return {
						error: `unauthorized to access resource "${requestedResource}"`,
					};
				}
			}
			if (success) {
				return { error: null };
			}
			return {
				error: "Not authorized",
			};
		},
		statements,
	};
}

export function createAccessControl<const TStatements extends Statements>(
	s: TStatements,
) {
	return {
		newRole<const TRoleStatements extends Statements>(
			statements: RoleInput<TStatements, TRoleStatements>,
		) {
			return role<TRoleStatements, TStatements>(statements);
		},
		statements: s,
	};
}
