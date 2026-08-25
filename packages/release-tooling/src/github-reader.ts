import { Octokit } from "@octokit/rest";

export interface GitHubPullRequest {
	number: number;
	title: string;
	body: string;
	author: string;
	headRef: string;
	baseRef: string;
	labels: string[];
	isFork: boolean;
	changedFiles: string[];
	diff: string;
}

export interface GitHubRepository {
	owner: string;
	repo: string;
	slug: string;
}

export interface GitHubReader {
	repository: GitHubRepository;
	getPullRequest(number: number): Promise<GitHubPullRequest>;
	getReleaseBody(tag: string): Promise<string | null>;
}

interface GitHubReaderOptions {
	repository: GitHubRepository;
	token?: string;
	baseUrl?: string;
	fetch?: typeof fetch;
}

export function parseGitHubRepository(value: string): GitHubRepository {
	const [owner, repo, ...extra] = value.split("/");
	if (!owner || !repo || extra.length > 0) {
		throw new Error(`Invalid GitHub repository: ${value}`);
	}
	return { owner, repo, slug: `${owner}/${repo}` };
}

export function isGitHubNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		error.status === 404
	);
}

export function createGitHubReader(options: GitHubReaderOptions): GitHubReader {
	const { repository } = options;
	const { owner, repo } = repository;
	const octokit = options.token
		? new Octokit({
				auth: options.token,
				userAgent: "better-auth-release-tooling",
				...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
				request: {
					timeout: 30_000,
					...(options.fetch ? { fetch: options.fetch } : {}),
				},
			})
		: null;

	function getClient(): Octokit {
		if (!octokit) {
			throw new Error(
				"GH_TOKEN or GITHUB_TOKEN is required for GitHub API access",
			);
		}
		return octokit;
	}

	return {
		repository,

		async getPullRequest(number) {
			const client = getClient();
			const [pullRequest, files] = await Promise.all([
				client.rest.pulls.get({ owner, repo, pull_number: number }),
				client.paginate(client.rest.pulls.listFiles, {
					owner,
					repo,
					pull_number: number,
					per_page: 100,
				}),
			]);

			const diff = files
				.map((file) =>
					[
						`${file.filename} (${file.status}, +${file.additions}/-${file.deletions})`,
						file.patch ?? "",
					]
						.filter(Boolean)
						.join("\n"),
				)
				.join("\n\n")
				.slice(0, 20_000);

			return {
				number,
				title: pullRequest.data.title,
				body: pullRequest.data.body ?? "",
				author: pullRequest.data.user?.login ?? "unknown",
				headRef: pullRequest.data.head.ref,
				baseRef: pullRequest.data.base.ref,
				labels: pullRequest.data.labels.map((label) =>
					typeof label === "string" ? label : label.name,
				),
				isFork: pullRequest.data.head.repo?.full_name !== repository.slug,
				changedFiles: files.map((file) => file.filename),
				diff,
			};
		},

		async getReleaseBody(tag) {
			try {
				const response = await getClient().rest.repos.getReleaseByTag({
					owner,
					repo,
					tag,
				});
				return response.data.body ?? null;
			} catch (error) {
				if (isGitHubNotFound(error)) {
					return null;
				}
				throw error;
			}
		},
	};
}
