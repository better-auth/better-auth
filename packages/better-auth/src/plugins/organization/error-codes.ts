import { defineErrorCodes } from "@better-auth/core/utils";

export const ORGANIZATION_ERROR_CODES = defineErrorCodes({
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"You are not allowed to create a new organization",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"You have reached the maximum number of organizations",
	ORGANIZATION_ALREADY_EXISTS: "Organization already exists",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "Organization slug already taken",
	ORGANIZATION_NOT_FOUND: "Organization not found",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
		"User is not a member of the organization",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"You are not allowed to update this organization",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"You are not allowed to delete this organization",
	NO_ACTIVE_ORGANIZATION: "No active organization",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"User is already a member of this organization",
	MEMBER_NOT_FOUND: "Member not found",
	ROLE_NOT_FOUND: "Role not found",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
		"You are not allowed to create a new team",
	TEAM_ALREADY_EXISTS: "Team already exists",
	TEAM_NOT_FOUND: "Team not found",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"You cannot leave the organization as the only owner",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"You cannot leave the organization without an owner",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"You are not allowed to delete this member",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"You are not allowed to invite users to this organization",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"User is already invited to this organization",
	INVITATION_NOT_FOUND: "Invitation not found",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
		"You are not the recipient of the invitation",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"Email verification required before accepting or rejecting invitation",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"You are not allowed to cancel this invitation",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"Inviter is no longer a member of the organization",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"You are not allowed to invite a user with this role",
	FAILED_TO_RETRIEVE_INVITATION: "Failed to retrieve invitation",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"You have reached the maximum number of teams",
	UNABLE_TO_REMOVE_LAST_TEAM: "Unable to remove last team",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"You are not allowed to update this member",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
		"Organization membership limit reached",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"You are not allowed to create teams in this organization",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"You are not allowed to delete teams in this organization",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"You are not allowed to update this team",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
		"You are not allowed to delete this team",
	INVITATION_LIMIT_REACHED: "Invitation limit reached",
	TEAM_MEMBER_LIMIT_REACHED: "Team member limit reached",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "User is not a member of the team",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"You are not allowed to list the members of this team",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "You do not have an active team",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"You are not allowed to create a new member",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"You are not allowed to remove a team member",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"You are not allowed to access this organization as an owner",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
		"You are not a member of this organization",
	MISSING_AC_INSTANCE:
		"Dynamic Access Control requires a pre-defined ac instance on the server auth plugin. Read server logs for more information",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"You must be in an organization to create a role",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "You are not allowed to create a role",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "You are not allowed to update a role",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "You are not allowed to delete a role",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "You are not allowed to read a role",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "You are not allowed to list a role",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "You are not allowed to get a role",
	TOO_MANY_ROLES: "This organization has too many roles",
	INVALID_RESOURCE: "The provided permission includes an invalid resource",
	ROLE_NAME_IS_ALREADY_TAKEN: "That role name is already taken",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE: "Cannot delete a pre-defined role",
});
