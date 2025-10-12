import { betterFetch } from "@better-fetch/fetch";

const INKEEP_ANALYTICS_BASE_URL = "https://api.analytics.inkeep.com";

export interface InkeepMessage {
	id?: string;
	role: "user" | "assistant" | "system";
	content: string;
}

export interface InkeepConversation {
	id?: string;
	type: "openai";
	messages: InkeepMessage[];
	properties?: Record<string, any>;
	userProperties?: Record<string, any>;
}

export interface InkeepFeedback {
	type: "positive" | "negative";
	messageId: string;
	reasons?: Array<{
		label: string;
		details?: string;
	}>;
}

export interface InkeepEvent {
	type: string;
	entityType: "message" | "conversation";
	messageId?: string;
	conversationId?: string;
}

function getApiKey(): string {
	const apiKey =
		process.env.INKEEP_ANALYTICS_API_KEY || process.env.INKEEP_API_KEY;
	if (!apiKey) {
		throw new Error(
			"INKEEP_ANALYTICS_API_KEY or INKEEP_API_KEY environment variable is required",
		);
	}
	return apiKey;
}

async function makeAnalyticsRequest(endpoint: string, data: any) {
	const apiKey = getApiKey();

	const { data: result, error } = await betterFetch(
		`${INKEEP_ANALYTICS_BASE_URL}${endpoint}`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(data),
		},
	);

	if (error) {
		throw new Error(
			`Inkeep Analytics API error: ${error.status} ${error.message}`,
		);
	}

	return result;
}

export async function logConversationToAnalytics(
	conversation: InkeepConversation,
) {
	return await makeAnalyticsRequest("/conversations", conversation);
}

export async function submitFeedbackToAnalytics(feedback: InkeepFeedback) {
	return await makeAnalyticsRequest("/feedback", feedback);
}

export async function logEventToAnalytics(event: InkeepEvent) {
	return await makeAnalyticsRequest("/events", event);
}

export async function logConversationToInkeep(messages: InkeepMessage[]) {
	try {
		const { data, error } = await betterFetch("/api/analytics/conversation", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ messages }),
		});

		if (error) {
			throw new Error(
				`Failed to log conversation: ${error.status} - ${error.message}`,
			);
		}

		return data;
	} catch (error) {
		return null;
	}
}

export async function submitFeedbackToInkeep(
	messageId: string,
	type: "positive" | "negative",
	reasons?: Array<{ label: string; details?: string }>,
) {
	try {
		const { data, error } = await betterFetch("/api/analytics/feedback", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ messageId, type, reasons }),
		});

		if (error) {
			throw new Error(
				`Failed to submit feedback: ${error.status} - ${error.message}`,
			);
		}

		return data;
	} catch (error) {
		console.error("Error in submitFeedbackToInkeep:", error);
		return null;
	}
}

export async function logEventToInkeep(
	type: string,
	entityType: "message" | "conversation",
	messageId?: string,
	conversationId?: string,
) {
	try {
		const { data, error } = await betterFetch("/api/analytics/event", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ type, entityType, messageId, conversationId }),
		});

		if (error) {
			throw new Error(
				`Failed to log event: ${error.status} - ${error.message}`,
			);
		}

		return data;
	} catch (error) {
		return null;
	}
}
