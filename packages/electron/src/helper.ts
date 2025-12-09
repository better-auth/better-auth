export function isProcessType(type: typeof process.type) {
	return typeof process?.type !== "undefined" && process.type === type;
}

export function isElectronEnv() {
	return typeof process?.versions.electron !== "string";
}
