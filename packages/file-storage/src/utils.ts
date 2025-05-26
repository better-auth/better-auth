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
