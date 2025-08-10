import type { ReportInput, ReportConfig } from "./types";

import { reportInputForDev } from "./test";
import { formattedDate, ninetyDaysAgo } from "./utils";

import { info, setFailed } from "@actions/core";
import { BlockCollection, Divider, Section } from "slack-block-builder";

export async function postGitHubReport(
	input: ReportInput,
	config: ReportConfig,
) {
	try {
		// Ensure repo query is included if not present
		const repoFilter = `repo:${input.owner}/${input.repo}`;
		let q = config.search?.q || "";
		if (!q.includes(repoFilter)) {
			q = q.length ? q + " " + repoFilter : repoFilter;
		}

		const { data } = await input.octoClient.rest.search.issuesAndPullRequests({
			...config.search,
			q,
			advanced_search: true,
		});

		if (data.items.length === 0) {
			info(`No results found.`);
			return;
		}

		const itemBlocks = data.items.flatMap((item, i) => [
			Divider(),
			Section({
				text: `${i + 1}. *<${item.html_url}|#${item.number}>* — ${item.title}`,
			}).fields([
				config.renderField(item),
				`*:calendar: Created:* ${formattedDate(item.created_at)}`,
			]),
		]);
		const blocks = BlockCollection([
			Section({
				text: config.renderTitle(data.items.length),
			}),
			...itemBlocks,
			Divider(),
		]);

		await input.slackClient.chat.postMessage({
			blocks,
		  text: config.renderTitle(data.items.length),
			channel: "#open-source",
			icon_emoji: ":github:",
			username: "GitHub Reports",
		});

		info(`Posted GitHub search report to Slack!`);
	} catch (error: any) {
		setFailed(error);
	}
}

if (import.meta.main) {
	const input = reportInputForDev();

	// popular issues sorted by reactions
	postGitHubReport(input, {
		search: {
			order: "desc",
			per_page: 5,
			q: `-is:draft is:pr is:open created:>=${ninetyDaysAgo()}`,
			sort: "reactions",
		},
		renderField: (pr) => `*:star: Reactions:* ${pr.reactions?.total_count}`,
		renderTitle: (count) =>
			`:trophy: *Top ${count} PRs by Reactions in the Last 90 Days*`,
	});

	// popular issues sorted by reactions
	postGitHubReport(input, {
		search: {
			order: "desc",
			per_page: 5,
			q: `-is:draft is:issue is:open created:>=${ninetyDaysAgo()}`,
			sort: "reactions",
		},
		renderField: (issue) => `*:speech_balloon: Comments:* ${issue.comments}`,
		renderTitle: (count) =>
			`:trophy: *Top ${count} Issues by Reactions in the Last 90 Days*`,
	});
}
