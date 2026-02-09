import { createAuthEndpoint } from "better-auth/api";
import z from "zod";
import { jwtMiddleware } from "../jwt";
import type { DashOptionsInternal } from "../types";

// Log drain types
export type OrgLogDrainDestinationType = "datadog" | "splunk" | "webhook";

export type OrgLogDrainEventType =
	| "auth" // Sign-in, sign-up, sign-out, password reset, etc.
	| "security" // Bot detection, brute force, email abuse, etc.
	| "email" // Email sent events
	| "all"; // All event types

export interface OrgLogDrain {
	id: string;
	organizationId: string;
	name: string;
	enabled: boolean;
	destinationType: OrgLogDrainDestinationType;
	eventTypes: OrgLogDrainEventType[];
	config: Record<string, unknown>;
	createdAt: Date | string;
	updatedAt: Date | string;
}

// Config schemas for validation
const datadogConfigSchema = z.object({
	apiKey: z.string().min(1, "API key is required"),
	site: z.string().optional().default("datadoghq.com"),
	service: z.string().optional(),
	source: z.string().optional(),
	tags: z.array(z.string()).optional(),
});

const splunkConfigSchema = z.object({
	hecEndpoint: z.string().url("Invalid HEC endpoint URL"),
	hecToken: z.string().min(1, "HEC token is required"),
	index: z.string().optional(),
	source: z.string().optional(),
	sourcetype: z.string().optional(),
});

const webhookConfigSchema = z.object({
	url: z.string().url("Invalid webhook URL"),
	headers: z.record(z.string(), z.string()).optional(),
	method: z.enum(["POST", "PUT"]).optional().default("POST"),
});

// Helper to mask sensitive config values
export function maskSensitiveConfig(
	config: Record<string, unknown>,
	destinationType: OrgLogDrainDestinationType,
): Record<string, unknown> {
	switch (destinationType) {
		case "datadog": {
			const apiKey = config.apiKey as string | undefined;
			return {
				...config,
				apiKey: apiKey ? `****${apiKey.slice(-4)}` : "",
			};
		}
		case "splunk": {
			const hecToken = config.hecToken as string | undefined;
			return {
				...config,
				hecToken: hecToken ? `****${hecToken.slice(-4)}` : "",
			};
		}
		case "webhook": {
			const headers = config.headers as Record<string, string> | undefined;
			if (headers?.Authorization) {
				return {
					...config,
					headers: {
						...headers,
						Authorization: "****",
					},
				};
			}
			return config;
		}
	}
}

export const listOrganizationLogDrains = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/:id/log-drains",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
		},
		async (ctx) => {
			try {
				const logDrains = await ctx.context.adapter.findMany<OrgLogDrain>({
					model: "orgLogDrain",
					where: [
						{
							field: "organizationId",
							value: ctx.params.id,
						},
					],
				});

				// Mask sensitive config values before returning
				return logDrains.map((drain) => ({
					...drain,
					config: maskSensitiveConfig(
						drain.config,
						drain.destinationType as OrgLogDrainDestinationType,
					),
				}));
			} catch {
				// Model may not exist if feature is not set up
				return [];
			}
		},
	);
};

export const createOrganizationLogDrain = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/log-drain/create",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
					}),
				),
			],
			body: z.object({
				name: z.string().min(1, "Name is required"),
				destinationType: z.enum(["datadog", "splunk", "webhook"]),
				eventTypes: z.array(z.enum(["auth", "security", "email", "all"])),
				config: z.record(z.string(), z.unknown()),
				enabled: z.boolean().optional().default(true),
			}),
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;

			// Validate config based on destination type
			let validatedConfig: Record<string, unknown>;
			switch (ctx.body.destinationType) {
				case "datadog":
					validatedConfig = datadogConfigSchema.parse(ctx.body.config);
					break;
				case "splunk":
					validatedConfig = splunkConfigSchema.parse(ctx.body.config);
					break;
				case "webhook":
					validatedConfig = webhookConfigSchema.parse(ctx.body.config);
					break;
			}

			const logDrain = await ctx.context.adapter.create<OrgLogDrain>({
				model: "orgLogDrain",
				data: {
					organizationId,
					name: ctx.body.name,
					enabled: ctx.body.enabled,
					destinationType: ctx.body.destinationType,
					eventTypes: ctx.body.eventTypes,
					config: validatedConfig,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			return {
				...logDrain,
				config: maskSensitiveConfig(
					logDrain.config,
					logDrain.destinationType as OrgLogDrainDestinationType,
				),
			};
		},
	);
};

