import type { Role } from "./access";
import type { StatementsPrimitive as Statements, Subset } from "./types";

export interface RoleData<TStatements extends Statements = Statements> {
  /**
   * Permissions for each resource
   * @example
   * {
   *   organization: ["update", "delete"],
   *   member: ["create", "update", "delete"],
   *   invitation: ["create", "cancel"]
   * }
   */
  statements: TStatements;

  /**
   * How to evaluate multiple permissions
   * @default "AND"
   */
  connector?: "OR" | "AND";
}

export function createRoleFromData<TStatements extends Statements>(roleData: RoleData<TStatements>): Role<TStatements> {
  return {
    statements: roleData.statements,
    authorize<K extends keyof TStatements>(
      request: Subset<K, TStatements>,
      connector = roleData.connector || "AND",
    ) {
      for (const [requestedResource, requestedActions] of Object.entries(
        request,
      )) {
        const allowedActions = roleData.statements[requestedResource];
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
    }
  };
}
