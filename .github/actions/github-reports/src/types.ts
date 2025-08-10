import { getOctokit } from "@actions/github";
import type { WebClient } from "@slack/web-api";

export type ReportInput = {
	octoClient: ReturnType<typeof getOctokit>;
	slackClient: WebClient;

	owner: string;
	repo: string;
};

type SearchOptions = Parameters<
	ReturnType<typeof getOctokit>["rest"]["search"]["issuesAndPullRequests"]
>[0];

type FieldRenderer = (item: any) => string;
type TitleRenderer = (itemsCount: number) => string;

export type ReportConfig = {
	search: SearchOptions;
	renderTitle: TitleRenderer;
	renderField: FieldRenderer;
};
