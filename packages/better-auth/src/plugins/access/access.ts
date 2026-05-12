import { BetterAuthError } from "@better-auth/core/error";
import type {
	ExactRoleStatements,
	Role,
	RoleAuthorizeRequest,
	RoleInput,
	Statements,
} from "./types";

export type AuthorizeResponse =
	| { success: false; error: string }
	| { success: true; error?: never | undefined };

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
					return {
						success: false,
						error: `You are not allowed to access resource: ${requestedResource}`,
					};
				}
				if (Array.isArray(requestedActions)) {
					success = (requestedActions as string[]).every((requestedAction) =>
						allowedActions.includes(requestedAction),
					);
				} else {
					if (typeof requestedActions === "object") {
						const actions = requestedActions as {
							actions: string[];
							connector: "OR" | "AND";
						};
						if (actions.connector === "OR") {
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
					return { success };
				}
				if (!success && connector === "AND") {
					return {
						success: false,
						error: `unauthorized to access resource "${requestedResource}"`,
					};
				}
			}
			if (success) {
				return {
					success,
				};
			}
			return {
				success: false,
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
