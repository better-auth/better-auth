/**
 * Convert a file to a base64 string.
 */
export function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result?.toString().split(",")[1];
			if (!result) throw new Error("Failed to read file");
			resolve(result);
		};
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

/**
 * Format bytes to human readable string.
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
	if (bytes === 0) return "0 Bytes";

	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
