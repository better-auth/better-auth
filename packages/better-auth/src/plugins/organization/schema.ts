import * as z from "zod";
import { generateId } from "../../utils";
import type { OrganizationOptions } from "./types";
import type { InferAdditionalFieldsFromPluginOptions } from "../../db";
import type { Prettify } from "better-call";

// TODO: we need a better way to define plugin schema and endpoints
export type OrganizationSchema<O extends OrganizationOptions> =
	O["dynamicAccessControl"] extends { enabled: true }
		? {
				organizationRole: {
					modelName: O["schema"] extends {
						organizationRole: { modelName: infer M };
					}
						? M extends string
							? M
							: string | undefined
						: string | undefined;
					fields: {
						organizationId: {
							type: "string";
							required: true;
							references: {
								model: "organization";
								field: "id";
							};
							fieldName?: O["schema"] extends {
								organizationRole: {
									fields: { organizationId: infer F };
								};
							}
								? F extends string
									? F
									: string | undefined
								: string | undefined;
						};
						role: {
							type: "string";
							required: true;
							fieldName?: O["schema"] extends {
								organizationRole: {
									fields: { role: infer F };
								};
							}
								? F extends string
									? F
									: string | undefined
								: string | undefined;
						};
						permission: {
							type: "string";
							required: true;
							fieldName?: O["schema"] extends {
								organizationRole: {
									fields: { permission: infer F };
								};
							}
								? F extends string
									? F
									: string | undefined
								: string | undefined;
						};
						createdAt: {
							type: "date";
							required: true;
							defaultValue: Date;
							fieldName?: O["schema"] extends {
								organizationRole: {
									fields: { createdAt: infer F };
								};
							}
								? F extends string
									? F
									: string | undefined
								: string | undefined;
						};
						updatedAt: {
							type: "date";
							required: false;
							fieldName?: O["schema"] extends {
								organizationRole: {
									fields: { updatedAt: infer F };
								};
							}
								? F extends string
									? F
									: string | undefined
								: string | undefined;
						};
					} & (O["schema"] extends {
						organizationRole: { additionalFields: infer F };
					}
						? F
						: {});
				};
			}
		: {} & (O["teams"] extends { enabled: true }
				? {
						team: {
							modelName: O["schema"] extends { team: { modelName: infer M } }
								? M extends string
									? M
									: string | undefined
								: string | undefined;
							fields: {
								name: {
									type: "string";
									required: true;
									fieldName?: O["schema"] extends {
										team: { fields: { name: infer F } };
									}
										? F extends string
											? F
											: string | undefined
										: string | undefined;
								};
								organizationId: {
									type: "string";
									required: true;
									references: {
										model: "organization";
										field: "id";
									};
									fieldName?: O["schema"] extends {
										team: { fields: { organizationId: infer F } };
									}
										? F extends string
											? F
											: string | undefined
										: string | undefined;
								};
								createdAt: {
									type: "date";
									required: true;
									fieldName?: O["schema"] extends {
										team: { fields: { createdAt: infer F } };
									}
										? F extends string
											? F
											: string | undefined
										: string | undefined;
								};
								updatedAt: {
									type: "date";
									required: false;
									fieldName?: O["schema"] extends {
										team: { fields: { updatedAt: infer F } };
									}
										? F extends string
											? F
											: string | undefined
										: string | undefined;
								};
							} & (O["schema"] extends { team: { additionalFields: infer F } }
								? F
								: {});
						};
						teamMember: {
							modelName: O["schema"] extends {
								teamMember: { modelName: infer M };
							}
								? M extends string
									? M
									: string | undefined
								: string | undefined;
							fields: {
								teamId: {
									type: "string";
									required: true;
									references: {
										model: "team";
										field: "id";
									};
									fieldName?: O["schema"] extends {
										teamMember: { fields: { teamId: infer F } };
									}
										? F extends string
											? F
											: string | undefined
										: string | undefined;
								};
								userId: {
									type: "string";
									required: true;
									references: {
										model: "user";
										field: "id";
									};
									fieldName?: O["schema"] extends {
										teamMember: { fields: { userId: infer F } };
									}
										? F extends string
											? F
											: string | undefined
										: string | undefined;
								};
								createdAt: {
									type: "date";
									required: false;
									fieldName?: O["schema"] extends {
										teamMember: { fields: { createdAt: infer F } };
									}
										? F extends string
											? F
											: string | undefined
										: string | undefined;
								};
							};
						};
					}
				: {}) & {
					organization: {
						modelName: O["schema"] extends {
							organization: { modelName: infer M };
						}
							? M extends string
								? M
								: string | undefined
							: string | undefined;
						fields: {
							name: {
								type: "string";
								required: true;
								sortable: true;
								fieldName?: O["schema"] extends {
									organization: { fields: { name: infer F } };
								}
									? F extends string
										? F
										: string | undefined
									: string | undefined;
							};
							slug: {
								type: "string";
								required: true;
								unique: true;
								sortable: true;
								fieldName?: O["schema"] extends {
									organization: { fields: { slug: infer F } };
								}
									? F extends string
										? F
										: string | undefined
									: string | undefined;
							};
							logo: {
								type: "string";
								required: false;
								fieldName?: O["schema"] extends {
									organization: { fields: { logo: infer F } };
								}
									? F extends string
										? F
										: string | undefined
									: string | undefined;
							};
							createdAt: {
								type: "date";
								required: true;
								fieldName?: O["schema"] extends {
									organization: { fields: { createdAt: infer F } };
								}
									? F extends string
										? F
										: string | undefined
									: string | undefined;
							};
							updatedAt: {
								type: "date";
								required: false;
								fieldName?: O["schema"] extends {
									organization: { fields: { updatedAt: infer F } };
								}
									? F extends string
										? F
										: string | undefined
									: string | undefined;
							};
						};
					};
					member: {
						modelName: O["schema"] extends { member: { modelName: infer M } }
							? M extends string
								? M
								: string | undefined
							: string | undefined;
						fields: {
							organizationId: {
								type: "string";
								required: true;
								references: {
									model: "organization";
									field: "id";
								};
								fieldName?: O["schema"] extends {
									member: { fields: { organizationId: infer F } };
								}
									? F extends string
										? F
										: string | undefined
									: string | undefined;
							};
							userId: {
								type: "string";
								required: true;
								references: {
									model: "user";
									field: "id";
								};
								fieldName?: O["schema"] extends {
									member: { fields: { userId: infer F } };
								}
									? F extends string
										? F
										: string | undefined
									: string | undefined;
							};
							role: {
								type: "string";
								required: true;
								fieldName?: O["schema"] extends {
									member: { fields: { role: infer F } };
								}
									? F extends string
										? F
										: string | undefined
									: string | undefined;
								defaultValue: "member";
							};
							createdAt: {
								type: "date";
								required: true;
								fieldName?: O["schema"] extends {
									member: { fields: { createdAt: infer F } };
								}
									? F extends string
										? F
										: string | undefined
									: string | undefined;
							};
						} & (O["schema"] extends { member: { additionalFields: infer F } }
							? F
							: {});
					};
					invitation: {
						modelName: O["schema"] extends {
							invitation: { modelName: infer M };
						}
							? M
							: string | undefined;
						fields: {
							organizationId: {
								type: "string";
								required: true;
								references: {
									model: "organization";
									field: "id";
								};
								fieldName?: O["schema"] extends {
									invitation: { fields: { organizationId: infer F } };
								}
									? F extends string
										? F
										: string | undefined
									: string | undefined;
							};
							email: {
								type: "string";
								required: true;
								sortable: true;
								fieldName?: O["schema"] extends {
									invitation: { fields: { email: infer F } };
								}
									? F extends string
										? F
										: string | undefined
									: string | undefined;
							};
							role: {
								type: "string";
								required: true;
								sortable: true;
								fieldName?: O["schema"] extends {
									invitation: { fields: { role: infer F } };
								}
									? F extends string
										? F
										: string | undefined
									: string | undefined;
							};
							status: {
								type: "string";
								required: true;
								sortable: true;
								fieldName?: O["schema"] extends {
									invitation: { fields: { status: infer F } };
								}
									? F extends string
										? F
										: string | undefined
									: string | undefined;
								defaultValue: "pending";
							};
							expiresAt: {
								type: "date";
								required: false;
								fieldName?: O["schema"] extends {
									invitation: { fields: { expiresAt: infer F } };
								}
									? F extends string
										? F
										: string | undefined
									: string | undefined;
							};
							createdAt: {
								type: "date";
								required: true;
								fieldName?: O["schema"] extends {
									invitation: { fields: { createdAt: infer F } };
								}
									? F extends string
										? F
										: string | undefined
									: string | undefined;
								defaultValue: Date;
							};
							inviterId: {
								type: "string";
								required: true;
								references: {
									model: "user";
									field: "id";
								};
								fieldName?: O["schema"] extends {
									invitation: { fields: { inviterId: infer F } };
								}
									? F extends string
										? F
										: string | undefined
									: string | undefined;
							};
						} & (O["schema"] extends {
							invitation: { additionalFields: infer F };
						}
							? F
							: {}) &
							O extends { teams: { enabled: true } }
							? {
									teamId: {
										type: "string";
										required: false;
										sortable: true;
										fieldName?: O["schema"] extends {
											invitation: { fields: { teamId: infer F } };
										}
											? F extends string
												? F
												: string | undefined
											: string | undefined;
									};
								}
							: {};
					};
					session: {
						fields: {
							activeOrganizationId: {
								type: "string";
								required: false;
								fieldName?: O["schema"] extends {
									session: { fields: { activeOrganizationId: infer F } };
								}
									? F extends string
										? F
										: string | undefined
									: string | undefined;
							};
						} & O["teams"] extends { enabled: true }
							? {
									activeTeamId: {
										type: "string";
										required: false;
									};
									activeOrganizationId: {
										type: "string";
										required: false;
										fieldName?: O["schema"] extends {
											session: { fields: { activeOrganizationId: infer F } };
										}
											? F extends string
												? F
												: string | undefined
											: string | undefined;
									};
								}
							: {
									activeOrganizationId: {
										type: "string";
										required: false;
										fieldName?: O["schema"] extends {
											session: { fields: { activeOrganizationId: infer F } };
										}
											? F extends string
												? F
												: string | undefined
											: string | undefined;
									};
								} & (O["schema"] extends {
									session: { additionalFields: infer F };
								}
									? F extends string
										? F
										: string | undefined
									: {});
					};
				};

