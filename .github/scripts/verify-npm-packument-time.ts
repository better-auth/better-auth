type PublishedPackage = {
	name: string;
	version: string;
};

type Packument = {
	time?: Record<string, string>;
};

const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 10_000;

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function registryUrl(packageName: string) {
	const encoded = packageName.startsWith("@")
		? `@${encodeURIComponent(packageName.slice(1))}`
		: encodeURIComponent(packageName);
	return `https://registry.npmjs.org/${encoded}`;
}

function parsePublishedPackages(): PublishedPackage[] {
	const raw = process.env.PUBLISHED_PACKAGES;
	if (!raw) {
		console.error("PUBLISHED_PACKAGES is required");
		process.exit(1);
	}

	const parsed = JSON.parse(raw) as PublishedPackage[];
	return parsed.filter((pkg) => pkg.name && pkg.version);
}

async function fetchPackument(pkg: PublishedPackage): Promise<Packument> {
	const response = await fetch(registryUrl(pkg.name));
	if (!response.ok) {
		throw new Error(
			`npm registry returned ${response.status} for ${pkg.name}`,
		);
	}
	return (await response.json()) as Packument;
}

function hasReleaseTime(pkg: PublishedPackage, packument: Packument) {
	return Boolean(packument.time?.created && packument.time?.[pkg.version]);
}

async function verifyPackage(pkg: PublishedPackage) {
	let lastError: unknown;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const packument = await fetchPackument(pkg);
			if (hasReleaseTime(pkg, packument)) {
				console.log(
					`Verified npm time metadata for ${pkg.name}@${pkg.version}`,
				);
				return;
			}
			lastError = new Error(
				`missing time metadata for ${pkg.name}@${pkg.version}`,
			);
		} catch (error) {
			lastError = error;
		}

		if (attempt < MAX_ATTEMPTS) {
			console.log(
				`Waiting for npm time metadata for ${pkg.name}@${pkg.version} (${attempt}/${MAX_ATTEMPTS})`,
			);
			await sleep(RETRY_DELAY_MS);
		}
	}

	throw lastError;
}

async function main() {
	const packages = parsePublishedPackages();
	await Promise.all(packages.map(verifyPackage));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
