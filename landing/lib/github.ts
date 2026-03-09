import type { Octokit } from "octokit";
import { App } from "octokit";
import type {
	ActionResponse,
	BlockFeedback,
	PageFeedback,
} from "@/components/feedback/schema";
import { blockFeedback, pageFeedback } from "@/components/feedback/schema";

export const repo = "better-auth";
export const owner = "better-auth";
export const DocsCategory = "Docs Feedback";

let instance: Octokit | undefined;

async function getOctokit(): Promise<Octokit> {
	if (instance) return instance;
	const appId = process.env.GITHUB_APP_ID;
	const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

	if (!appId || !privateKey) {
		throw new Error(
			"No GitHub keys provided for Github app, docs feedback feature will not work.",
		);
	}

	const app = new App({
		appId,
		privateKey: privateKey.replace(/\\n/g, "\n"), // To fix vercel's errors with multiline env
	});

	const { data } = await app.octokit.request(
		"GET /repos/{owner}/{repo}/installation",
		{
			owner,
			repo,
			headers: {
				"X-GitHub-Api-Version": "2022-11-28",
			},
		},
	);

	instance = await app.getInstallationOctokit(data.id);
	return instance;
}

interface RepositoryInfo {
	id: string;
	discussionCategories: {
		nodes: {
			id: string;
			name: string;
		}[];
	};
}

let cachedDestination: RepositoryInfo | undefined;
async function getFeedbackDestination() {
	if (cachedDestination) return cachedDestination;
	const octokit = await getOctokit();

	const {
		repository,
	}: {
		repository: RepositoryInfo;
	} = await octokit.graphql(`
  query {
    repository(owner: "${owner}", name: "${repo}") {
      id
      discussionCategories(first: 25) {
        nodes { id name }
      }
    }
  }
`);

	return (cachedDestination = repository);
}

export async function onPageFeedbackAction(
	feedback: PageFeedback,
): Promise<ActionResponse> {
	"use server";
	feedback = pageFeedback.parse(feedback);
	return createDiscussionThread(
		feedback.url,
		`[${feedback.opinion}] ${feedback.message}\n\n> Forwarded from user feedback.`,
	);
}

export async function onBlockFeedbackAction(
	feedback: BlockFeedback,
): Promise<ActionResponse> {
	"use server";
	feedback = blockFeedback.parse(feedback);
	return createDiscussionThread(
		feedback.url,
		`> ${feedback.blockBody ?? feedback.blockId}\n\n${feedback.message}\n\n> Forwarded from user feedback.`,
	);
}

async function createDiscussionThread(pageId: string, body: string) {
	const octokit = await getOctokit();
	const destination = await getFeedbackDestination();
	const category = destination.discussionCategories.nodes.find(
		(category) => category.name === DocsCategory,
	);

	if (!category)
		throw new Error(
			`Please create a "${DocsCategory}" category in GitHub Discussion`,
		);

	const title = `Feedback for ${pageId}`;
	const {
		search: {
			nodes: [discussion],
		},
	}: {
		search: {
			nodes: { id: string; url: string }[];
		};
	} = await octokit.graphql(`
          query {
            search(type: DISCUSSION, query: ${JSON.stringify(`${title} in:title repo:${owner}/${repo} author:@me`)}, first: 1) {
              nodes {
                ... on Discussion { id, url }
              }
            }
          }`);

	if (discussion) {
		const result: {
			addDiscussionComment?: {
				comment: { id: string; url: string };
			};
		} = await octokit.graphql(`
            mutation {
              addDiscussionComment(input: { body: ${JSON.stringify(body)}, discussionId: "${discussion.id}" }) {
                comment { id, url }
              }
            }`);

		const githubUrl = result.addDiscussionComment?.comment.url;

		if (!githubUrl) {
			console.warn(
				`Failed to add comment to GitHub discussion for page "${pageId}" in category "${DocsCategory}". ` +
					`Unexpected result received: ${JSON.stringify(result, null, 2)}`,
			);
			return {};
		}

		return {
			githubUrl,
		};
	} else {
		const result: {
			createDiscussion?: { discussion: { id: string; url: string } };
			discussion?: { id: string; url: string }; // as a fallback
		} = await octokit.graphql(`
            mutation {
              createDiscussion(input: { repositoryId: "${destination.id}", categoryId: "${category.id}", body: ${JSON.stringify(body)}, title: ${JSON.stringify(title)} }) {
                discussion { id, url }
              }
            }`);

		const githubUrl =
			result.discussion?.url ?? result.createDiscussion?.discussion.url;

		if (!githubUrl) {
			console.warn(
				`Failed to create GitHub discussion for page "${pageId}" in category "${DocsCategory}". ` +
					`Unexpected result received: ${JSON.stringify(result, null, 2)}`,
			);
			return {};
		}

		return {
			githubUrl,
		};
	}
}
