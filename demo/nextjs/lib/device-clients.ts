/**
 * Device clients this app registered, mapped to names users recognize.
 * The server accepts only these IDs, so the approval page can trust the name.
 */
export const deviceClients = new Map<string, string>([
	["demo-cli", "Better Auth demo CLI"],
]);
