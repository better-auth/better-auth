import { RequestError } from "@octokit/request-error";
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
}

export interface GitHubReader {
	getPullRequest(number: number): Promise<GitHubPullRequest | null>;
	getReleaseBody(tag: string): Promise<string | null>;
}

interface GitHubReaderOptions {
	repository: GitHubRepository;
	token: string;
	baseUrl?: string;
	fetch?: typeof fetch;
	requestTimeoutMs?: number;
}

export function parseGitHubRepository(value: string): GitHubRepository {
	const [owner, repo, ...extra] = value.split("/");
	if (!owner || !repo || extra.length > 0) {
		throw new Error(`Invalid GitHub repository: ${value}`);
	}
	return { owner, repo };
}

export function createGitHubReader(options: GitHubReaderOptions): GitHubReader {
	const { repository } = options;
	const { owner, repo } = repository;
	const repositorySlug = `${owner}/${repo}`;
	const fetchImplementation = options.fetch ?? globalThis.fetch;
	const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
	const octokit = new Octokit({
		auth: options.token,
		baseUrl: options.baseUrl ?? "https://api.github.com",
		userAgent: "better-auth-release-tooling",
		request: {
			fetch: ((input, init) => {
				const timeout = AbortSignal.timeout(requestTimeoutMs);
				const signal = init?.signal
					? AbortSignal.any([init.signal, timeout])
					: timeout;
				return fetchImplementation(input, { ...init, signal });
			}) satisfies typeof fetch,
		},
	});

	return {
		async getPullRequest(number) {
			const response = await Promise.all([
				octokit.rest.pulls.get({ owner, repo, pull_number: number }),
				octokit.paginate(octokit.rest.pulls.listFiles, {
					owner,
					repo,
					pull_number: number,
					per_page: 100,
				}),
			]).catch((error) => {
				if (error instanceof RequestError && error.status === 404) return null;
				throw error;
			});
			if (!response) return null;
			const [pullRequest, files] = response;

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
				isFork: pullRequest.data.head.repo?.full_name !== repositorySlug,
				changedFiles: files.map((file) => file.filename),
				diff,
			};
		},

		async getReleaseBody(tag) {
			try {
				const response = await octokit.rest.repos.getReleaseByTag({
					owner,
					repo,
					tag,
				});
				return response.data.body ?? null;
			} catch (error) {
				if (error instanceof RequestError && error.status === 404) return null;
				throw error;
			}
		},
	};
}