export const updateOrganizationLogDrain = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/log-drain/update",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
					}),
				),
			],
			body: z.object({
				logDrainId: z.string(),
				name: z.string().min(1).optional(),
				destinationType: z.enum(["datadog", "splunk", "webhook"]).optional(),
				eventTypes: z
					.array(z.enum(["auth", "security", "email", "all"]))
					.optional(),
				config: z.record(z.string(), z.unknown()).optional(),
				enabled: z.boolean().optional(),
			}),
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;

			// Verify the log drain belongs to this organization
			const existingDrain = await ctx.context.adapter.findOne<OrgLogDrain>({
				model: "orgLogDrain",
				where: [
					{ field: "id", value: ctx.body.logDrainId },
					{ field: "organizationId", value: organizationId },
				],
			});

			if (!existingDrain) {
				throw ctx.error("NOT_FOUND", {
					message: "Log drain not found",
				});
			}

			const updateData: Partial<OrgLogDrain> = {
				updatedAt: new Date(),
			};

			if (ctx.body.name !== undefined) {
				updateData.name = ctx.body.name;
			}

			if (ctx.body.enabled !== undefined) {
				updateData.enabled = ctx.body.enabled;
			}

			if (ctx.body.eventTypes !== undefined) {
				updateData.eventTypes = ctx.body.eventTypes;
			}

			// Handle destination type and config changes
			const destinationType =
				ctx.body.destinationType || existingDrain.destinationType;
			if (ctx.body.destinationType !== undefined) {
				updateData.destinationType = ctx.body
					.destinationType as OrgLogDrainDestinationType;
			}

			if (ctx.body.config !== undefined) {
				// Validate config based on destination type
				let validatedConfig: Record<string, unknown>;
				switch (destinationType) {
					case "datadog":
						validatedConfig = datadogConfigSchema.parse(ctx.body.config);
						break;
					case "splunk":
						validatedConfig = splunkConfigSchema.parse(ctx.body.config);
						break;
					case "webhook":
						validatedConfig = webhookConfigSchema.parse(ctx.body.config);
						break;
				}
				updateData.config = validatedConfig;
			}

			const logDrain = await ctx.context.adapter.update<OrgLogDrain>({
				model: "orgLogDrain",
				where: [{ field: "id", value: ctx.body.logDrainId }],
				update: updateData,
			});

			if (!logDrain) {
				throw ctx.error("NOT_FOUND", {
					message: "Log drain not found",
				});
			}

			return {
				...logDrain,
				config: maskSensitiveConfig(
					logDrain.config,
					logDrain.destinationType as OrgLogDrainDestinationType,
				),
			};
		},
	);
};

export const deleteOrganizationLogDrain = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/log-drain/delete",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
					}),
				),
			],
			body: z.object({
				logDrainId: z.string(),
			}),
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;

			// Verify the log drain belongs to this organization
			const existingDrain = await ctx.context.adapter.findOne<OrgLogDrain>({
				model: "orgLogDrain",
				where: [
					{ field: "id", value: ctx.body.logDrainId },
					{ field: "organizationId", value: organizationId },
				],
			});

			if (!existingDrain) {
				throw ctx.error("NOT_FOUND", {
					message: "Log drain not found",
				});
			}

			await ctx.context.adapter.delete({
				model: "orgLogDrain",
				where: [{ field: "id", value: ctx.body.logDrainId }],
			});

			return { success: true };
		},
	);
};

export const testOrganizationLogDrain = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/log-drain/test",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
					}),
				),
			],
			body: z.object({
				destinationType: z.enum(["datadog", "splunk", "webhook"]),
				config: z.record(z.string(), z.unknown()),
			}),
		},
		async (ctx) => {
			const { destinationType, config } = ctx.body;

			// Validate config
			let validatedConfig: Record<string, unknown>;
			switch (destinationType) {
				case "datadog":
					validatedConfig = datadogConfigSchema.parse(config);
					break;
				case "splunk":
					validatedConfig = splunkConfigSchema.parse(config);
					break;
				case "webhook":
					validatedConfig = webhookConfigSchema.parse(config);
					break;
			}

			const testEvent = {
				id: crypto.randomUUID(),
				timestamp: new Date().toISOString(),
				eventType: "test.connection",
				eventCategory: "auth",
				actor: { type: "system" },
				context: {
					organizationId: ctx.context.payload.organizationId,
				},
				metadata: {
					message: "Test event from Better Auth Dashboard",
				},
			};

			try {
				switch (destinationType) {
					case "datadog": {
						const ddConfig = validatedConfig as {
							apiKey: string;
							site?: string;
							service?: string;
							source?: string;
							tags?: string[];
						};
						const site = ddConfig.site || "datadoghq.com";
						const url = `https://http-intake.logs.${site}/api/v2/logs`;

						const response = await fetch(url, {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								"DD-API-KEY": ddConfig.apiKey,
							},
							body: JSON.stringify([
								{
									ddsource: ddConfig.source || "better-auth",
									ddtags: [
										`organization:${ctx.context.payload.organizationId}`,
										`event_type:test.connection`,
										...(ddConfig.tags || []),
									].join(","),
									hostname: "better-auth",
									service: ddConfig.service || "authentication",
									message: "Test connection from Better Auth Dashboard",
									...testEvent,
								},
							]),
						});

						if (!response.ok) {
							const text = await response.text();
							throw new Error(
								`Datadog API error: ${response.status} - ${text}`,
							);
						}
						break;
					}
					case "splunk": {
						const splunkConfig = validatedConfig as {
							hecEndpoint: string;
							hecToken: string;
							index?: string;
							source?: string;
							sourcetype?: string;
						};

						const response = await fetch(splunkConfig.hecEndpoint, {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								Authorization: `Splunk ${splunkConfig.hecToken}`,
							},
							body: JSON.stringify({
								time: Math.floor(Date.now() / 1000),
								host: "better-auth",
								source: splunkConfig.source || "better-auth",
								sourcetype: splunkConfig.sourcetype || "better-auth:events",
								index: splunkConfig.index || "main",
								event: testEvent,
							}),
						});

						if (!response.ok) {
							const text = await response.text();
							throw new Error(`Splunk HEC error: ${response.status} - ${text}`);
						}
						break;
					}
					case "webhook": {
						const webhookConfig = validatedConfig as {
							url: string;
							headers?: Record<string, string>;
							method?: "POST" | "PUT";
						};

						const response = await fetch(webhookConfig.url, {
							method: webhookConfig.method || "POST",
							headers: {
								"Content-Type": "application/json",
								...webhookConfig.headers,
							},
							body: JSON.stringify(testEvent),
						});

						if (!response.ok) {
							const text = await response.text();
							throw new Error(`Webhook error: ${response.status} - ${text}`);
						}
						break;
					}
				}

				return { success: true };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
	);
};
