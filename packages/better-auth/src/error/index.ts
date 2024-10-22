export class BetterAuthError extends Error {
	constructor(message: string, cause?: string) {
		super(message);
		this.name = "BetterAuthError";
		this.message = message;
		this.cause = cause;
	}
}
export class MissingDependencyError extends BetterAuthError {
	constructor(pkgName: string) {
		super(
			`The package "${pkgName}" is required. Make sure it is installed.`,
			pkgName,
		);
	}
}
