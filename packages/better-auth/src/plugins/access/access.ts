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
	let allAllowed = true;
	const missingActions: string[] = [];

	for (let i = 0; i < requestedActions.length; i++) {
		if (!allowedActions.includes(requestedActions[i])) {
			missingActions.push(requestedActions[i]);
			allAllowed = false;
		}
	}

	if (!allAllowed) {
		missingPermissions[requestedResource] = missingActions;
	}

	return allAllowed;
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
	const { actions, connector } = requestedActions;

	if (connector === "OR") {
		const hasAtLeastOneAction = actions.some((action) =>
			allowedActions.includes(action),
		);
		if (!hasAtLeastOneAction) {
			missingPermissions[requestedResource] = requestedActions;
			return false;
		}

		return true;
	} else {
		let allAllowed = true;
		const missingActions: string[] = [];
		for (let i = 0; i < actions.length; i++) {
			if (!allowedActions.includes(actions[i])) {
				missingActions.push(actions[i]);
				allAllowed = false;
			}
		}

		if (!allAllowed) {
			missingPermissions[requestedResource] = {
				...requestedActions,
				actions: missingActions,
			};
		}

		return allAllowed;
	}
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

			for (const requestedResource in request) {
				if (!Object.prototype.hasOwnProperty.call(request, requestedResource))
					continue;
				const requestedValue = request[requestedResource];
				let resourceSuccess = true;
				const allowed = statements[requestedResource];
				const currentlyAllowed = Array.isArray(allowed) ? allowed : [];

				if (!allowed) {
					missingPermissions[requestedResource] = requestedValue;
					resourceSuccess = false;
				} else if (requestedValue !== undefined) {
					if (Array.isArray(requestedValue)) {
						resourceSuccess = checkArrayActions(
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
