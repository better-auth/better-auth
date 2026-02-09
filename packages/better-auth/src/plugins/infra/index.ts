import type { BetterAuthPlugin } from "better-auth";
import { APIError, logger } from "better-auth";
import { DASH_API_URL, DASH_KV_URL } from "./constants";
import { getInfraSchema } from "./schema";
import type { InfraOptions, InfraOptionsInternal } from "./types";

export type { DashOptions, InfraOptions } from "./types";

import { createAuthMiddleware } from "better-auth/api";
import type { OrganizationOptions } from "better-auth/plugins";
import {
	getLoginMethod,
	getTriggerInfo,
	initAccountEvents,
	initSessionEvents,
	initTrackEvents,
	initUserEvents,
	initVerificationEvents,
	routes,
	UNKNOWN_USER,
} from "./events";
import {
	initInvitationEvents,
	initMemberEvents,
	initOrganizationEvents,
	initTeamEvents,
} from "./events/organization";
import { getOrganizationTriggerInfo } from "./events/triggers";
import type { Identification } from "./identification";
import { createIdentificationService } from "./identification";
import { getConfig } from "./routes/config";
import {
	createOrganizationDirectory,
	deleteOrganizationDirectory,
	getDirectoryDetails,
	listOrganizationDirectories,
	regenerateDirectoryToken,
} from "./routes/directory-sync";
import { getEventTypes, getUserEvents } from "./routes/events";
import {
	acceptInvitation,
	checkUserExists,
	completeInvitation,
} from "./routes/invitations";
import {
	createOrganizationLogDrain,
	deleteOrganizationLogDrain,
	listOrganizationLogDrains,
	testOrganizationLogDrain,
	updateOrganizationLogDrain,
} from "./routes/org-log-drains";
import {
	addMember,
	addTeamMember,
	cancelInvitation,
	checkUserByEmail,
	createOrganization,
	createSsoProvider,
	createTeam,
	deleteOrganization,
	deleteSsoProvider,
	deleteTeam,
	getOrganization,
	getOrganizationOptions,
	inviteMember,
	listOrganizationInvitations,
	listOrganizationMembers,
	listOrganizationSsoProviders,
	listOrganizations,
	listOrganizationTeams,
	listTeamMembers,
	removeMember,
	removeTeamMember,
	requestSsoVerificationToken,
	resendInvitation,
	updateMemberRole,
	updateOrganization,
	updateTeam,
	verifySsoProviderDomain,
} from "./routes/organizations";
import {
	deleteSessions,
	listAllSessions,
	revokeAllSessions,
	revokeSession,
} from "./routes/sessions";
import {
	banUser,
	createUser,
	deleteUser,
	disableTwoFactor,
	enableTwoFactor,
	generateBackupCodes,
	getOnlineUsersCount,
	getUserDetails,
	getUserGraphData,
	getUserMapData,
	getUserOrganizations,
	getUserRetentionData,
	getUserStats,
	getUsers,
	impersonateUser,
	sendResetPasswordEmail,
	sendVerificationEmail,
	setPassword,
	unbanUser,
	unlinkAccount,
	updateUser,
	viewBackupCodes,
	viewTwoFactorTotpUri,
} from "./routes/users";
import { matchesAnyRoute } from "./routes-matcher";
import type { SecurityEvent } from "./security";
import { createSecurityClient } from "./security";
import type { SecurityCheckContext } from "./security-hooks";
import { runSecurityChecks, throwChallengeError } from "./security-hooks";
import { createEmailHooks } from "./validation/email";
import { phoneValidationHooks } from "./validation/phone";

// Email exports
export {
	createEmailSender,
	EMAIL_TEMPLATES,
	type EmailConfig,
	type EmailTemplateId,
	type EmailTemplateVariables,
	type SendEmailOptions,
	type SendEmailResult,
	sendEmail,
} from "./email";
export type { Identification, IPLocation } from "./identification";
export {
	CHALLENGE_TTL,
	DEFAULT_DIFFICULTY,
	decodePoWChallenge,
	encodePoWSolution,
	type PoWChallenge,
	type PoWSolution,
	solvePoWChallenge,
	verifyPoWSolution,
} from "./pow";
export type {
	CompromisedPasswordResult,
	CredentialStuffingResult,
	ImpossibleTravelResult,
	SecurityEvent,
	SecurityEventType,
	SecurityOptions,
	SecurityVerdict,
	StaleUserResult,
	ThresholdConfig,
} from "./security";

// SMS exports
export {
	createSMSSender,
	type SendSMSOptions,
	type SendSMSResult,
	SMS_TEMPLATES,
	type SMSConfig,
	type SMSTemplateId,
	type SMSTemplateVariables,
	sendSMS,
} from "./sms";

