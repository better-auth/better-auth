import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const ORGANIZATION_ERROR_CODES = defineErrorCodes({
	ERR_YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"You are not allowed to create a new organization",
	ERR_YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"You have reached the maximum number of organizations",
	ERR_ORGANIZATION_ALREADY_EXISTS: "Organization already exists",
	ERR_ORGANIZATION_SLUG_ALREADY_TAKEN: "Organization slug already taken",
	ERR_ORGANIZATION_NOT_FOUND: "Organization not found",
	ERR_USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
		"User is not a member of the organization",
	ERR_YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"You are not allowed to update this organization",
	ERR_YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"You are not allowed to delete this organization",
	ERR_NO_ACTIVE_ORGANIZATION: "No active organization",
	ERR_USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"User is already a member of this organization",
	ERR_MEMBER_NOT_FOUND: "Member not found",
	ERR_ROLE_NOT_FOUND: "Role not found",
	ERR_YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
		"You are not allowed to create a new team",
	ERR_TEAM_ALREADY_EXISTS: "Team already exists",
	ERR_TEAM_NOT_FOUND: "Team not found",
	ERR_YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"You cannot leave the organization as the only owner",
	ERR_YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"You cannot leave the organization without an owner",
	ERR_YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"You are not allowed to delete this member",
	ERR_YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"You are not allowed to invite users to this organization",
	ERR_USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"User is already invited to this organization",
	ERR_INVITATION_NOT_FOUND: "Invitation not found",
	ERR_YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
		"You are not the recipient of the invitation",
	ERR_EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"Email verification required before accepting or rejecting invitation",
	ERR_YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"You are not allowed to cancel this invitation",
	ERR_INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"Inviter is no longer a member of the organization",
	ERR_YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"You are not allowed to invite a user with this role",
	ERR_FAILED_TO_RETRIEVE_INVITATION: "Failed to retrieve invitation",
	ERR_YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"You have reached the maximum number of teams",
	ERR_UNABLE_TO_REMOVE_LAST_TEAM: "Unable to remove last team",
	ERR_YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"You are not allowed to update this member",
	ERR_ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
		"Organization membership limit reached",
	ERR_YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"You are not allowed to create teams in this organization",
	ERR_YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"You are not allowed to delete teams in this organization",
	ERR_YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"You are not allowed to update this team",
	ERR_YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
		"You are not allowed to delete this team",
	ERR_INVITATION_LIMIT_REACHED: "Invitation limit reached",
	ERR_TEAM_MEMBER_LIMIT_REACHED: "Team member limit reached",
	ERR_USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "User is not a member of the team",
	ERR_YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"You are not allowed to list the members of this team",
	ERR_YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "You do not have an active team",
	ERR_YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"You are not allowed to create a new member",
	ERR_YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"You are not allowed to remove a team member",
	ERR_YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"You are not allowed to access this organization as an owner",
	ERR_YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
		"You are not a member of this organization",
	ERR_MISSING_AC_INSTANCE:
		"Dynamic Access Control requires a pre-defined ac instance on the server auth plugin. Read server logs for more information",
	ERR_YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"You must be in an organization to create a role",
	ERR_YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "You are not allowed to create a role",
	ERR_YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "You are not allowed to update a role",
	ERR_YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "You are not allowed to delete a role",
	ERR_YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "You are not allowed to read a role",
	ERR_YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "You are not allowed to list a role",
	ERR_YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "You are not allowed to get a role",
	ERR_TOO_MANY_ROLES: "This organization has too many roles",
	ERR_INVALID_RESOURCE: "The provided permission includes an invalid resource",
	ERR_ROLE_NAME_IS_ALREADY_TAKEN: "That role name is already taken",
	ERR_CANNOT_DELETE_A_PRE_DEFINED_ROLE: "Cannot delete a pre-defined role",
});
