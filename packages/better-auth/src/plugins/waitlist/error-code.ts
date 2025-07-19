export const WAITLIST_ERROR_CODES = {
	ALREADY_ON_WAITLIST: "User is already on the waitlist",
	NOT_ON_WAITLIST: "User is not on the waitlist",
	WAITLIST_FULL: "Waitlist is at maximum capacity",
	INVALID_EMAIL: "Invalid email address provided",
	FAILED_TO_JOIN_WAITLIST: "Failed to join the waitlist",
	FAILED_TO_LEAVE_WAITLIST: "Failed to leave the waitlist",
	WAITLIST_ENTRY_NOT_FOUND: "Waitlist entry not found",
	INVALID_POSITION: "Invalid waitlist position",
	UNAUTHORIZED_ACCESS: "Unauthorized access to waitlist data",
} as const;
