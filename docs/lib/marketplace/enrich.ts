import { unstable_cache } from "next/cache";
import { extractSameRepoMarkdownRedirect } from "./readme";
import { getMarketplacePlugin, getMarketplacePlugins } from "./registry";
import type {
	EnrichedMarketplacePlugin,
	MarketplacePlugin,
	MarketplacePluginDetail,
	MarketplacePluginEnrichment,
} from "./types";

const REVALIDATE_SECONDS = 21600; // 6 hours

const githubHeaders = {
	Accept: "application/vnd.github.v3+json",
	...(process.env.GITHUB_TOKEN && {
		Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
	}),
};

const emptyEnrichment = (): MarketplacePluginEnrichment => ({
	stars: null,
	lastPush: null,
	defaultBranch: "main",
	license: null,
	topics: [],
	openIssues: null,
	npmDownloads: null,
});

/** npm download point ranges are capped (~18 months); chunk for all-time totals. */
const NPM_RANGE_MONTHS = 17;
const NPM_DOWNLOADS_EPOCH = "2015-01-10";

interface GitHubRepoResponse {
	stargazers_count?: number;
	pushed_at?: string;
	default_branch?: string;
	license?: { spdx_id?: string | null } | null;
	topics?: string[];
	open_issues_count?: number;
}

async function fetchGitHubRepo(
	repo: string,
): Promise<Partial<MarketplacePluginEnrichment>> {
	try {
		const response = await fetch(`https://api.github.com/repos/${repo}`, {
			headers: githubHeaders,
			next: { revalidate: REVALIDATE_SECONDS },
		});
		if (!response.ok) {
			console.error(`Failed to fetch GitHub repo ${repo}:`, response.status);
			return {};
		}
		const data = (await response.json()) as GitHubRepoResponse;
		return {
			stars: data.stargazers_count ?? null,
			lastPush: data.pushed_at ?? null,
			defaultBranch: data.default_branch ?? "main",
			license: data.license?.spdx_id ?? null,
			topics: data.topics ?? [],
			openIssues: data.open_issues_count ?? null,
		};
	} catch (error) {
		console.error(`Error fetching GitHub repo ${repo}:`, error);
		return {};
	}
}

function formatNpmDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function parseNpmDay(value: string): Date {
	return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function npmRangeChunks(
	startDay: string,
	end = new Date(),
): Array<{ start: string; end: string }> {
	const chunks: Array<{ start: string; end: string }> = [];
	let cursor = parseNpmDay(startDay);
	const endDate = new Date(
		Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
	);
	if (cursor > endDate) return chunks;

	while (cursor <= endDate) {
		const chunkEnd = new Date(cursor);
		chunkEnd.setUTCMonth(chunkEnd.getUTCMonth() + NPM_RANGE_MONTHS);
		if (chunkEnd > endDate) {
			chunkEnd.setTime(endDate.getTime());
		}
		chunks.push({
			start: formatNpmDate(cursor),
			end: formatNpmDate(chunkEnd),
		});
		cursor = new Date(chunkEnd);
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}

	return chunks;
}

async function fetchNpmPackageCreatedDay(
	npmPackage: string,
): Promise<string | null> {
	try {
		const response = await fetch(
			`https://registry.npmjs.org/${encodeURIComponent(npmPackage)}`,
			{ next: { revalidate: REVALIDATE_SECONDS } },
		);
		if (!response.ok) return null;
		const data = (await response.json()) as {
			time?: { created?: string };
		};
		const created = data.time?.created;
		if (!created) return null;
		return formatNpmDate(new Date(created));
	} catch {
		return null;
	}
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchNpmDownloadsInRange(
	npmPackage: string,
	start: string,
	end: string,
): Promise<number | null> {
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const response = await fetch(
				`https://api.npmjs.org/downloads/point/${start}:${end}/${encodeURIComponent(npmPackage)}`,
				{ next: { revalidate: REVALIDATE_SECONDS } },
			);
			if (response.status === 429) {
				await sleep(400 * (attempt + 1));
				continue;
			}
			if (!response.ok) return null;
			const contentType = response.headers.get("content-type") ?? "";
			if (!contentType.includes("application/json")) return null;
			const data = (await response.json()) as { downloads?: number };
			return data.downloads ?? null;
		} catch {
			return null;
		}
	}
	return null;
}

async function fetchNpmTotalDownloads(
	npmPackage: string,
): Promise<number | null> {
	const createdDay =
		(await fetchNpmPackageCreatedDay(npmPackage)) ?? NPM_DOWNLOADS_EPOCH;
	const chunks = npmRangeChunks(createdDay);
	if (chunks.length === 0) return null;

	let total = 0;
	// Sequential on purpose — npm rate-limits bursty parallel range queries.
	// Any failed chunk aborts: partial sums must not look like complete totals.
	for (const chunk of chunks) {
		const value = await fetchNpmDownloadsInRange(
			npmPackage,
			chunk.start,
			chunk.end,
		);
		if (value == null) return null;
		total += value;
	}
	return total;
}

