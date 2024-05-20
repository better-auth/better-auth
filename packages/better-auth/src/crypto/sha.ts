export async function sha256(data: ArrayBuffer): Promise<ArrayBuffer> {
	return await crypto.subtle.digest("SHA-256", data);
}
