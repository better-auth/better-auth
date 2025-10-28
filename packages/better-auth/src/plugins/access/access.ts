import { BetterAuthError } from "@better-auth/core/error";
import type { Statements, Subset } from "./types";

export type AuthorizeResponse =
	| { success: false; error: string }
	| { success: true; error?: never | undefined };

export function role<TStatements extends Statements>(statements: TStatements) {
	return {
		authorize<K extends keyof TStatements>(
			request: {
				[key in K]?:
					| TStatements[key]
					| {
							actions: TStatements[key];
							connector: "OR" | "AND";
					  };
			},
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
		newRole<K extends keyof TStatements>(statements: Subset<K, TStatements>) {
			return role<Subset<K, TStatements>>(statements);
		},
		statements: s,
	};
}