export const role = z.string();
export const invitationStatus = z
	.enum(["pending", "accepted", "rejected", "canceled"])
	.default("pending");

export const organizationSchema = z.object({
	id: z.string().default(generateId),
	name: z.string(),
	slug: z.string(),
	logo: z.string().nullish().optional(),
	metadata: z
		.record(z.string(), z.unknown())
		.or(z.string().transform((v) => JSON.parse(v)))
		.optional(),
	createdAt: z.date(),
});

export const memberSchema = z.object({
	id: z.string().default(generateId),
	organizationId: z.string(),
	userId: z.coerce.string(),
	role,
	createdAt: z.date().default(() => new Date()),
});

export const invitationSchema = z.object({
	id: z.string().default(generateId),
	organizationId: z.string(),
	email: z.string(),
	role,
	status: invitationStatus,
	teamId: z.string().nullish(),
	inviterId: z.string(),
	expiresAt: z.date(),
	createdAt: z.date().default(() => new Date()),
});

export const teamSchema = z.object({
	id: z.string().default(generateId),
	name: z.string().min(1),
	organizationId: z.string(),
	createdAt: z.date(),
	updatedAt: z.date().optional(),
});

export const teamMemberSchema = z.object({
	id: z.string().default(generateId),
	teamId: z.string(),
	userId: z.string(),
	createdAt: z.date().default(() => new Date()),
});

