import {
	getCurrentGraphContext,
	getCurrentTransactionAdapter,
	APIError,
	betterAuth,
	invariant,
} from "better-auth";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, openAPI, twoFactor, anonymous, phoneNumber } from "better-auth/plugins";
import type { Member, Organization } from "better-auth/plugins";
import { apiKey } from "better-auth/plugins";
import { graph } from "better-auth/plugins";
import { lastLoginMethod } from "better-auth/plugins";
import { mcp } from "better-auth/plugins";
import { organization, assets, agents } from "better-auth/plugins";
import cuid from "cuid";
import bcrypt from "bcrypt";
import * as tables from "./db-schema.final";
// import { graph } from "./plugins/graph";
// import { getOrCreateInternalObject } from "./plugins/graph/core";
// import { subscriptions } from "./plugins/subscriptions";
// import { webhooks } from "./plugins/webhooks";
import { sendEmail } from "./utils/email";
import type { Connection } from "./db";

const tablePrefixes = {
	user: "usr",
	organization: "org",
	member: "mem",
	human: "hmn",
	agent: "agt",
	session: "ses",
	account: "acc",
	api_key: "key",
	subscription: "sub",
	relationship: "rel",
	team: "tm",
};

function generatePrefixedId(model: string) {
	let prefix = tablePrefixes[model as keyof typeof tablePrefixes] ?? model;
	return `${prefix}_${cuid()}`;
}

/**
 * Get or create a personal organization for a user
 * Personal organizations are named after the user and have a slug based on their user ID
 */
async function getOrCreatePersonalOrganization(
	userId: string,
	userName: string,
) {
	const adapter = await getCurrentTransactionAdapter();
	const graphAdapter = await getCurrentGraphContext();

	// Check if user already has a personal organization
	const existingMembers = await adapter.findMany<Member>({
		model: "member",
		where: [
			{
				field: "userId",
				value: userId,
			},
		],
	});

	for (const member of existingMembers) {
		// Check if this is a personal org (slug matches user pattern)
		const org = await adapter.findOne<Organization>({
			model: "organization",
			where: [
				{
					field: "id",
					value: member.organizationId,
				},
				{
					field: "slug",
					value: `user-${userId}`,
				},
			],
		});

		if (org) {
			return null;
		}
	}

	// Create personal organization
	const orgId = generatePrefixedId("organization");
	const orgSlug = `user-${userId}`;
	const orgName = `${userName}'s Personal Organization`;

	// Create organization in database
	const org = await adapter.create<Organization>({
		model: "organization",
		data: {
			name: orgName,
			slug: orgSlug,
			metadata: { type: "personal", userId },
			createdAt: new Date(),
		},
	});

	if (!org) {
		throw new Error("Failed to create personal organization");
	}

	// Create organization graph object first
	// await getOrCreateInternalObject("organization", orgId, {});

	let adminRoleId = `role_admin_${org.id}`;

	// Add user as owner of the organization
	await adapter.create<Member>({
		model: "member",
		data: {
			organizationId: org.id,
			userId: userId,
			createdAt: new Date(),
		},
	});

	// organization has admin role
	graphAdapter.addRelationship({
		subjectId: org.id,
		subjectType: "organization",
		relationshipType: "organization",
		objectId: adminRoleId,
		objectType: "organization_role",
	});

	// admin is one of the roles of organization
	graphAdapter.addRelationship({
		subjectId: adminRoleId,
		subjectType: "organization_role",
		relationshipType: "roles",
		objectId: org.id,
		objectType: "organization",
	});

	// organization has built-in admin role
	graphAdapter.addRelationship({
		subjectId: org.id,
		subjectType: "organization",
		relationshipType: "built_in_role",
		objectId: adminRoleId,
		objectType: "organization_role",
	});

	// users with admin role can manage the organization
	graphAdapter.addRelationship({
		subjectId: adminRoleId,
		subjectType: "organization_role",
		objectId: org.id,
		objectType: "organization",
		relationshipType: "org_manager",
		optionalRelation: "member",
	});

	// user has admin role
	graphAdapter.addRelationship({
		subjectId: userId,
		subjectType: "user",
		relationshipType: "has_role",
		objectId: adminRoleId,
		objectType: "organization_role",
	});

	return org;
}

