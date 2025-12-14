import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { organizationKeys } from "./keys";

export interface GetInvitationParams {
	invitationId: string;
}

export async function getInvitation(params: GetInvitationParams) {
	const { data, error } = await authClient.organization.getInvitation({
		query: {
			id: params.invitationId,
		},
	});
	if (error) throw new Error(error.message);

	return data;
}
export type InvitationData = Awaited<ReturnType<typeof getInvitation>>;

export const useInvitationQuery = (invitationId: string) => {
	return useQuery({
		queryKey: organizationKeys.invitationDetail(invitationId),
		queryFn: async () => await getInvitation({ invitationId }),
		enabled: !!invitationId,
	});
};
