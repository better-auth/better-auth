import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import * as z from "zod";

const workflowDirectory = resolve(
	import.meta.dirname,
	"../../../.github/workflows",
);

const workflowStepSchema = z.looseObject({
	name: z.string().optional(),
	uses: z.string().optional(),
	run: z.string().optional(),
	with: z.record(z.string(), z.unknown()).optional(),
	env: z.record(z.string(), z.unknown()).optional(),
	"continue-on-error": z.union([z.boolean(), z.string()]).optional(),
});

const workflowJobSchema = z.looseObject({
	permissions: z.record(z.string(), z.string()).optional(),
	steps: z.array(workflowStepSchema),
});

const workflowSchema = z.looseObject({
	jobs: z.record(z.string(), workflowJobSchema),
});

type Workflow = z.infer<typeof workflowSchema>;
type WorkflowJob = z.infer<typeof workflowJobSchema>;
type WorkflowStep = z.infer<typeof workflowStepSchema>;

interface WorkflowFile {
	content: string;
	workflow: Workflow;
}

function readWorkflow(name: string): WorkflowFile {
	const content = readFileSync(resolve(workflowDirectory, name), "utf-8");
	return {
		content,
		workflow: workflowSchema.parse(parse(content)),
	};
}

function getJob(file: WorkflowFile, name: string): WorkflowJob {
	const job = file.workflow.jobs[name];
	if (!job) throw new Error("Missing workflow job: " + name);
	return job;
}

function getStep(job: WorkflowJob, name: string): WorkflowStep {
	const step = job.steps.find((candidate) => candidate.name === name);
	if (!step) throw new Error("Missing workflow step: " + name);
	return step;
}

function actionReferences(job: WorkflowJob): string[] {
	return job.steps.flatMap((step) => (step.uses ? [step.uses] : []));
}

const commandWorkflow = readWorkflow("release-notes-command.yml");
const draftWorkflow = readWorkflow("release-notes-draft.yml");
const promoteWorkflow = readWorkflow("promote.yml");
const releaseWorkflow = readWorkflow("release.yml");
const autoChangesetWorkflow = readWorkflow("auto-changeset.yml");
const verifyChangesetsWorkflow = readWorkflow("verify-changesets.yml");

