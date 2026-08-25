import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import * as z from "zod";

const workflowDirectory = resolve(
	import.meta.dirname,
	"../../../.github/workflows",
);

const workflowValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
]);

const workflowStepSchema = z.looseObject({
	if: z.string().optional(),
	name: z.string().optional(),
	uses: z.string().optional(),
	run: z.string().optional(),
	with: z.record(z.string(), workflowValueSchema).optional(),
	env: z.record(z.string(), workflowValueSchema).optional(),
	"continue-on-error": z.union([z.boolean(), z.string()]).optional(),
});

const workflowJobSchema = z.looseObject({
	if: z.string().optional(),
	permissions: z.record(z.string(), z.string()).optional(),
	steps: z.array(workflowStepSchema),
	"timeout-minutes": z.number().positive().optional(),
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

function appTokenPermissions(step: WorkflowStep) {
	return Object.fromEntries(
		Object.entries(step.with ?? {}).filter(([key]) =>
			key.startsWith("permission-"),
		),
	);
}

const commandWorkflow = readWorkflow("release-notes-command.yml");
const ciWorkflow = readWorkflow("ci.yml");
const draftWorkflow = readWorkflow("release-notes-draft.yml");
const promoteWorkflow = readWorkflow("promote.yml");
const releaseWorkflow = readWorkflow("release.yml");
const autoChangesetWorkflow = readWorkflow("auto-changeset.yml");
const verifyChangesetsWorkflow = readWorkflow("verify-changesets.yml");

describe("release notes command security", () => {
	it("bounds every privileged release job", () => {
		for (const file of [
			commandWorkflow,
			draftWorkflow,
			promoteWorkflow,
			releaseWorkflow,
			autoChangesetWorkflow,
		]) {
			for (const job of Object.values(file.workflow.jobs)) {
				expect(job["timeout-minutes"]).toBeGreaterThan(0);
			}
		}
	});

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
		expect(appTokenPermissions(token)).toEqual({
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
		expect(ready.if).toContain("needs.generate.outputs.merged != 'true'");
	});

	it("allows approved-note recovery on merged untagged release PRs", () => {
		const authorize = getStep(
			getJob(commandWorkflow, "generate"),
			"Authorize command and resolve PR",
		);
		const candidate = getStep(
			getJob(commandWorkflow, "generate"),
			"Resolve release candidate",
		);
		const render = getStep(
			getJob(commandWorkflow, "generate"),
			"Render and package final release notes",
		);

		expect(authorize.run).toContain('[ "$STATE" != "open" ]');
		expect(authorize.run).toContain('[ "$MERGED" != "true" ]');
		expect(candidate.run).toContain("v${VERSION}^{commit}");
		expect(candidate.run).toContain("already tagged");
		expect(candidate.run).toContain('origin "$HEAD_SHA"');
		expect(render.env).toHaveProperty(
			"MERGED",
			expect.stringContaining("steps.command.outputs.merged"),
		);
	});

	it("reacts to failed release-note commands", () => {
		const failure = getJob(commandWorkflow, "mark-failure");
		const reaction = getStep(failure, "Mark command as failed");

		expect(failure.permissions).toEqual({ issues: "write" });
		expect(failure.if?.replace(/\s+/g, " ")).toBe(
			"!cancelled() && (needs.generate.result == 'failure' || needs.publish-comment.result == 'failure')",
		);
		expect(actionReferences(failure)).toEqual([]);
		expect(reaction.run).toContain("content='-1'");
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

	it("fetches a missing immutable PR head without checking it out", () => {
		const generate = getJob(commandWorkflow, "generate");
		const verifyHead = getStep(generate, "Verify release PR head");
		const resolveCandidate = getStep(generate, "Resolve release candidate");

		expect(verifyHead.run).toContain(
			"repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}",
		);
		expect(verifyHead.run).toContain(
			"Could not read the current release PR head",
		);
		expect(verifyHead.run).toContain(
			'[[ ! "$CURRENT_HEAD_SHA" =~ ^[0-9a-f]{40}$ ]]',
		);
		expect(verifyHead.run).toContain(
			'[ "$CURRENT_HEAD_SHA" != "$EXPECTED_HEAD_SHA" ]',
		);
		expect(resolveCandidate.run).toContain(
			'git cat-file -e "${HEAD_SHA}^{commit}"',
		);
		expect(resolveCandidate.run).toContain(
			'git fetch --no-tags --no-write-fetch-head origin "$HEAD_SHA"',
		);
		expect(resolveCandidate.run).not.toContain("refs/pull/");
		expect(resolveCandidate.run).not.toMatch(/git (checkout|reset|switch)/);
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
	it("rejects stale release merge groups before publication", () => {
		const mergeGuard = getStep(
			getJob(ciWorkflow, "lint"),
			"Reject stale release merge groups",
		);

		expect(mergeGuard.if).toContain("merge_group");
		expect(mergeGuard.env).toHaveProperty(
			"BASE_SHA",
			expect.stringContaining("merge_group.base_sha"),
		);
		expect(mergeGuard.run).toContain("BASE_VERSION");
		expect(mergeGuard.run).toContain("PENDING_CHANGESETS");
		expect(mergeGuard.run).toContain("HEAD:.changeset/pre.json");
		expect(mergeGuard.run).toContain(".changesets[]");
		expect(mergeGuard.run).toContain("comm -23");
		expect(mergeGuard.run).toContain("grep -v '^README$'");
		expect(mergeGuard.run).toContain("unconsumed changesets");
	});

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
			"VERSION_COMMIT",
			expect.stringContaining("release-candidate.outputs.version_commit"),
		);
		expect(resolveApproved.run).toContain("commits/${COMMIT_SHA}/pulls");
	});

	it("detects untagged version commits across retry pushes", () => {
		const detect = getStep(
			getJob(releaseWorkflow, "release"),
			"Detect release commit",
		);

		expect(detect.run).toContain("release-notes candidate");
		expect(detect.run).toContain('--branch "$GITHUB_SHA"');
		expect(detect.run).not.toContain("github.event.before");
	});

	it("creates GitHub releases after Changesets completes publish mode", () => {
		const release = getJob(releaseWorkflow, "release");
		const createRelease = getStep(release, "Create GitHub Release");
		const resolveApproved = getStep(release, "Resolve approved release notes");
		const resolveApprovedScript = resolveApproved.run ?? "";

		expect(createRelease).toHaveProperty(
			"if",
			expect.stringMatching(
				/release-candidate\.outputs\.release == 'true'.*changesets\.outputs\.hasChangesets == 'false'/,
			),
		);
		expect(createRelease.run).not.toContain("pnpm view");
		expect(createRelease.run).not.toContain("git/refs");
		expect(resolveApprovedScript).toContain(".merge_commit_sha");
		expect(resolveApprovedScript).toContain(
			'[ "$GITHUB_SHA" != "$RELEASE_COMMIT" ]',
		);
		expect(resolveApprovedScript).toContain("original failed Release workflow");
		expect(resolveApprovedScript).toContain("/release-notes");
		expect(resolveApprovedScript).toContain("on merged PR");
		expect(resolveApprovedScript.indexOf('if [ -z "$COMMENT" ]')).toBeLessThan(
			resolveApprovedScript.indexOf(
				'if [ "$GITHUB_SHA" != "$RELEASE_COMMIT" ]',
			),
		);
		expect(createRelease.env).toHaveProperty(
			"RELEASE_COMMIT",
			expect.stringContaining("approved-notes.outputs.release_commit"),
		);
		expect(createRelease.run).toContain('gh release create "$TAG"');
		expect(createRelease.run).toContain('--target "$RELEASE_COMMIT"');
		expect(createRelease.run).not.toContain('COMMIT_SHA="${GITHUB_SHA}"');
	});

	it("fails release commits that contain unapproved changesets", () => {
		const release = getJob(releaseWorkflow, "release");
		const guard = getStep(
			release,
			"Reject release commits with pending changesets",
		);
		const guardIndex = release.steps.indexOf(guard);
		const publishIndex = release.steps.indexOf(
			getStep(release, "Create Release Pull Request or Publish"),
		);

		expect(guardIndex).toBeLessThan(publishIndex);
		expect(guard).toHaveProperty(
			"if",
			expect.stringContaining("release-candidate.outputs.release == 'true'"),
		);
		expect(guard.run).toContain("PENDING_CHANGESETS");
		expect(guard.run).toContain("HEAD:.changeset/pre.json");
		expect(guard.run).toContain(".changesets[]");
		expect(guard.run).toContain("comm -23");
		expect(guard.run).toContain("grep -v '^README$'");
		expect(guard.run).toContain("GITHUB_STEP_SUMMARY");
		expect(guard.run).toContain("Revert this release merge");
		expect(guard.run).toContain("exit 1");
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
		expect(appTokenPermissions(token)).toEqual({
			"permission-contents": "write",
			"permission-pull-requests": "write",
		});
	});

	it("scopes the promotion App token to its required permissions", () => {
		const token = getStep(
			getJob(promoteWorkflow, "promote"),
			"Generate App Token",
		);

		expect(appTokenPermissions(token)).toEqual({
			"permission-contents": "write",
			"permission-pull-requests": "write",
		});
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

		expect(appTokenPermissions(generateToken)).toEqual({
			"permission-contents": "read",
			"permission-issues": "write",
			"permission-pull-requests": "read",
		});
		expect(appTokenPermissions(applyToken)).toEqual({
			"permission-contents": "write",
			"permission-issues": "write",
			"permission-pull-requests": "read",
		});
	});

	it("posts changeset comments through the issues REST API", () => {
		const job = getJob(autoChangesetWorkflow, "changeset");
		for (const name of ["Post skip explanation", "Post changeset comment"]) {
			const step = getStep(job, name);
			expect(step.run).toContain("issues/${PR_NUMBER}/comments");
			expect(step.run).not.toContain("gh pr comment");
		}
	});

	it("does not require public changesets for private release tooling", () => {
		const check = getStep(
			getJob(verifyChangesetsWorkflow, "verify"),
			"Check package changes require changeset",
		);

		expect(check.run).toContain(":(exclude)packages/release-tooling/**");
	});
});
