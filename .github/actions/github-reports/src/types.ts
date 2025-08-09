import { getOctokit } from "@actions/github";
import type { WebClient } from "@slack/web-api";

export type ReportInput = {
	octoClient: ReturnType<typeof getOctokit>;
	slackClient: WebClient;

	owner: string;
	repo: string;
};
