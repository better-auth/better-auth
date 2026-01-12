import type { Prettify } from "@better-auth/core";
import type { DBFieldAttribute, User } from "@better-auth/core/db";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../../db";
import type { Organization } from "../../schema";
import type { Team, TeamMember } from "./schema";

export interface TeamsOptions {
	hooks?: TeamHooks;
	schema?:
		| {
				team?: {
					modelName?: string;
					fields?: {
						[key in keyof Omit<Team, "id">]?: string;
					};
					additionalFields?: {
						[key in string]: DBFieldAttribute;
					};
				};
				teamMember?: {
					modelName?: string;
					fields?: {
						[key in keyof Omit<TeamMember, "id">]?: string;
					};
					additionalFields?: {
						[key in string]: DBFieldAttribute;
					};
				};
				session?: {
					fields?: {
						activeTeamId?: string;
					};
				};
		  }
		| undefined;
}

export type InferTeam<
	TO extends TeamsOptions,
	isClientSide extends boolean = true,
> = Prettify<
	Team & InferAdditionalFieldsFromPluginOptions<"team", TO, isClientSide>
>;

type TeamHooks = {
	/**
	 * A callback that runs before a team is created
	 *
	 * You can return a `data` object to override the default data.
	 */
	beforeCreateTeam?: (data: {
		team: {
			name: string;
			organizationId: string;
			[key: string]: any;
		};
		user?: User & Record<string, any>;
		organization: Organization & Record<string, any>;
	}) => Promise<void | {
		data: Record<string, any>;
	}>;

	/**
	 * A callback that runs after a team is created
	 */
	afterCreateTeam?: (data: {
		team: Team & Record<string, any>;
		user?: User & Record<string, any>;
		organization: Organization & Record<string, any>;
	}) => Promise<void>;

	/**
	 * A callback that runs before a team is updated
	 *
	 * You can return a `data` object to override the default data.
	 */
	beforeUpdateTeam?: (data: {
		team: Team & Record<string, any>;
		updates: {
			name?: string;
			[key: string]: any;
		};
		user: User & Record<string, any>;
		organization: Organization & Record<string, any>;
	}) => Promise<void | {
		data: Record<string, any>;
	}>;

	/**
	 * A callback that runs after a team is updated
	 */
	afterUpdateTeam?: (data: {
		team: (Team & Record<string, any>) | null;
		user: User & Record<string, any>;
		organization: Organization & Record<string, any>;
	}) => Promise<void>;

	/**
	 * A callback that runs before a team is deleted
	 */
	beforeDeleteTeam?: (data: {
		team: Team & Record<string, any>;
		user?: User & Record<string, any>;
		organization: Organization & Record<string, any>;
	}) => Promise<void>;

	/**
	 * A callback that runs after a team is deleted
	 */
	afterDeleteTeam?: (data: {
		team: Team & Record<string, any>;
		user?: User & Record<string, any>;
		organization: Organization & Record<string, any>;
	}) => Promise<void>;

	/**
	 * A callback that runs before a member is added to a team
	 */
	beforeAddTeamMember?: (data: {
		teamMember: {
			teamId: string;
			userId: string;
			[key: string]: any;
		};
		team: Team & Record<string, any>;
		user: User & Record<string, any>;
		organization: Organization & Record<string, any>;
	}) => Promise<void | {
		data: Record<string, any>;
	}>;

	/**
	 * A callback that runs after a member is added to a team
	 */
	afterAddTeamMember?: (data: {
		teamMember: TeamMember & Record<string, any>;
		team: Team & Record<string, any>;
		user: User & Record<string, any>;
		organization: Organization & Record<string, any>;
	}) => Promise<void>;

	/**
	 * A callback that runs before a member is removed from a team
	 */
	beforeRemoveTeamMember?: (data: {
		teamMember: TeamMember & Record<string, any>;
		team: Team & Record<string, any>;
		user: User & Record<string, any>;
		organization: Organization & Record<string, any>;
	}) => Promise<void>;

	/**
	 * A callback that runs after a member is removed from a team
	 */
	afterRemoveTeamMember?: (data: {
		teamMember: TeamMember & Record<string, any>;
		team: Team & Record<string, any>;
		user: User & Record<string, any>;
		organization: Organization & Record<string, any>;
	}) => Promise<void>;
};