export const organizationRoleSchema = z.object({
	id: z.string().default(generateId),
	organizationId: z.string(),
	role: z.string(),
	permission: z.record(z.string(), z.array(z.string())),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().optional(),
});

export type Organization = z.infer<typeof organizationSchema>;
export type Member = z.infer<typeof memberSchema>;
export type TeamMember = z.infer<typeof teamMemberSchema>;
export type Team = z.infer<typeof teamSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type InvitationInput = z.input<typeof invitationSchema>;
export type MemberInput = z.input<typeof memberSchema>;
export type TeamMemberInput = z.input<typeof teamMemberSchema>;
export type OrganizationInput = z.input<typeof organizationSchema>;
export type TeamInput = z.infer<typeof teamSchema>;
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

const defaultRoles = ["admin", "member", "owner"] as const;
export const defaultRolesSchema = z.union([
	z.enum(defaultRoles),
	z.array(z.enum(defaultRoles)),
]);

type CustomRolesSchema<O> = O extends { roles: { [key: string]: any } }
	? z.ZodType<keyof O["roles"] | Array<keyof O["roles"]>>
	: typeof defaultRolesSchema;

export type InferOrganizationZodRolesFromOption<
	O extends OrganizationOptions | undefined,
> = CustomRolesSchema<O>;

export type InferOrganizationRolesFromOption<
	O extends OrganizationOptions | undefined,
> = O extends { roles: any } ? keyof O["roles"] : "admin" | "member" | "owner";

export type InvitationStatus = "pending" | "accepted" | "rejected" | "canceled";

export type InferMember<O extends OrganizationOptions> = O["teams"] extends {
	enabled: true;
}
	? {
			id: string;
			organizationId: string;
			role: InferOrganizationRolesFromOption<O>;
			createdAt: Date;
			userId: string;
			teamId?: string;
			user: {
				email: string;
				name: string;
				image?: string;
			};
		}
	: {
			id: string;
			organizationId: string;
			role: InferOrganizationRolesFromOption<O>;
			createdAt: Date;
			userId: string;
			user: {
				email: string;
				name: string;
				image?: string;
			};
		};

export type InferOrganization<
	O extends OrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	Organization &
		InferAdditionalFieldsFromPluginOptions<"organization", O, isClientSide>
>;

export type InferTeam<O extends OrganizationOptions> = Prettify<
	Team & InferAdditionalFieldsFromPluginOptions<"team", O>
>;

export type InferInvitation<O extends OrganizationOptions> =
	(O["teams"] extends {
		enabled: true;
	}
		? {
				id: string;
				organizationId: string;
				email: string;
				role: InferOrganizationRolesFromOption<O>;
				status: InvitationStatus;
				inviterId: string;
				expiresAt: Date;
				createdAt: Date;
				teamId?: string;
			}
		: {
				id: string;
				organizationId: string;
				email: string;
				role: InferOrganizationRolesFromOption<O>;
				status: InvitationStatus;
				inviterId: string;
				expiresAt: Date;
				createdAt: Date;
			}) &
		InferAdditionalFieldsFromPluginOptions<"invitation", O, false>;
