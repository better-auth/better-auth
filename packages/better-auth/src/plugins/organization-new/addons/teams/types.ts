import type {
	Awaitable,
	GenericEndpointContext,
	Prettify,
} from "@better-auth/core";
import type { DBFieldAttribute, Session, User } from "@better-auth/core/db";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../../db";
import type { Organization } from "../../schema";
import type { Team, TeamMember } from "./schema";

export interface TeamsOptions {
	hooks?: TeamHooks;
	/**
	 * Default team configuration
	 */
	defaultTeam?: {
		/**
		 * Enable creating a default team when an organization is created
		 *
		 * @default true
		 */
		enabled: boolean;
		/**
		 * Pass a custom default team creator function
		 */
		customCreateDefaultTeam?: (
			organization: Organization & Record<string, any>,
			ctx?: GenericEndpointContext,
		) => Promise<Team & Record<string, any>>;
	};
	/**
	 * Maximum number of teams an organization can have.
	 *
	 * You can pass a number or a function that returns a number
	 *
	 * @default "unlimited"
	 *
	 * @param organization
	 * @param request
	 * @returns
	 */
	maximumTeams?:
		| ((
				data: {
					organizationId: string;
					session: {
						user: User;
						session: Session;
					} | null;
				},
				ctx?: GenericEndpointContext,
		  ) => Awaitable<number>)
		| number;

	/**
	 * The maximum number of members per team.
	 *
	 * if `undefined`, there is no limit.
	 *
	 * @default undefined
	 */
	maximumMembersPerTeam?:
		| number
		| ((data: {
				teamId: string;
				session: { user: User; session: Session };
				organizationId: string;
		  }) => Awaitable<number>)
		| undefined;
	/**
	 * By default, if an organization does only have one team, they'll not be able to remove it.
	 *
	 * You can disable this behavior by setting this to `false.
	 *
	 * @default false
	 */
	allowRemovingAllTeams?: boolean;
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

export interface ResolvedTeamsOptions extends TeamsOptions {
	defaultTeam: {
		/**
		 * Enable creating a default team when an organization is created
		 *
		 * @default true
		 */
		enabled: boolean;
		/**
		 * Pass a custom default team creator function
		 */
		customCreateDefaultTeam?: (
			organization: Organization & Record<string, any>,
			ctx?: GenericEndpointContext,
		) => Promise<Team & Record<string, any>>;
	};
	maximumTeams: (
		data: {
			organizationId: string;
			session: {
				user: User;
				session: Session;
			} | null;
		},
		ctx?: GenericEndpointContext,
	) => Awaitable<number>;
	maximumMembersPerTeam: (data: {
		teamId: string;
		session: { user: User; session: Session };
		organizationId: string;
	}) => Awaitable<number>;
	allowRemovingAllTeams: boolean;
	hooks?: TeamHooks;
}

export type InferTeam<
	TO extends TeamsOptions,
	isClientSide extends boolean = true,
> = Prettify<
	Team & InferAdditionalFieldsFromPluginOptions<"team", TO, isClientSide>
>;

export type TeamHooks =
	| {
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
	  }
	| undefined;
