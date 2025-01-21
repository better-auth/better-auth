import { atom } from "nanostores";
import type {
	Invitation,
	Member,
	Swarm,
} from "../swarm/schema";
import type { Prettify } from "../../types/helper";
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc,
	type AccessControl,
	type Role,
} from "./access";
import type { BetterAuthClientPlugin } from "../../client/types";
import type { swarm } from "./swarm";
import { useAuthQuery } from "../../client";
import { BetterAuthError } from "../../error";

interface SwarmClientOptions {
	ac: AccessControl;
	roles: {
		[key in string]: Role;
	};
}

export const swarmClient = <O extends SwarmClientOptions>(
	options?: O,
) => {
	const $listSwm = atom<boolean>(false);
	const $activeSwmSignal = atom<boolean>(false);
	const $activeMemberSignal = atom<boolean>(false);

	type DefaultStatements = typeof defaultStatements;
	type Statements = O["ac"] extends AccessControl<infer S>
		? S extends Record<string, Array<any>>
			? S & DefaultStatements
			: DefaultStatements
		: DefaultStatements;
	const roles = {
		admin: adminAc,
		member: memberAc,
		owner: ownerAc,
		...options?.roles,
	};
	return {
		id: "swarm",
		$InferServerPlugin: {} as ReturnType<
			typeof swarm<{
				ac: O["ac"] extends AccessControl
					? O["ac"]
					: AccessControl<DefaultStatements>;
				roles: O["roles"] extends Record<string, Role>
					? O["roles"]
					: {
							admin: Role;
							member: Role;
							owner: Role;
						};
			}>
		>,
		getActions: ($fetch) => ({
			$Infer: {
				ActiveSwarm: {} as Prettify<
					Swarm & {
						members: Prettify<
							Member & {
								user: {
									id: string;
									name: string;
									email: string;
									image?: string | null;
								};
							}
						>[];
						invitations: Invitation[];
					}
				>,
				Swarm: {} as Swarm,
				Invitation: {} as Invitation,
				Member: {} as Member,
			},
			swarm: {
				checkRolePermission: <
					R extends O extends { roles: any }
						? keyof O["roles"]
						: "admin" | "member" | "owner",
				>(data: {
					role: R;
					permission: {
						//@ts-expect-error fix this later
						[key in keyof Statements]?: Statements[key][number][];
					};
				}) => {
					if (Object.keys(data.permission).length > 1) {
						throw new BetterAuthError(
							"you can only check one resource permission at a time.",
						);
					}
					const role = roles[data.role as unknown as "admin"];
					if (!role) {
						return false;
					}
					const isAuthorized = role?.authorize(data.permission as any);
					return isAuthorized.success;
				},
			},
		}),
		getAtoms: ($fetch) => {
			const listSwarms = useAuthQuery<Swarm[]>(
				$listSwm,
				"/swarm/list",
				$fetch,
				{
					method: "GET",
				},
			);
			const activeSwarm = useAuthQuery<
				Prettify<
					Swarm & {
						members: (Member & {
							user: {
								id: string;
								name: string;
								email: string;
								image: string | undefined;
							};
						})[];
						invitations: Invitation[];
					}
				>
			>(
				[$activeSwmSignal],
				"/swarm/get-full-swarm",
				$fetch,
				() => ({
					method: "GET",
				}),
			);

			const activeMember = useAuthQuery<Member>(
				[$activeMemberSignal],
				"/swarm/get-active-member",
				$fetch,
				{
					method: "GET",
				},
			);

			return {
				$listSwm,
				$activeSwmSignal,
				$activeMemberSignal,
				activeSwarm,
				listSwarms,
				activeMember,
			};
		},
		pathMethods: {
			"/swarm/get-full-swarm": "GET",
		},
		atomListeners: [
			{
				matcher(path) {
					return (
						path === "/swarm/create" ||
						path === "/swarm/delete" ||
						path === "/swarm/update"
					);
				},
				signal: "$listSwm",
			},
			{
				matcher(path) {
					return path.startsWith("/swarm");
				},
				signal: "$activeSwmSignal",
			},
			{
				matcher(path) {
					return path.includes("/swarm/update-member-role");
				},
				signal: "$activeMemberSignal",
			},
		],
	} satisfies BetterAuthClientPlugin;
};
