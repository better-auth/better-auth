export async function getNpmPackageVersion(
	packageName: string,
): Promise<{ success: boolean; version: string | null; error: string | null }> {
	try {
		const response = await fetch(`https://registry.npmjs.org/${packageName}`);

		if (!response.ok) {
			return {
				success: false,
				version: null,
				error: `Package not found: ${packageName}`,
			};
		}

		const data = await response.json();
		return {
			success: true,
			error: null,
			version: data["dist-tags"].latest,
		};
	} catch (error: any) {
		return {
			success: false,
			version: null,
			error: error?.message,
		};
	}
}
