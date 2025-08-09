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
			per_page: 15,
			q: `repo:${owner}/${repo} -is:draft is:pr is:open created:>=${ninetyDaysAgo()}`,
			sort: "reactions",
		});

		if (prs.items.length > 0) {
			let text = "";
			let count = 0;

			prs.items.forEach((pr, i) => {
				if (pr.reactions) {
					if (pr.reactions.total_count > 1) {
						text += `${i + 1}. [<${pr.html_url}|#${pr.number}>, ${
							pr.reactions.total_count
						} reactions, ${formattedDate(pr.created_at)}]: ${pr.title}\n`;
						count++;
					}
				}
			});

			const blocks = BlockCollection([
				Section({
					text: `*A list of the top ${count} PRs sorted by the most reactions (> 1) over the last 90 days.*`,
				}),
				Divider(),
				Section({
					text,
				}),
			]);

			await slackClient.chat.postMessage({
				blocks,
				channel: "#open-source",
				icon_emoji: ":github:",
				username: "GitHub Reports",
			});

			info(`Posted to Slack!`);
		} else {
			info(`No popular PRs.`);
		}
	} catch (error: any) {
		setFailed(error);
	}
}