export function createAuthSystem({ plugins, db, ...options }: {
	plugins?: BetterAuthPlugin[];
	db: Connection;
} & BetterAuthOptions): ReturnType<typeof betterAuth> {
	const auth = betterAuth({
		plugins: [
			admin({
				adminUserIds: ["user_cmhz0nka100003xv322cn6ffp"],
			}),
			anonymous(),
			phoneNumber(),
			apiKey(),
			organization({
				teams: { enabled: true },
				schema: {},
				sendInvitationEmail(data, request) {
					const url = new URL(
						`/auth/accept-invitation?invitationId=${data.invitation.id}`,
						request?.url,
					).href;
					return sendEmail({
						to: data.invitation.email,
						subject: "You are invited to join an organization",
						text: `Click the link to accept the invitation: ${url}`,
					});
				},
				organizationHooks: {
					beforeCreateOrganization: async (data) => {
						const graphAdapter = await getCurrentGraphContext();

						if (
							!(await graphAdapter.check(
								"user",
								data.user.id,
								"create_org",
								"platform",
								"default",
							))
						) {
							throw new APIError("UNAUTHORIZED", {
								message: "You are not authorized to create an organization",
							});
						}
						// return {
						//   data: {
						//     ...data.organization,
						//     name: data.organization.name + " (Auto-created)",
						//   },
						// }
					},
					afterCreateOrganization: async (data) => {
						// await getOrCreateInternalObject(
						// 	"organization",
						// 	data.organization.id,
						// 	{},
						// );
					},
					async beforeUpdateOrganization(data) {
						const graphAdapter = await getCurrentGraphContext();

						if (
							!(await graphAdapter.check(
								"user",
								data.user.id,
								"manage",
								"organization",
								data.organization.id,
							))
						) {
							throw new APIError("UNAUTHORIZED", {
								message: "You are not authorized to manage this organization",
							});
						}
					},
				},
			}),
			mcp({
				loginPage: "/sign-in", // path to your login page
			}),
			twoFactor(),
			// webhooks(),
			agents(),
			// subscriptions(),
			assets(),
			graph({
				authzed: process.env.AUTHZED_TOKEN
					? {
							token: process.env.AUTHZED_TOKEN,
							endpoint: process.env.AUTHZED_ENDPOINT,
						}
					: undefined,
				autoSync: process.env.AUTHZED_AUTO_SYNC !== "false",
			}),
			// bearer(),
			lastLoginMethod(),
			openAPI(),
			// myPlugin(),
			...(plugins ?? []),
		],
		account: {
			accountLinking: {
				enabled: true,
			},
		},
		session: {
			cookieCache: {
				enabled: true,
				maxAge: 300,
				refreshCache: {
					updateAge: 60,
				},
			},
		},
		trustedOrigins: ["http://localhost:3000"],
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			password: {
				hash: async (password) => {
					return await bcrypt.hash(password, 10);
				},
				verify: async ({ hash, password }) => {
					return await bcrypt.compare(password, hash);
				}
			},
			sendResetPassword: async ({ user, url, token }, request) => {
				await sendEmail({
					to: user.email,
					subject: "Reset your password",
					text: `Click the link to reset your password: ${url}`,
				});
			},
		},
		hooks: {},

		databaseHooks: {
			user: {
				create: {
					async before(user, options) {
						if (user.actorType === "agent") {
						} else {
							invariant(!!options?.context.adapter, "Adapter is required");
							if (!user.id) {
								user.id = generatePrefixedId("user");
							}
							const adapter = await getCurrentTransactionAdapter();
							const graphAdapter = await getCurrentGraphContext();

							const person = await adapter.create({
								model: "person",
								data: {
									name: user.name,
								},
								select: ["id"],
							});

							// await getOrCreateInternalObject("person", person.id, {});
							// await getOrCreateInternalObject("user", user.id, {});

							await graphAdapter.addRelationship({
								subjectId: person.id,
								subjectType: "person",
								objectId: user.id,
								objectType: "user",
								relationshipType: "person_profile",
							});

							if (!person) {
								throw new Error("Failed to create person");
							}

							user.actorType = "person";
							user.actorId = person.id;
						}

						return { data: user };
					},
					async after(user, context) {
						// Auto-create personal organization for person users
						if (user.actorType === "person" && user.id) {
							await getOrCreatePersonalOrganization(
								user.id,
								user.name || "User",
							);
						}
					},
				},
			},
		},
		user: {
			additionalFields: {
				actorType: {
					type: "string",
					defaultValue: "person",
				},
				actorId: {
					type: "string",
				},
				userMetadata: { 
					type: 'json', 
					required: false, 
					input: false, 
				}, 
				appMetadata: { 
					type: 'json', 
					required: false, 
					input: false, 
				}, 
				invitedAt: { 
					type: 'date', 
					required: false, 
					input: false, 
				}, 
				lastSignInAt: { 
					type: 'date', 
					required: false, 
					input: false, 
				}, 
			},
		},
		advanced: {
			database: {
				generateId: (options: { model: string; size?: number }) => {
					return generatePrefixedId(options.model);
				},
			},
		},
		emailVerification: {
			sendOnSignUp: true,
			async sendVerificationEmail(data, request) {
				await sendEmail({
					to: data.user.email,
					subject: "Verify your email",
					text: `Click the link to verify your email: ${data.url}`,
				});
			},
		},
		database: drizzleAdapter(db, {
			provider: "pg",
			schema: tables,
			usePlural: false,
			transaction: true,
			// debugLogs: true,
		}),
		experimental: {
			joins: true,
		},
		graph: {
			enabled: true,
		},
		...options,
	});
	return auth;
}
