import type { LiteralString } from "@better-auth/core";
import type {
	Addon,
	FindAddonFromOrgOptions,
	OrganizationOptions,
} from "../types";

/**
 * Helper function to get an addon from the organization plugin options.
 * This is primarily used to call events from a given addon, such as `teamsAddon.events.createDefaultTeam({organization, user}, ctx);`
 *
 * @example
 * ```ts
 * const $TA = {} as TeamsAddon;
 * const [teamsAddon, $InferTeamsAddon] = getAddon(options, "teams", $TA);
 *
 * if(teamsAddon){
 *  //... do stuff with teamsAddon, such as calling its events
 *  await teamsAddon.events.createDefaultTeam({organization, user}, ctx);
 * }
 * ```
 * @returns [addon: ExpectedAddon, $Infer: Result]
 *
 *  You can use `$Infer` to get the real type inference if the addon exists in the org options
 *  If it can't infer it, it will return `null`, which is why by default you can just use `addon` which doesn't infer from org options
 */
export const getAddon = <
	ExpectedAddon extends Addon,
	O extends OrganizationOptions,
	I extends LiteralString,
>(
	options: O,
	addonId: I,
	$InferAddon: ExpectedAddon,
) => {
	type Result = [FindAddonFromOrgOptions<O, I>] extends [infer A]
		? [A] extends [never]
			? null
			: ExpectedAddon
		: null;
	const addon = options.use?.find((addon) => addon.id === addonId);
	if (!addon) {
		return [null, {} as Result] as [null, Result];
	}
	return [addon as ExpectedAddon, {} as Result] as [
		addon: ExpectedAddon,
		$Infer: Result,
	];
};
