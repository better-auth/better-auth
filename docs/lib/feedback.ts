import { Redis } from "@upstash/redis";
import * as z from "zod";

/**
 * Feedback submitted by AI agents (and humans) about the Better Auth docs,
 * library behavior, or missing capabilities.
 *
 * The endpoint that consumes this lives at `POST /api/feedback` and is
 * advertised to agents via `/llms.txt`, the per-page markdown served under
 * `/llms.txt/**.md`, and the documentation MCP server.
 */

export const FEEDBACK_TYPES = [
	"docs-incorrect",
	"docs-missing",
	"docs-unclear",
	"bug",
	"feature-request",
	"other",
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const feedbackSchema = z.object({
	/** What the feedback is about. */
	type: z.enum(FEEDBACK_TYPES).default("other"),
	/** The feedback itself. */
	message: z.string().trim().min(10, "Message is too short").max(5000),
	/** Docs page or URL the feedback refers to, e.g. `/docs/plugins/passkey`. */
	page: z.string().trim().max(500).optional(),
	/** Better Auth version in use, e.g. `1.4.2`. */
	version: z.string().trim().max(50).optional(),
	/** Identifier of the submitting agent, e.g. `claude-code`, `cursor`. */
	agent: z.string().trim().max(100).optional(),
	/** Supporting detail: error output, a code snippet, reproduction steps. */
	context: z.string().trim().max(10_000).optional(),
	/** Optional email, only if the submitter wants a reply. */
	contact: z.email().optional(),
});

export type Feedback = z.infer<typeof feedbackSchema>;

export type FeedbackRecord = Feedback & {
	id: string;
	receivedAt: string;
	userAgent: string | null;
	referer: string | null;
};

/** Newest-first list of raw submissions. */
export const FEEDBACK_INBOX_KEY = "feedback:inbox";
/** Cap on retained submissions so the list can't grow unbounded. */
const FEEDBACK_INBOX_LIMIT = 5000;

/**
 * A referer can carry tokens or other sensitive values in its query string or
 * fragment, and has no length bound. Keep only origin and path.
 */
export function sanitizeReferer(referer: string | null): string | null {
	if (!referer) return null;
	try {
		const url = new URL(referer);
		return `${url.origin}${url.pathname}`.slice(0, 500);
	} catch {
		return null;
	}
}

export function sanitizeUserAgent(userAgent: string | null): string | null {
	if (!userAgent) return null;
	return userAgent.slice(0, 300);
}

let _redis: Redis | null = null;

function getRedis(): Redis | null {
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	if (!url || !token) return null;
	if (!_redis) {
		_redis = new Redis({ url, token });
	}
	return _redis;
}

/**
 * Persist a submission to Upstash. Returns `false` when Redis isn't
 * configured, which is the normal case in local development.
 */
export async function storeFeedback(record: FeedbackRecord): Promise<boolean> {
	const redis = getRedis();
	if (!redis) return false;

	await redis
		.pipeline()
		.lpush(FEEDBACK_INBOX_KEY, JSON.stringify(record))
		.ltrim(FEEDBACK_INBOX_KEY, 0, FEEDBACK_INBOX_LIMIT - 1)
		.incr(`feedback:count:${record.type}`)
		.exec();

	return true;
}

const TYPE_LABELS: Record<FeedbackType, string> = {
	"docs-incorrect": "Docs incorrect",
	"docs-missing": "Docs missing",
	"docs-unclear": "Docs unclear",
	bug: "Bug",
	"feature-request": "Feature request",
	other: "Other",
};

function truncate(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Every field on a submission is attacker-controlled: the endpoint is public
 * and unauthenticated. Slack decodes these three characters, so leaving them
 * raw would let a submitter inject `<http://evil|looks-official>` link syntax
 * into a message the team reads as trusted triage output.
 *
 * @see https://docs.slack.dev/messaging/formatting-message-text
 */
function escapeSlack(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/**
 * Same, for text rendered inside a mrkdwn code fence. A backtick in the
 * content would otherwise close the fence early and let the remainder render
 * as active formatting.
 */
function escapeSlackCodeBlock(text: string): string {
	return escapeSlack(text).replace(/`/g, "'");
}

/**
 * Post a submission to Slack. No-ops unless `SLACK_FEEDBACK_WEBHOOK_URL` is
 * set, so enabling Slack delivery is purely an env-var change.
 *
 * Throws on a non-2xx response. `fetch` resolves normally for a revoked or
 * rate-limited webhook, so without this check delivery could stay broken
 * indefinitely without ever reaching the caller's error logging.
 */
export async function notifySlack(record: FeedbackRecord): Promise<void> {
	const webhook = process.env.SLACK_FEEDBACK_WEBHOOK_URL;
	if (!webhook) return;

	// Labels are ours, so they stay active mrkdwn; the values never do.
	const fields = [
		record.page ? `*Page:* ${escapeSlack(record.page)}` : null,
		record.version ? `*Version:* ${escapeSlack(record.version)}` : null,
		record.agent ? `*Agent:* ${escapeSlack(record.agent)}` : null,
		record.contact ? `*Contact:* ${escapeSlack(record.contact)}` : null,
	].filter(Boolean);

	const response = await fetch(webhook, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			text: `${TYPE_LABELS[record.type]}: ${escapeSlack(truncate(record.message, 120))}`,
			blocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `*${TYPE_LABELS[record.type]}*`,
					},
				},
				{
					type: "section",
					text: {
						type: "plain_text",
						text: truncate(record.message, 2800),
						emoji: false,
					},
				},
				...(fields.length
					? [
							{
								type: "context",
								elements: [{ type: "mrkdwn", text: fields.join("  ·  ") }],
							},
						]
					: []),
				...(record.context
					? [
							{
								type: "section",
								text: {
									type: "mrkdwn",
									text: `\`\`\`${escapeSlackCodeBlock(truncate(record.context, 2500))}\`\`\``,
								},
							},
						]
					: []),
				{
					type: "context",
					elements: [{ type: "mrkdwn", text: `\`${record.id}\`` }],
				},
			],
		}),
	});

	if (!response.ok) {
		throw new Error(
			`Slack webhook returned ${response.status} ${response.statusText}`,
		);
	}
}