async function fetchRepoFile(
	repo: string,
	branch: string,
	path: string,
): Promise<string | null> {
	try {
		const url = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
		const response = await fetch(url, {
			next: { revalidate: REVALIDATE_SECONDS },
		});
		if (response.ok) {
			return await response.text();
		}
	} catch {
		// fall through
	}
	return null;
}

interface FetchedReadme {
	content: string;
	filePath: string;
}

async function fetchReadme(
	repo: string,
	branch: string,
): Promise<FetchedReadme | null> {
	const candidates = [
		"README.md",
		"readme.md",
		"Readme.md",
		"README.mdx",
		"readme.mdx",
	];

	let content: string | null = null;
	let filePath: string | null = null;

	for (const file of candidates) {
		content = await fetchRepoFile(repo, branch, file);
		if (content != null) {
			filePath = file;
			break;
		}
	}

	// Fallback: GitHub Contents API (handles non-default README names / encoding)
	if (content == null) {
		try {
			const response = await fetch(
				`https://api.github.com/repos/${repo}/readme`,
				{
					headers: {
						...githubHeaders,
						Accept: "application/vnd.github.raw+json",
					},
					next: { revalidate: REVALIDATE_SECONDS },
				},
			);
			if (response.ok) {
				content = await response.text();
				filePath = "README.md";
			}
		} catch (error) {
			console.error(`Error fetching README for ${repo}:`, error);
		}
	}

	if (content == null || filePath == null) return null;

	// If the root README is only a path to another Markdown file in this repo,
	// follow it once (no chained redirects).
	const redirectPath = extractSameRepoMarkdownRedirect(content);
	if (redirectPath) {
		const redirected = await fetchRepoFile(repo, branch, redirectPath);
		if (redirected != null) {
			return { content: redirected, filePath: redirectPath };
		}
	}

	return { content, filePath };
}

/** Cache only remote stats — never registry fields like `featured`. */
async function getCachedEnrichment(
	plugin: MarketplacePlugin,
): Promise<MarketplacePluginEnrichment> {
	return unstable_cache(
		async () => {
			const [github, npmDownloads] = await Promise.all([
				fetchGitHubRepo(plugin.repo),
				plugin.npmPackage
					? fetchNpmTotalDownloads(plugin.npmPackage)
					: Promise.resolve(null),
			]);
			return {
				...emptyEnrichment(),
				...github,
				npmDownloads,
			};
		},
		[
			"marketplace-enrichment-v4",
			plugin.slug,
			plugin.repo,
			plugin.npmPackage ?? "",
		],
		{
			revalidate: REVALIDATE_SECONDS,
			tags: ["marketplace-plugins", `marketplace-enrichment-${plugin.slug}`],
		},
	)();
}

async function getCachedReadme(
	repo: string,
	branch: string,
	slug: string,
): Promise<FetchedReadme | null> {
	return unstable_cache(
		async () => fetchReadme(repo, branch),
		["marketplace-readme-v3", slug, repo, branch],
		{
			revalidate: REVALIDATE_SECONDS,
			tags: ["marketplace-plugins", `marketplace-readme-${slug}`],
		},
	)();
}

function withEnrichment(
	plugin: MarketplacePlugin,
	enrichment: MarketplacePluginEnrichment,
): EnrichedMarketplacePlugin {
	return { ...plugin, enrichment };
}

async function mapPool<T, R>(
	items: readonly T[],
	concurrency: number,
	mapper: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
	const results: PromiseSettledResult<R>[] = new Array(items.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		while (nextIndex < items.length) {
			const index = nextIndex++;
			try {
				const value = await mapper(items[index], index);
				results[index] = { status: "fulfilled", value };
			} catch (reason) {
				results[index] = { status: "rejected", reason };
			}
		}
	}

	const pool = Math.min(Math.max(concurrency, 1), items.length || 1);
	await Promise.all(Array.from({ length: pool }, () => worker()));
	return results;
}

export async function getEnrichedMarketplacePlugins(): Promise<
	EnrichedMarketplacePlugin[]
> {
	const plugins = getMarketplacePlugins();
	const results = await mapPool(plugins, 4, async (plugin) => {
		const enrichment = await getCachedEnrichment(plugin);
		// Always merge with live registry so edits (e.g. featured) apply immediately
		return withEnrichment(plugin, enrichment);
	});

	return results.map((result, index) => {
		const plugin = plugins[index];
		if (result.status === "fulfilled") return result.value;
		console.error(`Failed to enrich ${plugin.slug}:`, result.reason);
		return withEnrichment(plugin, emptyEnrichment());
	});
}

export async function getMarketplacePluginDetail(
	slug: string,
): Promise<MarketplacePluginDetail | null> {
	const plugin = getMarketplacePlugin(slug);
	if (!plugin) return null;

	const enrichment = await getCachedEnrichment(plugin);

	// Docs plugins use a short DX guide instead of a GitHub README.
	if (plugin.docsHref) {
		return {
			...plugin,
			enrichment,
			readme: null,
			readmeFilePath: null,
		};
	}

	const readme = await getCachedReadme(
		plugin.repo,
		enrichment.defaultBranch,
		plugin.slug,
	);

	return {
		...plugin,
		enrichment,
		readme: readme?.content ?? null,
		readmeFilePath: readme?.filePath ?? null,
	};
}
