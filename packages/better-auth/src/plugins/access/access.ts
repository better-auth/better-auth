import type { StatementsPrimitive as Statements, Subset } from "./types";

type Connector = "OR" | "AND";

type AuthorizeResponse =
	| { success: false; error: string }
	| { success: true; error?: undefined };

function parsingError(message: string, path: string): Error {
	const error = new Error(message);
	(error as any).path = path;
	return error;
}

export function createAccessControl<
	TStatements extends Statements = Statements,
>(s: TStatements) {
	const statements = s;
	return {
		newRole<K extends keyof TStatements>(statements: Subset<K, TStatements>) {
			return role<Subset<K, TStatements>>(statements);
		},
	};
}

export function role<TStatements extends Statements>(statements: TStatements) {
	return {
		statements,
		authorize<K extends keyof TStatements>(
			request: Subset<K, TStatements>,
			connector?: Connector,
		): AuthorizeResponse {
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
				const success =
					connector === "OR"
						? (requestedActions as string[]).some((requestedAction) =>
								allowedActions.includes(requestedAction),
							)
						: (requestedActions as string[]).every((requestedAction) =>
								allowedActions.includes(requestedAction),
							);
				if (success) {
					return { success: true };
				}
				return {
					success: false,
					error: `Unauthorized to access resource "${requestedResource}"`,
				};
			}
			return {
				success: false,
				error: "Not authorized",
			};
		},
	};
}

export type AccessControl<TStatements extends Statements = Statements> =
	ReturnType<typeof createAccessControl<TStatements>>;

export type Role<TStatements extends Statements = Record<string, any>> = {
	authorize: (request: any, connector?: Connector) => AuthorizeResponse;
	statements: TStatements;
};
