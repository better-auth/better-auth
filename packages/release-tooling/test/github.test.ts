import type { JSONValue } from "ai";
import { describe, expect, it, vi } from "vitest";
import { createGitHubReader, parseGitHubRepository } from "../src/github.ts";

function jsonResponse(
	body: JSONValue,
	status = 200,
	headers: HeadersInit = {},
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

function createFetch(): typeof fetch {
	const request = async (
		input: Parameters<typeof fetch>[0],
	): Promise<Response> => {
		const url = input instanceof Request ? input.url : String(input);
		if (url.endsWith("/repos/better-auth/better-auth/pulls/42")) {
			return jsonResponse({
				number: 42,
				title: "fix(session): prevent duplicate refreshes",
				body: "User-visible fix",
				user: { login: "octocat" },
				head: {
					ref: "fix/session",
					repo: { full_name: "better-auth/better-auth" },
				},
				base: { ref: "main" },
				labels: [{ name: "core" }],
			});
		}
		if (url.includes("/repos/better-auth/better-auth/pulls/42/files")) {
			if (new URL(url).searchParams.get("page") === "2") {
				return jsonResponse([
					{
						filename: "packages/core/src/session.ts",
						status: "modified",
						additions: 1,
						deletions: 0,
						patch: "+export const refresh = true;",
					},
				]);
			}
			return jsonResponse(
				[
					{
						filename: "packages/better-auth/src/session.ts",
						status: "modified",
						additions: 1,
						deletions: 1,
						patch: "-oldSession();\n+newSession();",
					},
				],
				200,
				{
					link: '<https://api.github.test/repos/better-auth/better-auth/pulls/42/files?per_page=100&page=2>; rel="next"',
				},
			);
		}
		if (url.includes("/repos/better-auth/better-auth/pulls/404/files")) {
			return jsonResponse([]);
		}
		if (url.endsWith("/repos/better-auth/better-auth/pulls/404")) {
			return jsonResponse({ message: "Not Found" }, 404);
		}
		if (url.includes("/repos/better-auth/better-auth/pulls/500/files")) {
			return jsonResponse([]);
		}
		if (url.endsWith("/repos/better-auth/better-auth/pulls/500")) {
			return jsonResponse({ message: "Server Error" }, 500);
		}
		if (url.endsWith("/repos/better-auth/better-auth/releases/tags/v1.2.3")) {
			return jsonResponse({ body: "Release body" });
		}
		if (url.endsWith("/repos/better-auth/better-auth/releases/tags/v0.0.0")) {
			return jsonResponse({ message: "Not Found" }, 404);
		}
		return jsonResponse({ message: `Unexpected URL: ${url}` }, 500);
	};
	return request;
}

describe("GitHubReader", () => {
	it("aborts GitHub requests after the configured timeout", async () => {
		const fetch: typeof globalThis.fetch = (_input, init) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener(
					"abort",
					() => reject(init.signal?.reason),
					{ once: true },
				);
			});
		const github = createGitHubReader({
			repository: parseGitHubRepository("better-auth/better-auth"),
			token: "test-token",
			baseUrl: "https://api.github.test",
			fetch,
			requestTimeoutMs: 10,
		});

		await expect(github.getReleaseBody("v1.2.3")).rejects.toMatchObject({
			status: 500,
		});
	});

	it("maps pull requests and paginated files into release data", async () => {
		const github = createGitHubReader({
			repository: parseGitHubRepository("better-auth/better-auth"),
			token: "test-token",
			baseUrl: "https://api.github.test",
			fetch: createFetch(),
		});

		await expect(github.getPullRequest(42)).resolves.toEqual({
			number: 42,
			title: "fix(session): prevent duplicate refreshes",
			body: "User-visible fix",
			author: "octocat",
			headRef: "fix/session",
			baseRef: "main",
			labels: ["core"],
			isFork: false,
			changedFiles: [
				"packages/better-auth/src/session.ts",
				"packages/core/src/session.ts",
			],
			diff: [
				"packages/better-auth/src/session.ts (modified, +1/-1)",
				"-oldSession();",
				"+newSession();",
				"",
				"packages/core/src/session.ts (modified, +1/-0)",
				"+export const refresh = true;",
			].join("\n"),
		});
	});

	it("returns null only for missing releases", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const github = createGitHubReader({
			repository: parseGitHubRepository("better-auth/better-auth"),
			token: "test-token",
			baseUrl: "https://api.github.test",
			fetch: createFetch(),
		});

		await expect(github.getReleaseBody("v1.2.3")).resolves.toBe("Release body");
		await expect(github.getReleaseBody("v0.0.0")).resolves.toBeNull();
		await expect(github.getReleaseBody("v9.9.9")).rejects.toMatchObject({
			status: 500,
		});
	});

	it("returns null only for missing pull requests", async () => {
		const github = createGitHubReader({
			repository: parseGitHubRepository("better-auth/better-auth"),
			token: "test-token",
			baseUrl: "https://api.github.test",
			fetch: createFetch(),
		});

		await expect(github.getPullRequest(404)).resolves.toBeNull();
		await expect(github.getPullRequest(500)).rejects.toMatchObject({
			status: 500,
		});
	});

	it("rejects ambiguous repository slugs", () => {
		expect(() => parseGitHubRepository("better-auth")).toThrow(
			"Invalid GitHub repository",
		);
		expect(() =>
			parseGitHubRepository("better-auth/better-auth/extra"),
		).toThrow("Invalid GitHub repository");
	});
});
