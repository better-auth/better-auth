export async function fetchLatestVersion(
	packageName: string,
): Promise<string | null> {
	const encoded = packageName.startsWith("@")
		? `@${encodeURIComponent(packageName.slice(1))}`
		: encodeURIComponent(packageName);
	try {
		const response = await fetch(
			`https://registry.npmjs.org/${encoded}/latest`,
		);
		if (!response.ok) {
			return null;
		}
		const data = (await response.json()) as { version?: string };
		return data.version ?? null;
	} catch {
		return null;
	}
}