describe("release notes command security", () => {
	it("runs AI generation inside the read-only job", () => {
		const generate = getJob(commandWorkflow, "generate");
		const rewrite = getStep(generate, "Rewrite release notes with AI");

		expect(generate.permissions).toEqual({
			contents: "read",
			issues: "read",
			"pull-requests": "read",
		});
		expect(actionReferences(generate)).not.toContainEqual(
			expect.stringContaining("claude-code-action@"),
		);
		expect(actionReferences(generate)).not.toContainEqual(
			expect.stringContaining("create-github-app-token@"),
		);
		expect(rewrite.env).toHaveProperty("AI_GATEWAY_API_KEY");
		expect(rewrite.run).toContain("release-notes rewrite");
		expect(rewrite.run).not.toContain("--allowedTools");
	});

	it("creates a minimally scoped write token only in the comment job", () => {
		const publishComment = getJob(commandWorkflow, "publish-comment");
		const token = getStep(publishComment, "Generate scoped App token");

		expect(publishComment.permissions).toEqual({
			contents: "read",
			issues: "write",
			"pull-requests": "write",
		});
		expect(token.with).toMatchObject({
			"permission-contents": "read",
			"permission-issues": "write",
			"permission-pull-requests": "write",
		});
		expect(actionReferences(publishComment)).not.toContainEqual(
			expect.stringContaining("actions/checkout@"),
		);
		expect(actionReferences(publishComment)).not.toContainEqual(
			expect.stringContaining("actions/setup-node@"),
		);
	});

	it("marks the release PR ready after publishing its preview", () => {
		const ready = getStep(
			getJob(commandWorkflow, "publish-comment"),
			"Mark release PR ready",
		);

		expect(ready.env).toHaveProperty(
			"PR_NUMBER",
			expect.stringContaining("needs.generate.outputs.pr_number"),
		);
		expect(ready.run).toContain('gh pr ready "$PR_NUMBER"');
	});

	it("returns release carriers to draft without pull_request_target", () => {
		const draft = getJob(draftWorkflow, "draft");
		const keepDraft = getStep(draft, "Keep release PR in draft");

		expect(draft.permissions).toEqual({ "pull-requests": "write" });
		expect(actionReferences(draft)).toEqual([]);
		expect(draftWorkflow.content).not.toContain("pull_request_target");
		expect(draftWorkflow.content).toContain("ready_for_review");
		expect(draftWorkflow.content).toContain("better-release[bot]");
		expect(keepDraft.run).toContain('gh pr ready "$PR_NUMBER" --undo');
	});

	it("executes trusted default-branch code and uses artifacts between jobs", () => {
		const generate = getJob(commandWorkflow, "generate");
		const checkout = generate.steps.find((step) =>
			step.uses?.startsWith("actions/checkout@"),
		);

		expect(checkout?.with?.ref).toContain("github.sha");
		expect(checkout?.with?.["persist-credentials"]).toBe(false);
		expect(actionReferences(generate)).toContainEqual(
			expect.stringContaining("actions/upload-artifact@"),
		);
		expect(
			actionReferences(getJob(commandWorkflow, "publish-comment")),
		).toContainEqual(expect.stringContaining("actions/download-artifact@"));
	});

	it("reads the immutable release head without fetching or checking it out", () => {
		const resolveCandidate = getStep(
			getJob(commandWorkflow, "generate"),
			"Resolve release candidate",
		);

		expect(resolveCandidate.run).toContain(
			'git cat-file -e "${HEAD_SHA}^{commit}"',
		);
		expect(resolveCandidate.run).not.toContain("git fetch");
		expect(resolveCandidate.run).not.toContain("git checkout");
	});

	it("paginates comments before locating the trusted preview", () => {
		const publishComment = getJob(commandWorkflow, "publish-comment");
		const publish = getStep(
			publishComment,
			"Create or update release notes comment",
		);

		expect(publish.run).toContain("comments?per_page=100");
		expect(publish.run).toContain("gh api --paginate");
	});

	it("pins every third-party action to an immutable commit", () => {
		for (const file of [
			commandWorkflow,
			draftWorkflow,
			promoteWorkflow,
			releaseWorkflow,
			autoChangesetWorkflow,
			verifyChangesetsWorkflow,
		]) {
			for (const job of Object.values(file.workflow.jobs)) {
				for (const reference of actionReferences(job)) {
					expect(reference).toMatch(/^[^@]+@[a-f0-9]{40}$/);
				}
			}
		}
	});

	it("accepts Version PRs and next-to-main promotion PRs", () => {
		const authorize = getStep(
			getJob(commandWorkflow, "generate"),
			"Authorize command and resolve PR",
		);
		const resolveApproved = getStep(
			getJob(releaseWorkflow, "release"),
			"Resolve approved release notes",
		);

		expect(authorize.run).toContain('[[ "$HEAD_REF" == changeset-release/* ]]');
		expect(authorize.run).toContain(
			'[ "$HEAD_REF" = "next" ] && [ "$BASE_REF" = "main" ]',
		);
		expect(resolveApproved.run).toContain(
			'.head.ref == "next" and .base.ref == "main"',
		);
	});

	it("falls back to deterministic notes when AI rewriting fails", () => {
		const generate = getJob(commandWorkflow, "generate");
		const rewrite = getStep(generate, "Rewrite release notes with AI");
		const render = getStep(generate, "Render and package final release notes");

		expect(rewrite["continue-on-error"]).toBe(true);
		expect(render.env).toHaveProperty("RAW_PATH");
		expect(render.run).toContain('SOURCE="raw"');
		expect(render.run).toContain('cp "$RAW_PATH" "$NOTES_PATH"');
	});
});

