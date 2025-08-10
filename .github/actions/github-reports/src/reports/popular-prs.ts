import { reportInputForDev } from "../test";
import type { ReportInput } from "../types";
import { formattedDate, ninetyDaysAgo } from "../utils";

import { info, setFailed } from "@actions/core";
import { BlockCollection, Divider, Section } from "slack-block-builder";

export async function popularPrs({
	octoClient,
	slackClient,
	owner,
	repo,
}: ReportInput) {
	try {
		const { data: prs } = await octoClient.rest.search.issuesAndPullRequests({
			order: "desc",
			per_page: 5,
			q: `repo:${owner}/${repo} -is:draft is:pr is:open created:>=${ninetyDaysAgo()}`,
			sort: "reactions",
		});

		if (prs.items.length === 0) {
			info(`No popular PRs.`);
			return;
		}

		const prBlocks = prs.items.flatMap((pr, i) => {
			return [
				Divider(),
				Section({
					text: `${i + 1}. *<${pr.html_url}|#${pr.number}>* — ${pr.title}`,
				}).fields([
					`*:star: Reactions:* ${pr.reactions?.total_count}`,
					`*:calendar: Created:* ${formattedDate(pr.created_at)}`,
				]),
			];
		});

		const blocks = BlockCollection([
			Section({
				text: `:trophy: *Top ${prs.items.length} PRs by Reactions in the Last 90 Days*`,
			}),
			...prBlocks,
		]);

		await slackClient.chat.postMessage({
			blocks,
			channel: "#open-source",
			icon_emoji: ":github:",
			username: "GitHub Reports",
		});

		info(`Posted to Slack!`);
	} catch (error: any) {
		setFailed(error);
	}
}

if (import.meta.main) {
	const input = reportInputForDev();
	popularPrs(input);
}
