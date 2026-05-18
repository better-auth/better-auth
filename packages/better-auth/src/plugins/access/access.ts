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

type Connector = "OR" | "AND";

type NormalizedActionRequest = {
	actions: string[];
	connector: Connector;
};

function unauthorizedResponse(requestedResource: string): AuthorizeResponse {
	return {
		success: false,
		error: `unauthorized to access resource "${requestedResource}"`,
	};
}

function isConnector(connector: unknown): connector is Connector {
	return connector === "OR" || connector === "AND";
}

function isActionList(actions: unknown): actions is string[] {
	return (
		Array.isArray(actions) &&
		actions.every((action) => typeof action === "string")
	);
}

function normalizeActionRequest(
	requestedActions: unknown,
): NormalizedActionRequest {
	if (isActionList(requestedActions)) {
		return {
			actions: requestedActions,
			connector: "AND",
		};
	}

	if (!requestedActions || typeof requestedActions !== "object") {
		throw new BetterAuthError("Invalid access control request");
	}

	const { actions, connector } = requestedActions as {
		actions?: unknown;
		connector?: unknown;
	};

	if (!isActionList(actions) || !isConnector(connector)) {
		throw new BetterAuthError("Invalid access control request");
	}

	return {
		actions,
		connector,
	};
}

function isResourceAuthorized(
	allowedActions: readonly string[],
	{ actions, connector }: NormalizedActionRequest,
) {
	if (actions.length === 0) {
		return false;
	}

	if (connector === "OR") {
		return actions.some((requestedAction) =>
			allowedActions.includes(requestedAction),
		);
	}

	return actions.every((requestedAction) =>
		allowedActions.includes(requestedAction),
	);
}

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
			let hasAuthorizedResource = false;
			for (const [requestedResource, requestedActions] of Object.entries(
				request,
			)) {
				const allowedActions = statements[requestedResource];
				if (!allowedActions) {
					if (connector === "AND") {
						return unauthorizedResponse(requestedResource);
					}
					continue;
				}

				const isAuthorized = isResourceAuthorized(
					allowedActions,
					normalizeActionRequest(requestedActions),
				);
				if (isAuthorized) {
					hasAuthorizedResource = true;
				}

				if (isAuthorized && connector === "OR") {
					return { success: true };
				}
				if (!isAuthorized && connector === "AND") {
					return unauthorizedResponse(requestedResource);
				}
			}
			if (hasAuthorizedResource) {
				return {
					success: true,
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