describe("release publication security", () => {
	it("resolves approved notes before invoking the publisher", () => {
		const release = getJob(releaseWorkflow, "release");
		const stepNames = release.steps.map((step) => step.name);
		const approvalIndex = stepNames.indexOf("Resolve approved release notes");
		const publishIndex = stepNames.indexOf(
			"Create Release Pull Request or Publish",
		);

		expect(approvalIndex).toBeGreaterThan(-1);
		expect(publishIndex).toBeGreaterThan(approvalIndex);
		expect(release.steps[approvalIndex]?.run).toContain(
			"release-notes:comment extract",
		);
	});

	it("paginates approved-note comments", () => {
		const resolveApproved = getStep(
			getJob(releaseWorkflow, "release"),
			"Resolve approved release notes",
		);

		expect(resolveApproved.run).toContain("comments?per_page=100");
		expect(resolveApproved.run).toContain("gh api --paginate");
		expect(resolveApproved.env).toHaveProperty(
			"BASE_SHA",
			expect.stringContaining("release-candidate.outputs.base_sha"),
		);
		expect(resolveApproved.run).toContain(
			'git rev-list --first-parent "${BASE_SHA}..${GITHUB_SHA}"',
		);
	});

	it("detects version transitions across the complete push", () => {
		const detect = getStep(
			getJob(releaseWorkflow, "release"),
			"Detect release commit",
		);

		expect(detect.env).toHaveProperty(
			"BEFORE_SHA",
			expect.stringContaining("github.event.before"),
		);
		expect(detect.run).toContain(
			'git show "${BEFORE_SHA}:packages/better-auth/package.json"',
		);
		expect(detect.run).not.toContain('"${GITHUB_SHA}^:');
	});

	it("creates a GitHub release only after Changesets publishes", () => {
		const release = getJob(releaseWorkflow, "release");
		const createRelease = getStep(release, "Create GitHub Release");

		expect(createRelease).toHaveProperty(
			"if",
			expect.stringContaining("steps.changesets.outputs.published == 'true'"),
		);
		expect(createRelease.env).toHaveProperty(
			"PUBLISHED_PACKAGES",
			expect.stringContaining("steps.changesets.outputs.publishedPackages"),
		);
		expect(createRelease.run).toContain('.name == "better-auth"');
		expect(createRelease.run).toContain('"$PUBLISHED_VERSION" != "$VERSION"');
	});

	it("creates and updates Version PRs as drafts with usage guidance", () => {
		const release = getJob(releaseWorkflow, "release");
		const changesets = getStep(
			release,
			"Create Release Pull Request or Publish",
		);
		const rename = getStep(release, "Rename release PR with version");
		const promote = getStep(
			getJob(promoteWorkflow, "promote"),
			"Create promote PR",
		);

		expect(changesets.with).toHaveProperty("prDraft", "always");
		expect(rename.run).toContain("<!-- release-notes-draft -->");
		expect(rename.run).toContain("Do not manually mark it ready");
		expect(promote.run).toContain("--draft");
		expect(promote.run).toContain("Do not manually mark it ready");
	});

	it("does not grant issue write access to the publisher", () => {
		const release = getJob(releaseWorkflow, "release");
		const token = getStep(release, "Generate App Token");

		expect(release.permissions).toEqual({
			contents: "write",
			"pull-requests": "write",
			"id-token": "write",
		});
		expect(token.with).not.toHaveProperty("permission-issues");
	});

	it("keeps AI preview generation out of the privileged release workflow", () => {
		const release = getJob(releaseWorkflow, "release");

		expect(actionReferences(release)).not.toContainEqual(
			expect.stringContaining("claude-code-action@"),
		);
		expect(releaseWorkflow.content).not.toContain("AI_GATEWAY_API_KEY");
		expect(releaseWorkflow.workflow.jobs).not.toHaveProperty("preview-notes");
	});
});

describe("release tooling package boundary", () => {
	it("runs release scripts through the private workspace package", () => {
		for (const file of [
			commandWorkflow,
			releaseWorkflow,
			autoChangesetWorkflow,
		]) {
			expect(file.content).not.toContain(".github/scripts/");
		}

		expect(commandWorkflow.content).not.toContain("rewrite.prompt.md");
		expect(commandWorkflow.content).not.toContain("rewrite_schema");
		expect(
			getStep(getJob(autoChangesetWorkflow, "changeset"), "Analyze PR").run,
		).toContain("@better-auth/release-tooling auto-changeset");
		expect(autoChangesetWorkflow.content).not.toContain("claude-code-action@");
	});

	it("executes auto-changeset tooling from the trusted default branch", () => {
		const changeset = getJob(autoChangesetWorkflow, "changeset");
		const checkout = changeset.steps.find((step) =>
			step.uses?.startsWith("actions/checkout@"),
		);

		expect(checkout?.with?.ref).toContain("github.sha");
		expect(checkout?.with?.["persist-credentials"]).toBe(false);
		expect(getStep(changeset, "Install release tooling").run).toContain(
			"pnpm install --frozen-lockfile --filter @better-auth/release-tooling",
		);
	});

	it("limits auto-changeset App tokens to each job's permissions", () => {
		const generateToken = getStep(
			getJob(autoChangesetWorkflow, "changeset"),
			"Generate App Token",
		);
		const applyToken = getStep(
			getJob(autoChangesetWorkflow, "apply"),
			"Generate App Token",
		);

		expect(generateToken.with).toMatchObject({
			"permission-contents": "read",
			"permission-issues": "write",
			"permission-pull-requests": "read",
		});
		expect(applyToken.with).toMatchObject({
			"permission-contents": "write",
			"permission-issues": "write",
			"permission-pull-requests": "read",
		});
	});

	it("does not require public changesets for private release tooling", () => {
		const check = getStep(
			getJob(verifyChangesetsWorkflow, "verify"),
			"Check package changes require changeset",
		);

		expect(check.run).toContain(":(exclude)packages/release-tooling/**");
	});
});
