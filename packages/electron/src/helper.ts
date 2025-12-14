export function isProcessType(type: typeof process.type) {
	return typeof process !== "undefined" && process.type === type;
}

export function isElectronEnv() {
	return (
		typeof process !== "undefined" &&
		typeof process.versions.electron === "string"
	);
}
