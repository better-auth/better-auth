export const APP_INVITE_ERROR_CODES = {
	USER_IS_ALREADY_A_MEMBER_OF_THIS_APPLICATION:
		"User is already a member of this application",
	USER_WAS_ALREADY_INVITED_TO_THIS_APPLICATION:
		"User was already invited to this application",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THIS_APPLICATION:
		"Inviter is no longer a member of this application",
	APP_INVITATION_NOT_FOUND: "App invitation not found",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_APP_INVITATION:
		"You are not allowed to cancel this app invitation",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_APPLICATION:
		"You are not allowed to invite users to this application",
	THIS_APP_INVITATION_CANT_BE_REJECTED: "This app invitation can't be rejected",
	EMAIL_DOMAIN_IS_NOT_IN_WHITELIST: "Email domain is not in whitelist"
} as const;
