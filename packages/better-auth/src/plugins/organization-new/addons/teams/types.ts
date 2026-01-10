import type { DBFieldAttribute } from "@better-auth/core/db";
import type { Team, TeamMember } from "./schema";

export interface TeamsOptions {
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