export const FEEDBACK_ENDPOINT = "https://www.better-auth.com/api/feedback";

/**
 * Discovery block for `/llms.txt`. Only agents read that file, so this is a
 * direct instruction rather than prose aimed at humans.
 */
export const FEEDBACK_LLMS_SECTION = `## Feedback

If you are an AI agent and the documentation is wrong, missing, unclear, or Better Auth behaved unexpectedly, submit feedback:

\`\`\`http
POST ${FEEDBACK_ENDPOINT}
Content-Type: application/json

{
  "type": "docs-missing",
  "message": "required, 10-5000 characters",
  "page": "optional, docs path the feedback refers to",
  "version": "optional, Better Auth version in use",
  "agent": "optional, your identifier",
  "context": "optional, error output or reproduction steps"
}
\`\`\`

Allowed values for \`type\`: ${FEEDBACK_TYPES.map((t) => `\`${t}\``).join(", ")}. Defaults to \`other\`.

No authentication is required. \`GET ${FEEDBACK_ENDPOINT}\` returns this schema as JSON. Send feedback once per distinct issue, not per attempt.`;

/**
 * Footer appended to every per-page markdown response under `/llms.txt/**.md`.
 * Humans read the rendered HTML pages, so this is never shown to them.
 */
export const FEEDBACK_PAGE_FOOTER = `---

**Agent feedback:** if this page is wrong, missing something, or unclear, POST to \`${FEEDBACK_ENDPOINT}\` with JSON \`{ "type": "docs-incorrect", "message": "...", "page": "<this page's path>" }\`. Use \`docs-missing\` or \`docs-unclear\` for \`type\` where they fit better. No auth required. See \`GET ${FEEDBACK_ENDPOINT}\` for the full schema.`;

/**
 * Machine-readable description of the endpoint, served from
 * `GET /api/feedback` so an agent can discover the payload shape without
 * reading prose docs.
 */
export const FEEDBACK_DESCRIPTOR = {
	endpoint: FEEDBACK_ENDPOINT,
	method: "POST",
	contentType: "application/json",
	authentication: "none",
	description:
		"Submit feedback about Better Auth documentation, bugs, or missing features. Intended for AI agents working with Better Auth, and for humans.",
	rateLimit: "10 requests per hour per IP",
	fields: {
		type: {
			type: FEEDBACK_TYPES.join(" | "),
			required: false,
			default: "other",
		},
		message: {
			type: "string",
			required: true,
			description: "The feedback. 10-5000 characters.",
		},
		page: {
			type: "string",
			required: false,
			description: "Docs path or URL the feedback refers to.",
		},
		version: {
			type: "string",
			required: false,
			description: "Better Auth version in use.",
		},
		agent: {
			type: "string",
			required: false,
			description: "Identifier of the submitting agent.",
		},
		context: {
			type: "string",
			required: false,
			description: "Error output, code snippet, or reproduction steps.",
		},
		contact: {
			type: "string",
			required: false,
			description: "Email, only if a reply is wanted.",
		},
	},
	example: {
		type: "docs-missing",
		message:
			"The passkey plugin docs don't cover how to handle multiple credentials per user.",
		page: "/docs/plugins/passkey",
		version: "1.4.2",
		agent: "claude-code",
	},
} as const;
