import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { organizationKeys } from "./keys";

export async function getOrganizationList() {
	const { data, error } = await authClient.organization.list();
	if (error) throw new Error(error.message);

	return data;
}
export type OrganizationListData = Awaited<
	ReturnType<typeof getOrganizationList>
>;

export const useOrganizationListQuery = () => {
	return useQuery({
		queryKey: organizationKeys.list(),
		queryFn: getOrganizationList,
	});
};
