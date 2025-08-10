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
			channel: "#github-reports",
			icon_emoji: ":github:",
			username: "GitHub Reports",
		});

		info(`Posted GitHub search report to Slack!`);
	} catch (error: any) {
		setFailed(error);
	}
}