export const infra = (options?: InfraOptions) => {
	// Track contexts that have already been processed for bulk operations.
	// When revoking multiple sessions, the session.delete hook fires once per session.
	// This WeakSet ensures we only track the "all sessions revoked" event once per operation,
	// not once per deleted session.
	const processedBulkOperationContexts = new WeakSet();

	// Default interval: 5 minutes (300000 ms)
	const activityUpdateInterval =
		options?.activityTracking?.updateInterval ?? 300000;
	const opts = {
		apiUrl: options?.apiUrl || DASH_API_URL,
		kvUrl: options?.kvUrl || DASH_KV_URL,
		apiKey: options?.apiKey || process.env.BETTER_AUTH_API_KEY || "",
		activityTracking: {
			updateInterval: activityUpdateInterval,
		},
		...options,
	} satisfies InfraOptionsInternal;

	const { tracker } = initTrackEvents(opts);
	const identificationService = createIdentificationService(opts);
	type IpAddressConfig = {
		ipAddressHeaders?: string[];
		disableIpTracking?: boolean;
	};

	const getClientIpFromRequest = (
		request: Request | undefined,
		ipAddressHeaders?: string[] | null,
	): string | undefined => {
		if (!request) return undefined;
		const headers = ipAddressHeaders?.length
			? ipAddressHeaders
			: [
					"cf-connecting-ip",
					"x-forwarded-for",
					"x-real-ip",
					"x-vercel-forwarded-for",
				];

		for (const headerName of headers) {
			const value = request.headers.get(headerName);
			if (!value) continue;
			// x-forwarded-for style header can contain multiple IPs
			const ip = value.split(",")[0]?.trim();
			if (ip) return ip;
		}
		return undefined;
	};

	const getCountryCodeFromRequest = (
		request: Request | undefined,
	): string | undefined => {
		if (!request) return undefined;
		// Cloudflare provides this header at the edge
		const cc =
			request.headers.get("cf-ipcountry") ??
			request.headers.get("x-vercel-ip-country");
		return cc ? cc.toUpperCase() : undefined;
	};

	const getLocationDataFromCtx = async (
		request: Request | undefined,
		requestId: string | null,
		ctxIdentification?: Identification | null,
		ipConfig?: IpAddressConfig | null,
	): Promise<
		| {
				ipAddress?: string;
				city?: string;
				country?: string;
				countryCode?: string;
		  }
		| undefined
	> => {
		if (ipConfig?.disableIpTracking === true) return undefined;

		// Prefer durable-kv identification (most accurate: city + country name + code)
		if (requestId) {
			const identification =
				ctxIdentification ||
				(await identificationService.getIdentification(requestId));
			if (identification) {
				const location = identificationService.getLocation(identification);
				const locationData = {
					ipAddress: identification.ip || undefined,
					city: location?.city || undefined,
					country: location?.country?.name || undefined,
					countryCode: location?.country?.code || undefined,
				};
				return locationData;
			}
		}

		// Fallback for dashboard/admin routes that don't include X-Request-Id:
		// pass through IP (and countryCode if available) so the tracking API can geo-enrich.
		const ipAddress = getClientIpFromRequest(
			request,
			ipConfig?.ipAddressHeaders || null,
		);
		const countryCode = getCountryCodeFromRequest(request);
		if (ipAddress || countryCode) {
			return { ipAddress, countryCode };
		}

		return undefined;
	};

	// Security event logging callback
	const onSecurityEvent = (event: SecurityEvent) => {
		tracker.trackEvent({
			eventKey: event.visitorId || event.userId || "unknown",
			eventType: `security_${event.type}`,
			eventDisplayName: `Security: ${event.type.replace(/_/g, " ")}`,
			eventData: {
				type: event.type,
				userId: event.userId || undefined,
				visitorId: event.visitorId || undefined,
				action: event.action,
				...event.details,
			},
			// Location fields at top level for ClickHouse storage
			ipAddress: event.ip || undefined,
			country: event.country || undefined,
		});
	};

	const securityService = createSecurityClient(
		opts.apiUrl,
		opts.apiKey,
		opts.security || {},
		onSecurityEvent,
	);

	// Create email hooks with API-backed validation when API key is available
	const emailHooks = createEmailHooks({
		useApi: !!opts.apiKey,
		apiKey: opts.apiKey,
		apiUrl: opts.apiUrl,
		kvUrl: opts.kvUrl,
		defaultConfig: opts.security?.emailValidation,
		onDisposableEmail: (data) => {
			const isNoMxRecord = data.reason === "no_mx_records";
			const reason = isNoMxRecord ? "no_mx_records" : "disposable_email";
			const label = isNoMxRecord ? "No MX Records" : "Disposable Email";

			// Map action to event type and display names
			const actionLabel = data.action === "allow" ? "allowed" : "blocked";
			const actionVerb = data.action === "allow" ? "detected" : "blocked";
			const eventType =
				data.action === "allow" ? "security_allowed" : "security_blocked";

			const displayName = isNoMxRecord
				? `Security: invalid email domain ${actionVerb}`
				: `Security: disposable email ${actionVerb}`;
			const description = isNoMxRecord
				? `${actionVerb.charAt(0).toUpperCase() + actionVerb.slice(1)} signup attempt with invalid email domain (no MX records): ${data.email}`
				: `${actionVerb.charAt(0).toUpperCase() + actionVerb.slice(1)} signup attempt with disposable email: ${data.email} (${data.reason}, ${data.confidence} confidence)`;

			logger.info(
				`[Dash] Tracking ${reason} event for email: ${data.email} (action: ${actionLabel})`,
			);

			tracker.trackEvent({
				eventKey: data.email,
				eventType,
				eventDisplayName: displayName,
				eventData: {
					action: actionLabel,
					reason,
					identifier: data.email,
					detectionLabel: label,
					description,
					path: data.path,
				},
				ipAddress: data.ip,
			});
		},
	});

	const {
		trackUserSignedUp,
		trackUserProfileUpdated,
		trackUserProfileImageUpdated,
		trackUserEmailVerified,
		trackUserBanned,
		trackUserUnBanned,
		trackUserDeleted,
	} = initUserEvents(tracker);

	const {
		trackEmailVerificationSent,
		trackEmailSignInAttempt,
		trackUserSignedIn,
		trackUserSignedOut,
		trackSessionCreated,
		trackSocialSignInAttempt,
		trackSocialSignInRedirectionAttempt,
		trackUserImpersonated,
		trackUserImpersonationStop,
		trackSessionRevoked,
		trackSessionRevokedAll,
	} = initSessionEvents(tracker);

	const {
		trackAccountLinking,
		trackAccountUnlink,
		trackAccountPasswordChange,
	} = initAccountEvents(tracker);

	const { trackPasswordResetRequest, trackPasswordResetRequestCompletion } =
		initVerificationEvents(tracker);
	const { trackEvent } = tracker;

	const { trackOrganizationCreated, trackOrganizationUpdated } =
		initOrganizationEvents(tracker);

	const {
		trackOrganizationTeamCreated,
		trackOrganizationTeamUpdated,
		trackOrganizationTeamDeleted,
		trackOrganizationTeamMemberAdded,
		trackOrganizationTeamMemberRemoved,
	} = initTeamEvents(tracker);

	const {
		trackOrganizationMemberAdded,
		trackOrganizationMemberRemoved,
		trackOrganizationMemberRoleUpdated,
	} = initMemberEvents(tracker);

	const {
		trackOrganizationMemberInvited,
		trackOrganizationMemberInviteAccepted,
		trackOrganizationMemberInviteCanceled,
		trackOrganizationMemberInviteRejected,
	} = initInvitationEvents(tracker);

	return {
		id: "infra",
		init(ctx) {
			const organizationPlugin = ctx.options.plugins?.find(
				(p) => p.id === "organization",
			);

			if (organizationPlugin) {
				const instrumentOrganizationHooks = (
					organizationPluginOptions: OrganizationOptions,
				) => {
					const organizationHooks =
						(organizationPluginOptions.organizationHooks =
							organizationPluginOptions.organizationHooks ?? {});

					// Organization hooks

					const afterCreateOrganization =
						organizationHooks.afterCreateOrganization;
					organizationHooks.afterCreateOrganization = async (...args) => {
						const [{ organization, user }] = args;
						const trigger = getOrganizationTriggerInfo(user);
						trackOrganizationCreated(organization, trigger);
						if (afterCreateOrganization) {
							return afterCreateOrganization(...args);
						}
					};

					const afterUpdateOrganization =
						organizationHooks.afterUpdateOrganization;
					organizationHooks.afterUpdateOrganization = async (...args) => {
						const [{ organization, user }] = args;
						if (organization) {
							const trigger = getOrganizationTriggerInfo(user);
							trackOrganizationUpdated(organization, trigger);
						}
						if (afterUpdateOrganization) {
							return afterUpdateOrganization(...args);
						}
					};

					// Member hooks

					const afterAddMember = organizationHooks.afterAddMember;
					organizationHooks.afterAddMember = async (...args) => {
						const [{ organization, member, user }] = args;
						const trigger = getOrganizationTriggerInfo(user);
						trackOrganizationMemberAdded(organization, member, user, trigger);
						if (afterAddMember) {
							return afterAddMember(...args);
						}
					};
					const afterRemoveMember = organizationHooks.afterRemoveMember;
					organizationHooks.afterRemoveMember = async (...args) => {
						const [{ organization, member, user }] = args;
						const trigger = getOrganizationTriggerInfo(user);
						trackOrganizationMemberRemoved(organization, member, user, trigger);
						if (afterRemoveMember) {
							return afterRemoveMember(...args);
						}
					};

					const afterUpdateMemberRole = organizationHooks.afterUpdateMemberRole;
					organizationHooks.afterUpdateMemberRole = async (...args) => {
						const [{ organization, member, user, previousRole }] = args;
						const trigger = getOrganizationTriggerInfo(user);
						trackOrganizationMemberRoleUpdated(
							organization,
							member,
							user,
							previousRole,
							trigger,
						);
						if (afterUpdateMemberRole) {
							return afterUpdateMemberRole(...args);
						}
					};

					// Invitation hooks

					const afterCreateInvitation = organizationHooks.afterCreateInvitation;
					organizationHooks.afterCreateInvitation = async (...args) => {
						const [{ organization, invitation, inviter }] = args;
						const trigger = getOrganizationTriggerInfo(inviter);
						trackOrganizationMemberInvited(
							organization,
							invitation,
							inviter,
							trigger,
						);
						if (afterCreateInvitation) {
							return afterCreateInvitation(...args);
						}
					};

					const afterAcceptInvitation = organizationHooks.afterAcceptInvitation;
					organizationHooks.afterAcceptInvitation = async (...args) => {
						const [{ organization, invitation, member, user }] = args;
						const trigger = getOrganizationTriggerInfo(user);
						trackOrganizationMemberInviteAccepted(
							organization,
							invitation,
							member,
							user,
							trigger,
						);
						if (afterAcceptInvitation) {
							return afterAcceptInvitation(...args);
						}
					};

					const afterRejectInvitation = organizationHooks.afterRejectInvitation;
					organizationHooks.afterRejectInvitation = async (...args) => {
						const [{ organization, invitation, user }] = args;
						const trigger = getOrganizationTriggerInfo(user);
						trackOrganizationMemberInviteRejected(
							organization,
							invitation,
							user,
							trigger,
						);
						if (afterRejectInvitation) {
							return afterRejectInvitation(...args);
						}
					};

					const afterCancelInvitation = organizationHooks.afterCancelInvitation;
					organizationHooks.afterCancelInvitation = async (...args) => {
						const [{ organization, invitation, cancelledBy }] = args;
						const trigger = getOrganizationTriggerInfo(cancelledBy);
						trackOrganizationMemberInviteCanceled(
							organization,
							invitation,
							cancelledBy,
							trigger,
						);
						if (afterCancelInvitation) {
							return afterCancelInvitation(...args);
						}
					};

					// Team hooks

					const afterCreateTeam = organizationHooks.afterCreateTeam;
					organizationHooks.afterCreateTeam = async (...args) => {
						const [{ organization, team, user }] = args;
						const trigger = getOrganizationTriggerInfo(user);
						trackOrganizationTeamCreated(organization, team, trigger);
						if (afterCreateTeam) {
							return afterCreateTeam(...args);
						}
					};

					const afterUpdateTeam = organizationHooks.afterUpdateTeam;
					organizationHooks.afterUpdateTeam = async (...args) => {
						const [{ organization, team, user }] = args;
						if (team) {
							const trigger = getOrganizationTriggerInfo(user);
							trackOrganizationTeamUpdated(organization, team, trigger);
						}
						if (afterUpdateTeam) {
							return afterUpdateTeam(...args);
						}
					};

					const afterDeleteTeam = organizationHooks.afterDeleteTeam;
					organizationHooks.afterDeleteTeam = async (...args) => {
						const [{ organization, team, user }] = args;
						const trigger = getOrganizationTriggerInfo(user);
						trackOrganizationTeamDeleted(organization, team, trigger);
						if (afterDeleteTeam) {
							return afterDeleteTeam(...args);
						}
					};

					const afterAddTeamMember = organizationHooks.afterAddTeamMember;
					organizationHooks.afterAddTeamMember = async (...args) => {
						const [{ organization, team, user, teamMember }] = args;
						const trigger = getOrganizationTriggerInfo(user);
						trackOrganizationTeamMemberAdded(
							organization,
							team,
							user,
							teamMember,
							trigger,
						);
						if (afterAddTeamMember) {
							return afterAddTeamMember(...args);
						}
					};

					const afterRemoveTeamMember = organizationHooks.afterRemoveTeamMember;
					organizationHooks.afterRemoveTeamMember = async (...args) => {
						const [{ organization, team, user, teamMember }] = args;
						const trigger = getOrganizationTriggerInfo(user);
						trackOrganizationTeamMemberRemoved(
							organization,
							team,
							user,
							teamMember,
							trigger,
						);
						if (afterRemoveTeamMember) {
							return afterRemoveTeamMember(...args);
						}
					};
				};

				const organizationOptions = (organizationPlugin.options =
					organizationPlugin.options ?? {});
				instrumentOrganizationHooks(organizationOptions as OrganizationOptions);
			} else {
				logger.debug(
					"Organization plugin not active. Skipping instrumentation",
				);
			}

			return {
				options: {
					databaseHooks: {
						user: {
							create: {
								async before(user, ctx) {
									if (!ctx) return;

									// Free trial abuse detection
									const { visitorId } =
										identificationService.extractIdentificationHeaders(
											ctx.request,
										);

									if (visitorId && opts.security?.freeTrialAbuse?.enabled) {
										const abuseCheck =
											await securityService.checkFreeTrialAbuse(visitorId);

										if (abuseCheck.isAbuse && abuseCheck.action === "block") {
											throw new APIError("FORBIDDEN", {
												message:
													"Account creation is not allowed from this device.",
											});
										}
									}
								},
								async after(user, ctx) {
									if (!ctx) return;

									const trigger = getTriggerInfo(ctx, user.id);

									// Extract identification data for location tracking
									const { requestId, visitorId } =
										identificationService.extractIdentificationHeaders(
											ctx.request,
										);

									const ipConfig = (
										ctx.context.options.advanced as
											| { ipAddress?: IpAddressConfig }
											| undefined
									)?.ipAddress;

									const locationData = await getLocationDataFromCtx(
										ctx.request,
										requestId,
										ctx.context.identification as Identification | null,
										ipConfig,
									);

									// Track this signup for free trial abuse detection
									if (visitorId && opts.security?.freeTrialAbuse?.enabled) {
										await securityService.trackFreeTrialSignup(
											visitorId,
											user.id,
										);
									}

									trackUserSignedUp(user, trigger, locationData);
								},
							},
							update: {
								async after(user, ctx) {
									if (!ctx) return;

									const path = ctx.path;
									const trigger = getTriggerInfo(ctx, user.id);

									// Extract identification data for location tracking
									const { requestId } =
										identificationService.extractIdentificationHeaders(
											ctx.request,
										);

									const ipConfig = (
										ctx.context.options.advanced as
											| { ipAddress?: IpAddressConfig }
											| undefined
									)?.ipAddress;

									const locationData = await getLocationDataFromCtx(
										ctx.request,
										requestId,
										ctx.context.identification as Identification | null,
										ipConfig,
									);

									// Track profile updates (both user route and dashboard route)
									if (
										matchesAnyRoute(path, [
											routes.UPDATE_USER,
											routes.DASH_UPDATE_USER,
										])
									) {
										const updatedFields = Object.keys(ctx.body || {});
										const isOnlyImageUpdate =
											updatedFields.length === 1 &&
											updatedFields[0] === "image";
										const isOnlyEmailVerifiedUpdate =
											updatedFields.length === 1 &&
											updatedFields[0] === "emailVerified";
										const hasEmailVerifiedUpdate =
											updatedFields.includes("emailVerified");

										if (isOnlyEmailVerifiedUpdate && user.emailVerified) {
											// Only emailVerified was updated - track as email verified
											trackUserEmailVerified(user, trigger, locationData);
										} else if (isOnlyImageUpdate && user.image) {
											// Only image was updated - track as image update
											trackUserProfileImageUpdated(user, trigger, locationData);
										} else if (
											!isOnlyImageUpdate &&
											!isOnlyEmailVerifiedUpdate
										) {
											// Other fields updated - track as profile update
											trackUserProfileUpdated(user, trigger, ctx, locationData);
											// Also track email verified if it was part of the update
											if (hasEmailVerifiedUpdate && user.emailVerified) {
												trackUserEmailVerified(user, trigger, locationData);
											}
										}
									} else if (matchesAnyRoute(path, [routes.CHANGE_EMAIL])) {
										trackUserProfileUpdated(user, trigger, ctx, locationData);
									}

									// Track email verified (from verify email flow)
									if (
										matchesAnyRoute(path, [routes.VERIFY_EMAIL]) &&
										user.emailVerified
									) {
										trackUserEmailVerified(user, trigger, locationData);
									}

									// Track user banned
									if (
										matchesAnyRoute(path, [routes.ADMIN_BAN_USER]) &&
										"banned" in user &&
										user.banned
									) {
										trackUserBanned(user, trigger, locationData);
									}

									// Track user unbanned
									if (
										matchesAnyRoute(path, [routes.ADMIN_UNBAN_USER]) &&
										"banned" in user &&
										!user.banned
									) {
										trackUserUnBanned(user, trigger, locationData);
									}
								},
							},
							delete: {
								async after(user, ctx) {
									if (!ctx) return;

									const trigger = getTriggerInfo(ctx, user.id);

									// Extract identification data for location tracking
									const { requestId } =
										identificationService.extractIdentificationHeaders(
											ctx.request,
										);

									const ipConfig = (
										ctx.context.options.advanced as
											| { ipAddress?: IpAddressConfig }
											| undefined
									)?.ipAddress;

									const locationData = await getLocationDataFromCtx(
										ctx.request,
										requestId,
										ctx.context.identification as Identification | null,
										ipConfig,
									);

									// Track any user deleted
									trackUserDeleted(user, trigger, locationData);
								},
							},
						},
						session: {
							create: {
								async before(session, ctx) {
									if (!ctx) return;
									const loginMethod = getLoginMethod(ctx);

									// Try to get location from identification data first
									const { requestId, visitorId } =
										identificationService.extractIdentificationHeaders(
											ctx.request,
										);

									let identification: Identification | null = null;
									if (requestId) {
										identification =
											(ctx.context.identification as Identification | null) ||
											(await identificationService.getIdentification(
												requestId,
											));
									}
									const locationData = await getLocationDataFromCtx(
										ctx.request,
										requestId,
										ctx.context.identification as Identification | null,
									);

									// Impossible travel detection
									if (session.userId && identification?.location && visitorId) {
										const travelCheck =
											await securityService.checkImpossibleTravel(
												session.userId,
												identification.location,
												visitorId,
											);

										if (travelCheck?.isImpossible) {
											if (travelCheck.action === "block") {
												throw new APIError("FORBIDDEN", {
													message:
														"Login blocked due to suspicious location change.",
												});
											}

											if (
												travelCheck.action === "challenge" &&
												travelCheck.challenge
											) {
												throwChallengeError(
													travelCheck.challenge,
													"impossible_travel",
													"Unusual login location detected. Please complete a security check.",
												);
											}
										}
									}

									return {
										data: {
											loginMethod,
											city: locationData?.city,
											country:
												locationData?.countryCode ?? locationData?.country,
										},
									};
								},
								async after(session, ctx) {
									// Update user's last login fields
									if (!ctx || !session.userId) return;

									const _loginMethod = session.loginMethod || null;

									// Get identification for security features
									const { requestId, visitorId } =
										identificationService.extractIdentificationHeaders(
											ctx.request,
										);

									let identification: Identification | null = null;
									if (requestId) {
										identification =
											(ctx.context.identification as Identification | null) ||
											(await identificationService.getIdentification(
												requestId,
											));
									}

									// Get location data for event tracking
									const ipConfig = (
										ctx.context.options.advanced as
											| { ipAddress?: IpAddressConfig }
											| undefined
									)?.ipAddress;

									const locationData = await getLocationDataFromCtx(
										ctx.request,
										requestId,
										ctx.context.identification as Identification | null,
										ipConfig,
									);

									// Enrich session with location data for tracking
									const enrichedSession = {
										...session,
										ipAddress: locationData?.ipAddress,
										city: locationData?.city,
										country: locationData?.country,
										countryCode: locationData?.countryCode,
									};

									// Fetch user for security checks (unknown device + stale account)
									type UserForSecurityChecks = {
										email?: string;
										name?: string;
										lastActiveAt?: Date | string | null;
									} | null;
									let user: UserForSecurityChecks = null;
									try {
										user = (await ctx.context.adapter.findOne({
											model: "user",
											where: [{ field: "id", value: session.userId }],
										})) as UserForSecurityChecks;
									} catch {
										// Silently fail
									}

									// Unknown device notification
									if (visitorId) {
										const isNewDevice =
											await securityService.checkUnknownDevice(
												session.userId,
												visitorId,
											);

										if (isNewDevice && user?.email) {
											await securityService.notifyUnknownDevice(
												session.userId,
												user.email,
												identification,
											);
										}
									}

									// Stale account reactivation detection

									if (opts.security?.staleUsers?.enabled && user) {
										const staleCheck = await securityService.checkStaleUser(
											session.userId,
											user.lastActiveAt || null,
										);

										if (staleCheck.isStale) {
											const staleOpts = opts.security.staleUsers;
											const notificationPromises: Promise<void>[] = [];

											// Notify user if configured and not already notified recently
											if (staleCheck.notifyUser && user.email) {
												notificationPromises.push(
													securityService.notifyStaleAccountUser(
														user.email,
														user.name || null,
														staleCheck.daysSinceLastActive || 0,
														identification,
													),
												);
											}

											// Notify admin if configured and not already notified recently
											if (staleCheck.notifyAdmin && staleOpts.adminEmail) {
												notificationPromises.push(
													securityService.notifyStaleAccountAdmin(
														staleOpts.adminEmail,
														session.userId,
														user.email || "unknown",
														user.name || null,
														staleCheck.daysSinceLastActive || 0,
														identification,
													),
												);
											}

											// Send notifications in parallel without blocking login
											if (notificationPromises.length > 0) {
												Promise.all(notificationPromises).catch((error) => {
													logger.error(
														"[Dash] Failed to send stale account notifications:",
														error,
													);
												});
											}

											// Track the security event
											trackEvent({
												eventKey: session.userId,
												eventType: "security_stale_account",
												eventDisplayName: "Security: stale account reactivated",
												eventData: {
													action:
														staleCheck.action === "block"
															? "blocked"
															: staleCheck.action === "challenge"
																? "challenged"
																: "logged",
													reason: "stale_account_reactivation",
													userId: session.userId,
													daysSinceLastActive: staleCheck.daysSinceLastActive,
													staleDays: staleCheck.staleDays,
													lastActiveAt: staleCheck.lastActiveAt,
													notifyUser: staleCheck.notifyUser,
													notifyAdmin: staleCheck.notifyAdmin,
													detectionLabel: "Stale Account Reactivation",
													description: `Dormant account (inactive for ${staleCheck.daysSinceLastActive} days) became active`,
												},
												ipAddress: identification?.ip || undefined,
												city: identification?.location?.city || undefined,
												country:
													identification?.location?.country?.name || undefined,
												countryCode:
													identification?.location?.country?.code || undefined,
											});

											if (staleCheck.action === "block") {
												throw new APIError("FORBIDDEN", {
													message:
														"This account has been inactive for an extended period. Please contact support to reactivate.",
													code: "STALE_ACCOUNT",
												});
											}
										}
									}

									// Store location for impossible travel detection
									if (identification?.location) {
										await securityService.storeLastLocation(
											session.userId,
											identification.location,
										);
									}

									let trigger;

									// Track sign-in event (not for sign-up which creates user first)

									if (
										matchesAnyRoute(ctx.path, [
											routes.SIGN_IN,
											routes.SIGN_UP,
											routes.SIGN_IN_SOCIAL_CALLBACK,
											routes.SIGN_IN_OAUTH_CALLBACK,
										])
									) {
										trigger = getTriggerInfo(
											ctx,
											session.userId,
											enrichedSession,
										);
										trackUserSignedIn(
											enrichedSession,
											trigger,
											ctx,
											locationData,
										);
									} else {
										trigger = getTriggerInfo(ctx, session.userId);
									}

									// Track session created (regardless of sign-in method)

									trackSessionCreated(
										enrichedSession,
										trigger,
										ctx,
										locationData,
									);

									// Track session impersonation

									if ("impersonatedBy" in session && session.impersonatedBy) {
										trigger = {
											...trigger,
											triggeredBy: session.impersonatedBy as string,
										};
										trackUserImpersonated(
											enrichedSession,
											trigger,
											ctx,
											locationData,
										);
									}

									try {
										await ctx.context.adapter.update({
											model: "user",
											where: [{ field: "id", value: session.userId }],
											update: {
												lastActiveAt: new Date(),
											},
										});
									} catch {
										// Silently fail if fields don't exist yet (migration not run)
									}
								},
							},
							delete: {
								async after(session, ctx) {
									if (!ctx) return;

									const path = ctx.path;

									// Get location data for event tracking
									const { requestId } =
										identificationService.extractIdentificationHeaders(
											ctx.request,
										);

									const ipConfig = (
										ctx.context.options.advanced as
											| { ipAddress?: IpAddressConfig }
											| undefined
									)?.ipAddress;

									const locationData = await getLocationDataFromCtx(
										ctx.request,
										requestId,
										ctx.context.identification as Identification | null,
										ipConfig,
									);

									// Enrich session with location data for tracking
									const enrichedSession = {
										...session,
										ipAddress: locationData?.ipAddress,
										city: locationData?.city,
										country: locationData?.country,
										countryCode: locationData?.countryCode,
									};

									const trigger = getTriggerInfo(ctx, session.userId);

									// Check if this is a bulk operation (revoking multiple sessions)
									const isBulkOperation = matchesAnyRoute(ctx.path, [
										routes.REVOKE_ALL_SESSIONS,
										routes.ADMIN_REVOKE_USER_SESSIONS,
										routes.DASH_REVOKE_SESSIONS_ALL,
										routes.DASH_DELETE_SESSIONS,
										routes.DASH_BAN_USER,
									]);

									// Track bulk session revocation (only once per operation, not per session)
									if (isBulkOperation) {
										if (!processedBulkOperationContexts.has(ctx)) {
											trackSessionRevokedAll(
												enrichedSession,
												trigger,
												ctx,
												locationData,
											);
											processedBulkOperationContexts.add(ctx);
										}
										// Skip individual session tracking for bulk operations
									} else if (matchesAnyRoute(path, [routes.SIGN_OUT])) {
										// Track individual sign-out events
										trackUserSignedOut(
											enrichedSession,
											trigger,
											ctx,
											locationData,
										);
									} else {
										// Track individual session revocation
										trackSessionRevoked(
											enrichedSession,
											trigger,
											ctx,
											locationData,
										);
									}

									// Track user impersonation stopped
									if ("impersonatedBy" in session && session.impersonatedBy) {
										trackUserImpersonationStop(
											enrichedSession,
											trigger,
											ctx,
											locationData,
										);
									}
								},
							},
						},
						account: {
							create: {
								async after(account, ctx) {
									// Track OAuth account linking
									if (!ctx || !account.userId) return;

									const trigger = getTriggerInfo(ctx, account.userId);

									// Extract identification data for location tracking
									const { requestId } =
										identificationService.extractIdentificationHeaders(
											ctx.request,
										);

									const ipConfig = (
										ctx.context.options.advanced as
											| { ipAddress?: IpAddressConfig }
											| undefined
									)?.ipAddress;

									const locationData = await getLocationDataFromCtx(
										ctx.request,
										requestId,
										ctx.context.identification as Identification | null,
										ipConfig,
									);

									// Track account linking
									trackAccountLinking(account, trigger, ctx, locationData);
								},
							},
							update: {
								async after(account, ctx) {
									if (!ctx || !account.userId) return;

									const path = ctx.path;
									const trigger = getTriggerInfo(ctx, account.userId);

									// Extract identification data for location tracking
									const { requestId } =
										identificationService.extractIdentificationHeaders(
											ctx.request,
										);

									const ipConfig = (
										ctx.context.options.advanced as
											| { ipAddress?: IpAddressConfig }
											| undefined
									)?.ipAddress;

									const locationData = await getLocationDataFromCtx(
										ctx.request,
										requestId,
										ctx.context.identification as Identification | null,
										ipConfig,
									);

									// Track changes of password by user, via reset password by admin

									if (
										matchesAnyRoute(path, [
											routes.CHANGE_PASSWORD,
											routes.SET_PASSWORD,
											routes.RESET_PASSWORD,
											routes.ADMIN_SET_PASSWORD,
										])
									) {
										trackAccountPasswordChange(
											account,
											trigger,
											ctx,
											locationData,
										);
									}
								},
							},
							delete: {
								async after(account, ctx) {
									if (!ctx || !account.userId) return;

									const trigger = getTriggerInfo(ctx, account.userId);

									// Extract identification data for location tracking
									const { requestId } =
										identificationService.extractIdentificationHeaders(
											ctx.request,
										);

									const ipConfig = (
										ctx.context.options.advanced as
											| { ipAddress?: IpAddressConfig }
											| undefined
									)?.ipAddress;

									const locationData = await getLocationDataFromCtx(
										ctx.request,
										requestId,
										ctx.context.identification as Identification | null,
										ipConfig,
									);

									// Track account unlinking
									trackAccountUnlink(account, trigger, ctx, locationData);
								},
							},
						},
						verification: {
							create: {
								async after(verification, ctx) {
									if (!ctx) return;

									const path = ctx.path;
									const maybeUserId =
										ctx.context.session?.user.id ?? UNKNOWN_USER;
									const trigger = getTriggerInfo(ctx, maybeUserId);

									// Extract identification data for location tracking
									const { requestId } =
										identificationService.extractIdentificationHeaders(
											ctx.request,
										);

									const ipConfig = (
										ctx.context.options.advanced as
											| { ipAddress?: IpAddressConfig }
											| undefined
									)?.ipAddress;

									const locationData = await getLocationDataFromCtx(
										ctx.request,
										requestId,
										ctx.context.identification as Identification | null,
										ipConfig,
									);

									// Track password reset request
									if (matchesAnyRoute(path, [routes.REQUEST_PASSWORD_RESET])) {
										trackPasswordResetRequest(
											verification,
											trigger,
											ctx,
											locationData,
										);
									}
								},
							},
							delete: {
								async after(verification, ctx) {
									if (!ctx) return;

									const path = ctx.path;
									const maybeUserId =
										ctx.context.session?.user.id ?? UNKNOWN_USER;
									const trigger = getTriggerInfo(ctx, maybeUserId);

									// Extract identification data for location tracking
									const { requestId } =
										identificationService.extractIdentificationHeaders(
											ctx.request,
										);

									const ipConfig = (
										ctx.context.options.advanced as
											| { ipAddress?: IpAddressConfig }
											| undefined
									)?.ipAddress;

									const locationData = await getLocationDataFromCtx(
										ctx.request,
										requestId,
										ctx.context.identification as Identification | null,
										ipConfig,
									);

									// Track password reset complete
									if (matchesAnyRoute(path, [routes.RESET_PASSWORD])) {
										trackPasswordResetRequestCompletion(
											verification,
											trigger,
											ctx,
											locationData,
										);
									}
								},
							},
						},
					},
					session: {
						// Always store sessions in database
						storeSessionInDatabase:
							ctx.options.session?.storeSessionInDatabase ?? true,
					},
				},
			};
		},
		hooks: {
			before: [
				{
					matcher: () => true,
					handler: createAuthMiddleware(async (ctx) => {
						const { visitorId } =
							identificationService.extractIdentificationHeaders(ctx.request);
						const powSolution = ctx.headers?.get?.("X-PoW-Solution");

						if (visitorId && powSolution) {
							const verifyResult = await securityService.verifyPoWSolution(
								visitorId,
								powSolution,
							);
							if (verifyResult.valid) {
								ctx.context.powVerified = true;
							}
						}
					}),
				},
				...emailHooks.before,
				...phoneValidationHooks.before,
				{
					matcher: (ctx) => true,
					handler: createAuthMiddleware(async (ctx) => {
						// Security checks before processing auth requests
						const { requestId, visitorId } =
							identificationService.extractIdentificationHeaders(ctx.request);

						// Determine endpoint type - categorize by security risk level

						// Sign-in endpoints: credential stuffing, brute force targets
						const isSignIn = matchesAnyRoute(ctx.path, [
							routes.SIGN_IN_EMAIL,
							routes.SIGN_IN_USERNAME,
							routes.SIGN_IN_EMAIL_OTP,
							routes.SIGN_IN_SOCIAL,
							routes.SIGN_IN_PASSKEY,
							routes.SIGN_IN_MAGIC_LINK,
							routes.SIGN_IN_SSO,
							routes.SIGN_IN_ANONYMOUS,
						]);

						// Sign-up endpoints: bot account creation, free trial abuse
						const isSignUp = matchesAnyRoute(ctx.path, [routes.SIGN_UP_EMAIL]);

						// Password reset: email enumeration, spam
						const isPasswordReset = matchesAnyRoute(ctx.path, [
							routes.FORGET_PASSWORD,
							routes.REQUEST_PASSWORD_RESET,
						]);

						// Two-factor verification: code brute force
						const isTwoFactor = matchesAnyRoute(ctx.path, [
							routes.TWO_FACTOR_VERIFY_TOTP,
							routes.TWO_FACTOR_VERIFY_BACKUP,
							routes.TWO_FACTOR_VERIFY_OTP,
						]);

						// OTP endpoints: SMS/email spam (expensive!)
						const isOtpSend = matchesAnyRoute(ctx.path, [
							routes.EMAIL_OTP_SEND,
							routes.PHONE_SEND_OTP,
						]);

						// Magic link verification: token guessing
						const isMagicLinkVerify = matchesAnyRoute(ctx.path, [
							routes.MAGIC_LINK_VERIFY,
						]);

						// Organization creation: free trial abuse
						const isOrgCreate = matchesAnyRoute(ctx.path, [routes.ORG_CREATE]);

						// Sensitive account modifications (when authenticated)
						const isSensitiveAction = matchesAnyRoute(ctx.path, [
							routes.CHANGE_EMAIL,
							routes.CHANGE_PASSWORD,
							routes.SET_PASSWORD,
							routes.LINK_SOCIAL,
							routes.PASSKEY_ADD,
						]);

						// All endpoints that should trigger security checks
						const isSecurityProtectedEndpoint =
							isSignIn ||
							isSignUp ||
							isPasswordReset ||
							isTwoFactor ||
							isOtpSend ||
							isMagicLinkVerify ||
							isOrgCreate ||
							isSensitiveAction;

						if (!isSecurityProtectedEndpoint) return;

						// Extract identifier from request body for enhanced tracking
						const requestBody = ctx.body as
							| { email?: string; phone?: string; username?: string }
							| undefined;
						const identifier =
							requestBody?.email ||
							requestBody?.phone ||
							requestBody?.username ||
							undefined;

						let identification: Identification | null = null;
						if (requestId) {
							identification =
								await identificationService.getIdentification(requestId);
							if (identification) {
								ctx.context.identification = identification;
							}
						}

						// Use POW verification result from early hook (already verified, no need to re-verify)
						const powVerified = ctx.context.powVerified === true;
						if (visitorId && powVerified) {
							trackEvent({
								eventKey: visitorId,
								eventType: "security_allowed",
								eventDisplayName: "Security: challenge completed",
								eventData: {
									action: "allowed",
									reason: "pow_verified",
									visitorId,
									path: ctx.path,
									userAgent: ctx.headers?.get?.("user-agent") || "",
									identifier,
									detectionLabel: "Challenge Completed",
									description: identifier
										? `Successfully completed security challenge for "${identifier}"`
										: "Successfully completed security challenge",
								},
								ipAddress: identification?.ip || undefined,
								city: identification?.location?.city || undefined,
								country: identification?.location?.country?.name || undefined,
								countryCode:
									identification?.location?.country?.code || undefined,
							});
						}

						// Check if visitor is blocked (credential stuffing cooldown)
						if (visitorId) {
							const isBlocked = await securityService.isBlocked(visitorId);
							if (isBlocked) {
								// Log the blocked attempt
								trackEvent({
									eventKey: visitorId,
									eventType: "security_blocked",
									eventDisplayName: "Security: credential stuffing blocked",
									eventData: {
										action: "blocked",
										reason: "credential_stuffing",
										visitorId,
										path: ctx.path,
										userAgent: ctx.headers?.get?.("user-agent") || "",
										// Target identifier
										identifier,
										// Detection details
										detectionType: "cooldown_active",
										detectionLabel: "Credential Stuffing",
										description: identifier
											? `Visitor attempting "${identifier}" still in cooldown from prior detection`
											: "Visitor still in cooldown from prior detection",
										confidence: 1.0,
									},
									ipAddress: identification?.ip || undefined,
									city: identification?.location?.city || undefined,
									country: identification?.location?.country?.name || undefined,
									countryCode:
										identification?.location?.country?.code || undefined,
								});
								throw new APIError(403, {
									message: "Too many failed attempts. Please try again later.",
								});
							}
						}

						// Run consolidated security checks (geo, bot, VPN, proxy, Tor)
						// This uses the server-side checkSecurity API which handles all checks
						const securityCtx: SecurityCheckContext = {
							path: ctx.path,
							identifier,
							visitorId,
							identification,
							userAgent: ctx.headers?.get?.("user-agent") || "",
						};

						await runSecurityChecks(
							securityCtx,
							securityService,
							trackEvent,
							powVerified,
						);

						// Compromised password check for sign-up and password change routes
						const isPasswordRoute = matchesAnyRoute(ctx.path, [
							routes.SIGN_UP_EMAIL,
							routes.CHANGE_PASSWORD,
							routes.SET_PASSWORD,
							routes.RESET_PASSWORD,
						]);

						if (isPasswordRoute) {
							const body = ctx.body as
								| { password?: string; newPassword?: string }
								| undefined;
							const passwordToCheck = body?.newPassword || body?.password;

							if (passwordToCheck) {
								const compromisedResult =
									await securityService.checkCompromisedPassword(
										passwordToCheck,
									);

								if (compromisedResult.compromised && compromisedResult.action) {
									const action = compromisedResult.action;

									// Track the event
									trackEvent({
										eventKey: visitorId || identifier || "unknown",
										eventType:
											action === "block"
												? "security_blocked"
												: "security_challenged",
										eventDisplayName:
											action === "block"
												? "Security: breached password blocked"
												: "Security: breached password warning",
										eventData: {
											action: action === "block" ? "blocked" : "challenged",
											reason: "compromised_password",
											visitorId: visitorId || "",
											path: ctx.path,
											userAgent: ctx.headers?.get?.("user-agent") || "",
											identifier,
											breachCount: compromisedResult.breachCount,
											detectionLabel: "Breached Password",
											description: `Password has been seen in ${compromisedResult.breachCount?.toLocaleString() || "multiple"} data breaches`,
										},
										ipAddress: identification?.ip || undefined,
										city: identification?.location?.city || undefined,
										country:
											identification?.location?.country?.name || undefined,
										countryCode:
											identification?.location?.country?.code || undefined,
									});

									if (action === "block") {
										throw new APIError("BAD_REQUEST", {
											message:
												"This password has been found in data breaches. Please choose a different password.",
											code: "COMPROMISED_PASSWORD",
										});
									}
									// For 'challenge' or 'log' action, we just log the event and continue
								}
							}
						}
					}),
				},
			],
			after: [
				{
					matcher: () => true,
					handler: createAuthMiddleware(async (ctx) => {
						const maybeUserId = ctx.context.session?.user.id ?? UNKNOWN_USER;
						const trigger = getTriggerInfo(ctx, maybeUserId);

						// Extract identification headers for tracking
						const { visitorId } =
							identificationService.extractIdentificationHeaders(ctx.request);
						const identification = ctx.context.identification as
							| Identification
							| null
							| undefined;

						// Track email verification sent
						if (
							matchesAnyRoute(ctx.path, [routes.SEND_VERIFICATION_EMAIL]) &&
							ctx.context.session &&
							!(ctx.context.returned instanceof Error)
						) {
							trackEmailVerificationSent(
								ctx.context.session.session,
								ctx.context.session.user,
								trigger,
								ctx,
							);
						}

						// Track sign-in attempts (email credentials based)
						const body = ctx.body as
							| { email?: string; password?: string }
							| undefined;
						if (
							matchesAnyRoute(ctx.path, [
								routes.SIGN_IN_EMAIL,
								routes.SIGN_IN_EMAIL_OTP,
							]) &&
							ctx.context.returned instanceof Error &&
							body?.email
						) {
							trackEmailSignInAttempt(ctx, trigger);

							// Credential stuffing detection - track failed attempt
							if (visitorId && body?.password) {
								const stuffingResult = await securityService.trackFailedAttempt(
									body.email,
									visitorId,
									body.password,
									identification?.ip || null,
								);

								// Build descriptive message based on detection type
								const details = stuffingResult.details as
									| {
											identifier?: string;
											attemptCount?: number;
											windowSeconds?: number;
											attemptsPerMinute?: number;
											uniquePasswords?: number;
											targetedAccounts?: number;
											relatedIps?: string[];
									  }
									| undefined;
								const descriptions: Record<string, string> = {
									unique_passwords: `Tried ${details?.uniquePasswords || details?.attemptCount} different passwords on account "${details?.identifier}"`,
									same_password_many_accounts: `Same password attempted across ${details?.targetedAccounts} different accounts`,
									ip_targeting: `IP targeting ${details?.targetedAccounts} different accounts`,
									distributed_attack: `${details?.relatedIps?.length || 0} IPs targeting "${details?.identifier}" with ${details?.attemptCount} attempts`,
								};

								// Handle challenge case - this will be picked up on the next request
								if (
									stuffingResult.challenged &&
									stuffingResult.challenge &&
									details
								) {
									trackEvent({
										eventKey: visitorId,
										eventType: "security_challenged",
										eventDisplayName: "Security: credential stuffing challenge",
										eventData: {
											action: "challenged",
											reason: "credential_stuffing",
											visitorId,
											path: ctx.path,
											userAgent: ctx.headers?.get?.("user-agent") || "",
											identifier: details.identifier,
											detectionType: stuffingResult.reason,
											detectionLabel: "Credential Stuffing",
											description:
												descriptions[
													stuffingResult.reason || "unique_passwords"
												],
											attemptCount: details.attemptCount,
											windowSeconds: details.windowSeconds,
											attemptsPerMinute:
												Math.round((details.attemptsPerMinute || 0) * 100) /
												100,
											uniquePasswords: details.uniquePasswords,
											targetedAccounts: details.targetedAccounts,
											relatedIps: details.relatedIps,
										},
										ipAddress: identification?.ip || undefined,
										city: identification?.location?.city || undefined,
										country:
											identification?.location?.country?.name || undefined,
										countryCode:
											identification?.location?.country?.code || undefined,
									});

									// Note: We don't throw here because this is in the "after" hook
									// The challenge will be enforced on the next request when the
									// visitor retries their login attempt
								}

								// Track event when credential stuffing threshold is exceeded (block)
								if (stuffingResult.blocked && details) {
									trackEvent({
										eventKey: visitorId,
										eventType: "security_blocked",
										eventDisplayName: "Security: credential stuffing blocked",
										eventData: {
											action: "blocked",
											reason: "credential_stuffing",
											visitorId,
											path: ctx.path,
											userAgent: ctx.headers?.get?.("user-agent") || "",
											// Target identifier (email/phone being attacked)
											identifier: details.identifier,
											// Detection details
											detectionType: stuffingResult.reason,
											detectionLabel: "Credential Stuffing",
											description:
												descriptions[
													stuffingResult.reason || "unique_passwords"
												],
											// Attack metrics
											attemptCount: details.attemptCount,
											windowSeconds: details.windowSeconds,
											attemptsPerMinute:
												Math.round((details.attemptsPerMinute || 0) * 100) /
												100,
											uniquePasswords: details.uniquePasswords,
											targetedAccounts: details.targetedAccounts,
											relatedIps: details.relatedIps,
										},
										ipAddress: identification?.ip || undefined,
										city: identification?.location?.city || undefined,
										country:
											identification?.location?.country?.name || undefined,
										countryCode:
											identification?.location?.country?.code || undefined,
									});
								}
							}
						}

						// Clear failed attempts on successful email sign-in
						if (
							matchesAnyRoute(ctx.path, [
								routes.SIGN_IN_EMAIL,
								routes.SIGN_IN_EMAIL_OTP,
							]) &&
							!(ctx.context.returned instanceof Error) &&
							body?.email
						) {
							await securityService.clearFailedAttempts(body.email);
						}

						// Track sign-in attempts (social based with id token)
						if (
							matchesAnyRoute(ctx.path, [routes.SIGN_IN_SOCIAL]) &&
							ctx.context.returned instanceof Error &&
							ctx.body.provider &&
							ctx.body.idToken
						) {
							trackSocialSignInAttempt(ctx, trigger);
						}

						// Track sign-in attempts (social based with redirection)
						if (
							matchesAnyRoute(ctx.path, [routes.SIGN_IN_SOCIAL_CALLBACK]) &&
							ctx.context.returned instanceof Error
						) {
							trackSocialSignInRedirectionAttempt(ctx, trigger);
						}
					}),
				},
				{
					handler: createAuthMiddleware(async (ctx) => {
						if (activityUpdateInterval === 0) return;

						const session = ctx.context.session || ctx.context.newSession;
						if (!session?.user?.id) return;

						const userId = session.user.id;
						const now = Date.now();
						const lastUpdate = session.user.lastActiveAt;

						// Check if we should update (either first time or interval passed)
						if (lastUpdate) {
							const lastUpdateTs = new Date(lastUpdate).getTime();
							if (now - lastUpdateTs < activityUpdateInterval) {
								return; // Skip, updated recently
							}
						}

						// Update lastActiveAt in the database (fire and forget)
						ctx.context.adapter.update({
							model: "user",
							where: [{ field: "id", value: userId }],
							update: {
								lastActiveAt: new Date(),
							},
						});
					}),
					matcher: (ctx) => true,
				},
			],
		},
		endpoints: {
			getDashConfig: getConfig(opts),
			getDashUsers: getUsers(opts),
			getOnlineUsersCount: getOnlineUsersCount(opts),
			createDashUser: createUser(opts),
			deleteDashUser: deleteUser(opts),
			listDashOrganizations: listOrganizations(opts),
			getDashOrganization: getOrganization(opts),
			listDashOrganizationMembers: listOrganizationMembers(opts),
			listDashOrganizationInvitations: listOrganizationInvitations(opts),
			listDashOrganizationTeams: listOrganizationTeams(opts),
			listDashOrganizationSsoProviders: listOrganizationSsoProviders(opts),
			createDashSsoProvider: createSsoProvider(opts),
			requestDashSsoVerificationToken: requestSsoVerificationToken(opts),
			verifyDashSsoProviderDomain: verifySsoProviderDomain(opts),
			deleteDashSsoProvider: deleteSsoProvider(opts),
			listDashTeamMembers: listTeamMembers(opts),
			createDashOrganization: createOrganization(opts),
			deleteDashOrganization: deleteOrganization(opts),
			getDashOrganizationOptions: getOrganizationOptions(opts),
			deleteDashSessions: deleteSessions(opts),
			getDashUser: getUserDetails(opts),
			getDashUserOrganizations: getUserOrganizations(opts),
			updateDashUser: updateUser(opts),
			setDashPassword: setPassword(opts),
			unlinkDashAccount: unlinkAccount(opts),
			listAllDashSessions: listAllSessions(opts),
			dashRevokeSession: revokeSession(opts),
			dashRevokeAllSessions: revokeAllSessions(opts),
			dashImpersonateUser: impersonateUser(opts),
			updateDashOrganization: updateOrganization(opts),
			createDashTeam: createTeam(opts),
			updateDashTeam: updateTeam(opts),
			deleteDashTeam: deleteTeam(opts),
			addDashTeamMember: addTeamMember(opts),
			removeDashTeamMember: removeTeamMember(opts),
			addDashMember: addMember(opts),
			removeDashMember: removeMember(opts),
			updateDashMemberRole: updateMemberRole(opts),
			inviteDashMember: inviteMember(opts),
			cancelDashInvitation: cancelInvitation(opts),
			resendDashInvitation: resendInvitation(opts),
			dashCheckUserByEmail: checkUserByEmail(opts),
			dashGetUserStats: getUserStats(opts),
			dashGetUserGraphData: getUserGraphData(opts),
			dashGetUserRetentionData: getUserRetentionData(opts),
			dashGetUserMapData: getUserMapData(opts),
			dashBanUser: banUser(opts, (user, banReason, banExpires, location) => {
				trackUserBanned(
					{
						...user,
						banned: true,
						banReason: banReason || null,
						banExpires: banExpires ? new Date(banExpires) : null,
					},
					{ triggeredBy: "dash", triggerContext: "admin" },
					location,
				);
			}),
			dashUnbanUser: unbanUser(opts, (user, location) => {
				trackUserUnBanned(
					{ ...user, banned: false },
					{ triggeredBy: "dash", triggerContext: "admin" },
					location,
				);
			}),
			dashSendVerificationEmail: sendVerificationEmail(opts),
			dashSendResetPasswordEmail: sendResetPasswordEmail(opts),
			// Two-Factor Authentication Management
			dashEnableTwoFactor: enableTwoFactor(opts),
			dashViewTwoFactorTotpUri: viewTwoFactorTotpUri(opts),
			dashViewBackupCodes: viewBackupCodes(opts),
			dashDisableTwoFactor: disableTwoFactor(opts),
			dashGenerateBackupCodes: generateBackupCodes(opts),
			// User Events / Audit Log (for end-users to view their own activity)
			getUserEvents: getUserEvents(opts),
			getEventTypes: getEventTypes(opts),
			// Project Invitations (invite users to the auth system)
			dashAcceptInvitation: acceptInvitation(opts),
			dashCompleteInvitation: completeInvitation(opts),
			dashCheckUserExists: checkUserExists(opts),
			// Organization Log Drains
			listDashOrganizationLogDrains: listOrganizationLogDrains(opts),
			createDashOrganizationLogDrain: createOrganizationLogDrain(opts),
			updateDashOrganizationLogDrain: updateOrganizationLogDrain(opts),
			deleteDashOrganizationLogDrain: deleteOrganizationLogDrain(opts),
			testDashOrganizationLogDrain: testOrganizationLogDrain(opts),
			// Organization Directory Sync (SCIM)
			listDashOrganizationDirectories: listOrganizationDirectories(opts),
			createDashOrganizationDirectory: createOrganizationDirectory(opts),
			deleteDashOrganizationDirectory: deleteOrganizationDirectory(opts),
			regenerateDashDirectoryToken: regenerateDirectoryToken(opts),
			getDashDirectoryDetails: getDirectoryDetails(opts),
		},
		schema: getInfraSchema(),
	} satisfies BetterAuthPlugin;
};

// Keep dash as an alias for backward compatibility
export const dash = infra;

export * from "better-call";

// Event types for end-user consumption (audit logs)
export {
	type EventLocation,
	USER_EVENT_TYPES,
	type UserEvent,
	type UserEventsResponse,
	type UserEventType,
} from "./routes/events";
