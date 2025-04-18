import { BetterAuthError } from "../../error";
import type { AuthorizeRequest, Statements, Subset } from "./types";

export type MissingPermissions<TReq> = Partial<
	Record<keyof TReq, AuthorizeRequest<Statements>[keyof Statements]>
>;

export type AuthorizeResponse<TReq> =
	| {
			success: false;
			missingPermissions: MissingPermissions<TReq>;
			error: string;
	  }
	| { success: true; missingPermissions?: never };

function checkArrayActions<TResourceKey extends keyof TStatements, TStatements>(
	allowedActions: readonly string[],
	requestedActions: readonly string[],
	missingPermissions: MissingPermissions<TStatements>,
	requestedResource: TResourceKey,
): boolean {
	const missingInArray: string[] = [];
	for (const requestedAction of requestedActions) {
		if (!allowedActions.includes(requestedAction)) {
			missingInArray.push(requestedAction);
		}
	}
	if (missingInArray.length > 0) {
		missingPermissions[requestedResource] = missingInArray;

		return false;
	}

	return true;
}

function checkObjectActions<
	TResourceKey extends keyof TStatements,
	TStatements,
>(
	allowedActions: readonly string[],
	requestedActions: { actions: readonly string[]; connector: "OR" | "AND" },
	missingPermissions: MissingPermissions<TStatements>,
	requestedResource: TResourceKey,
): boolean {
	if (requestedActions.connector === "OR") {
		const hasAtLeastOneAction = requestedActions.actions.some(
			(requestedAction) => allowedActions.includes(requestedAction),
		);
		if (!hasAtLeastOneAction) {
			missingPermissions[requestedResource] = requestedActions;
			return false;
		}
	} else {
		const missingInObjectAnd: string[] = [];
		for (const requestedAction of requestedActions.actions) {
			if (!allowedActions.includes(requestedAction)) {
				missingInObjectAnd.push(requestedAction);
			}
		}

		if (missingInObjectAnd.length > 0) {
			missingPermissions[requestedResource] = {
				...requestedActions,
				actions: missingInObjectAnd,
			};

			return false;
		}
	}

	return true;
}

export function role<TStatements extends Statements>(statements: TStatements) {
	return {
		authorize(
			request: AuthorizeRequest<TStatements>,
			connector: "OR" | "AND" = "AND",
		): AuthorizeResponse<typeof request> {
			const missingPermissions: MissingPermissions<typeof request> = {};
			let overallSuccess = connector === "AND";

			if (!statements) statements = {} as TStatements;

			for (const requestedResource of Object.keys(
				request,
			) as (keyof typeof request)[]) {
				const requestedValue = request[requestedResource];
				let resourceSuccess = true;
				const allowed = statements[requestedResource];
				const currentlyAllowed = Array.isArray(allowed) ? allowed : [];

				if (!allowed) {
					missingPermissions[requestedResource] = requestedValue;
					resourceSuccess = false;
				} else if (requestedValue !== undefined) {
					if (Array.isArray(requestedValue)) {
						resourceSuccess = checkArrayActions<
							keyof TStatements,
							AuthorizeRequest<TStatements>
						>(
							currentlyAllowed,
							requestedValue as readonly string[],
							missingPermissions,
							requestedResource,
						);
					} else if (
						typeof requestedValue === "object" &&
						"actions" in requestedValue &&
						"connector" in requestedValue
					) {
						resourceSuccess = checkObjectActions(
							currentlyAllowed,
							requestedValue,
							missingPermissions,
							requestedResource,
						);
					} else {
						throw new BetterAuthError(
							`Invalid request format for resource: ${String(
								requestedResource,
							)}`,
						);
					}
				}

				overallSuccess =
					connector === "AND"
						? overallSuccess && resourceSuccess
						: overallSuccess || resourceSuccess;
			}

			if (overallSuccess) {
				return { success: true };
			}

			if (Object.keys(request).length === 0 && connector === "OR") {
				return {
					success: false,
					missingPermissions: {},
					error: "Not authorized",
				};
			}

			return { success: false, missingPermissions, error: "Not authorized" };
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
