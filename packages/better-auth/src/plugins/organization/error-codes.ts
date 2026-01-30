import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const ORGANIZATION_ERROR_CODES = defineErrorCodes({
	/**
 * @description This error occurs when a user attempts to create a new organization but lacks the necessary permissions or the feature is restricted.
 *
 * ## Common Causes
 *
 * - User doesn't have organization creation permissions
 * - Organization creation is disabled in the configuration
 * - User plan or subscription doesn't allow organization creation
 *
 * ## How to resolve
 *
 * - Request organization creation permissions
 * - Upgrade your plan if organizations are a paid feature
 * - Check the organization plugin configuration settings
 */
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"You are not allowed to create a new organization",
	/**
 * @description This error occurs when a user has reached their quota limit for creating organizations.
 *
 * ## Common Causes
 *
 * - User has created the maximum allowed number of organizations
 * - Plan limits restrict the number of organizations
 * - System-wide quota has been reached
 *
 * ## How to resolve
 *
 * - Delete unused organizations to free up quota
 * - Upgrade your plan to allow more organizations
 * - Contact support to increase your organization limit
 */
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"You have reached the maximum number of organizations",
	/**
 * @description This error occurs when attempting to create an organization with a name that already exists in the system.
 *
 * ## Common Causes
 *
 * - Organization name is not unique
 * - Another user already created an organization with this name
 * - Race condition where multiple creation requests happen simultaneously
 *
 * ## How to resolve
 *
 * - Choose a different organization name
 * - Check if you already have access to the existing organization
 * - Add a suffix or prefix to make the name unique
 */
	ORGANIZATION_ALREADY_EXISTS: "Organization already exists",
	/**
 * @description This error occurs when attempting to create an organization with a slug (URL-friendly identifier) that's already in use.
 *
 * ## Common Causes
 *
 * - Another organization is using the same slug
 * - Slug generation from name conflicts with existing slug
 * - Previously deleted organization had the same slug
 *
 * ## How to resolve
 *
 * - Use a different organization slug
 * - Add numbers or unique identifiers to the slug
 * - Check if the organization was previously deleted and can be restored
 *
 * ## Example
 *
 * ```typescript
 * // Ensure unique slug when creating organization
 * await client.organization.create({ name: "My Org", slug: "my-org-2024" });
 * ```
 */
	ORGANIZATION_SLUG_ALREADY_TAKEN: "Organization slug already taken",
	/**
 * @description This error occurs when attempting to access or operate on an organization that doesn't exist or has been deleted.
 *
 * ## Common Causes
 *
 * - Organization ID is incorrect or invalid
 * - Organization has been deleted
 * - User doesn't have access to the organization
 *
 * ## How to resolve
 *
 * - Verify the organization ID is correct
 * - Check if the organization still exists
 * - Ensure you have proper access permissions
 */
	ORGANIZATION_NOT_FOUND: "Organization not found",
	/**
 * @description This error occurs when attempting an organization operation on a user who is not a member of that organization.
 *
 * ## Common Causes
 *
 * - User was removed from the organization
 * - User never joined the organization
 * - Operating on wrong organization ID
 *
 * ## How to resolve
 *
 * - Verify the user is a member of the organization
 * - Invite the user to join the organization first
 * - Check that you're using the correct organization ID
 */
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
		"User is not a member of the organization",
	/**
 * @description This error occurs when a user attempts to modify organization settings but lacks the necessary permissions.
 *
 * ## Common Causes
 *
 * - User doesn't have admin or owner role in the organization
 * - Organization settings modification is restricted
 * - User role doesn't include update permissions
 *
 * ## How to resolve
 *
 * - Request admin or owner permissions from current admins
 * - Verify your role has organization update capabilities
 * - Contact organization owner for permission changes
 */
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"You are not allowed to update this organization",
	/**
 * @description This error occurs when a user attempts to delete an organization but lacks the necessary permissions. Organization deletion is typically restricted to owners.
 *
 * ## Common Causes
 *
 * - User is not the organization owner
 * - User role doesn't include deletion permissions
 * - Organization deletion is restricted by policy
 *
 * ## How to resolve
 *
 * - Only organization owners can delete organizations
 * - Transfer ownership if you need to delete the organization
 * - Contact current owner to perform the deletion
 */
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"You are not allowed to delete this organization",
	/**
 * @description This error occurs when attempting an operation that requires an active organization context but none is set.
 *
 * ## Common Causes
 *
 * - User hasn't selected an active organization
 * - Active organization was deleted or user was removed
 * - Session doesn't have organization context
 *
 * ## How to resolve
 *
 * - Set an active organization before performing the operation
 * - Select an organization from your organization list
 * - Join or create an organization if you don't have any
 *
 * ## Example
 *
 * ```typescript
 * // Set active organization before operations
 * await client.organization.setActive({ organizationId: orgId });
 * ```
 */
	NO_ACTIVE_ORGANIZATION: "No active organization",
	/**
 * @description This error occurs when attempting to add a user who is already a member of the organization.
 *
 * ## Common Causes
 *
 * - User was already added to the organization
 * - Duplicate invitation was sent and accepted
 * - User joined through multiple invitation links
 *
 * ## How to resolve
 *
 * - Check existing organization members before adding
 * - User is already a member and doesn't need to be added again
 * - Update the user's role instead if needed
 */
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"User is already a member of this organization",
	/**
 * @description This error occurs when attempting to operate on an organization member that doesn't exist or has been removed.
 *
 * ## Common Causes
 *
 * - Member ID is incorrect
 * - Member was removed from the organization
 * - Member left the organization
 *
 * ## How to resolve
 *
 * - Verify the member ID is correct
 * - Check the current member list
 * - Re-invite the user if they need to rejoin
 */
	MEMBER_NOT_FOUND: "Member not found",
	/**
 * @description This error occurs when attempting to assign a role that doesn't exist in the organization's role configuration.
 *
 * ## Common Causes
 *
 * - Role name or ID doesn't match configured roles
 * - Typo in the role identifier
 * - Role was deleted from the organization
 *
 * ## How to resolve
 *
 * - Verify the role exists in your organization's role list
 * - Check for typos in the role identifier
 * - Use only predefined roles from your organization configuration
 */
	ROLE_NOT_FOUND: "Role not found",
	/**
 * @description This error occurs when a user attempts to create a team within an organization but lacks the necessary permissions.
 *
 * ## Common Causes
 *
 * - User doesn't have team creation permissions
 * - User role is too low to create teams
 * - Team creation is restricted to admins or owners
 *
 * ## How to resolve
 *
 * - Request team creation permissions from an admin
 * - Verify your role includes team management capabilities
 * - Contact organization owner for permission changes
 */
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
		"You are not allowed to create a new team",
	/**
 * @description This error occurs when attempting to create a team with a name that already exists in the organization.
 *
 * ## Common Causes
 *
 * - Team name is not unique within the organization
 * - Another team already has this name
 * - Race condition where multiple creation requests happen simultaneously
 *
 * ## How to resolve
 *
 * - Choose a different team name
 * - Check if the team already exists and you can join it
 * - Add a suffix or prefix to make the name unique
 */
	TEAM_ALREADY_EXISTS: "Team already exists",
	/**
 * @description This error occurs when attempting to access or operate on a team that doesn't exist or has been deleted.
 *
 * ## Common Causes
 *
 * - Team ID is incorrect or invalid
 * - Team has been deleted
 * - Team doesn't belong to the current organization
 *
 * ## How to resolve
 *
 * - Verify the team ID is correct
 * - Check if the team still exists in the organization
 * - Ensure you're operating on the correct organization
 */
	TEAM_NOT_FOUND: "Team not found",
	/**
 * @description This error prevents the last owner from leaving an organization, which would leave it without ownership.
 *
 * ## Common Causes
 *
 * - User is the sole owner of the organization
 * - Attempting to leave without transferring ownership first
 * - No other owners exist in the organization
 *
 * ## How to resolve
 *
 * - Transfer ownership to another member before leaving
 * - Promote another member to owner role
 * - Delete the organization instead if no longer needed
 */
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"You cannot leave the organization as the only owner",
	/**
 * @description This error prevents leaving an organization in a way that would leave it without any owner.
 *
 * ## Common Causes
 *
 * - No owner exists in the organization
 * - Ownership transition is incomplete
 * - Database inconsistency with owner roles
 *
 * ## How to resolve
 *
 * - Ensure at least one owner remains in the organization
 * - Promote a member to owner before leaving
 * - Contact support if there's a database inconsistency
 */
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"You cannot leave the organization without an owner",
	/**
 * @description This error occurs when a user attempts to remove a member but lacks the necessary permissions.
 *
 * ## Common Causes
 *
 * - User doesn't have member removal permissions
 * - Attempting to remove a member with equal or higher privileges
 * - User role doesn't include member management capabilities
 *
 * ## How to resolve
 *
 * - Request member management permissions from an admin
 * - Verify your role has member removal capabilities
 * - Only admins or owners can remove members
 */
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"You are not allowed to delete this member",
	/**
 * @description This error occurs when a user attempts to send organization invitations but lacks the necessary permissions.
 *
 * ## Common Causes
 *
 * - User doesn't have invitation permissions
 * - Invitations are restricted to specific roles
 * - User role doesn't include member invitation capabilities
 *
 * ## How to resolve
 *
 * - Request invitation permissions from an admin or owner
 * - Verify your role includes invitation capabilities
 * - Contact organization owner for permission changes
 */
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"You are not allowed to invite users to this organization",
	/**
 * @description This error occurs when attempting to send an invitation to a user who already has a pending invitation to the organization.
 *
 * ## Common Causes
 *
 * - User already received an invitation that hasn't been accepted or rejected
 * - Multiple admins trying to invite the same user
 * - Previous invitation hasn't expired yet
 *
 * ## How to resolve
 *
 * - Wait for the user to respond to the existing invitation
 * - Cancel the previous invitation and send a new one
 * - Check pending invitations before sending new ones
 */
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"User is already invited to this organization",
	/**
 * @description This error occurs when attempting to operate on an organization invitation that doesn't exist or has expired.
 *
 * ## Common Causes
 *
 * - Invitation ID is incorrect
 * - Invitation has been deleted or canceled
 * - Invitation has already been accepted or rejected
 *
 * ## How to resolve
 *
 * - Verify the invitation ID is correct
 * - Request a new invitation if the previous one is invalid
 * - Check if the invitation has already been processed
 */
	INVITATION_NOT_FOUND: "Invitation not found",
	/**
 * @description This error occurs when a user attempts to accept or reject an invitation that wasn't sent to them.
 *
 * ## Common Causes
 *
 * - Using an invitation link not meant for the current user
 * - Signed in with a different account than the invitation recipient
 * - Invitation was sent to a different email address
 *
 * ## How to resolve
 *
 * - Ensure you're signed in with the correct account
 * - Check the email address the invitation was sent to
 * - Request a new invitation to your current email if needed
 */
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
		"You are not the recipient of the invitation",
	/**
 * @description This error occurs when attempting to accept or reject an organization invitation before verifying the email address.
 *
 * ## Common Causes
 *
 * - Email address hasn't been verified yet
 * - Verification email wasn't completed
 * - Security policy requires verified email for organization access
 *
 * ## How to resolve
 *
 * - Verify your email address before accepting the invitation
 * - Check your email for the verification link
 * - Request a new verification email if needed
 *
 * ## Example
 *
 * ```typescript
 * // Verify email before accepting invitation
 * await client.auth.verifyEmail({ token: verificationToken });
 * await client.organization.acceptInvitation({ invitationId });
 * ```
 */
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"Email verification required before accepting or rejecting invitation",
	/**
 * @description This error occurs when a user attempts to cancel an invitation but lacks the necessary permissions.
 *
 * ## Common Causes
 *
 * - User is not the invitation sender
 * - User doesn't have invitation management permissions
 * - User is not an admin or owner of the organization
 *
 * ## How to resolve
 *
 * - Only the invitation sender or admins can cancel invitations
 * - Request admin permissions if you need to manage invitations
 * - Contact the invitation sender or organization admin
 */
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"You are not allowed to cancel this invitation",
	/**
 * @description This error occurs when the user who sent an organization invitation is no longer a member of that organization.
 *
 * ## Common Causes
 *
 * - Inviter left the organization after sending the invitation
 * - Inviter was removed from the organization
 * - Invitation is stale due to organizational changes
 *
 * ## How to resolve
 *
 * - Request a new invitation from a current organization member
 * - Contact organization admins for a valid invitation
 * - The invitation may need to be canceled and resent
 */
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"Inviter is no longer a member of the organization",
	/**
 * @description This error occurs when attempting to invite a user with a role that the inviter doesn't have permission to assign.
 *
 * ## Common Causes
 *
 * - Trying to invite a user with admin role when inviter is not an admin
 * - Attempting to assign a role higher than inviter's own role
 * - Role assignment permissions are restricted
 *
 * ## How to resolve
 *
 * - Invite users with roles at or below your permission level
 * - Request a higher-privileged member to send the invitation
 * - Assign a lower role and have an admin upgrade it later
 */
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"You are not allowed to invite a user with this role",
	/**
 * @description This error occurs when the system fails to retrieve invitation details due to database or system issues.
 *
 * ## Common Causes
 *
 * - Database connection issues
 * - Invitation data is corrupted
 * - System resource limitations
 *
 * ## How to resolve
 *
 * - Retry the operation
 * - Check database connectivity
 * - Review server logs for specific error details
 * - Request a new invitation if the issue persists
 */
	FAILED_TO_RETRIEVE_INVITATION: "Failed to retrieve invitation",
	/**
 * @description This error occurs when an organization has reached its quota limit for creating teams.
 *
 * ## Common Causes
 *
 * - Organization has created the maximum allowed number of teams
 * - Plan limits restrict the number of teams
 * - Organization-wide quota has been reached
 *
 * ## How to resolve
 *
 * - Delete unused teams to free up quota
 * - Upgrade your organization plan to allow more teams
 * - Contact support to increase your team limit
 */
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"You have reached the maximum number of teams",
	/**
 * @description This error prevents removing the last team in an organization when at least one team is required.
 *
 * ## Common Causes
 *
 * - Attempting to delete the only remaining team
 * - Organization configuration requires at least one team
 * - Default team cannot be removed
 *
 * ## How to resolve
 *
 * - Create a new team before removing the current one
 * - Keep at least one active team in the organization
 * - Contact support if you need to change team requirements
 */
	UNABLE_TO_REMOVE_LAST_TEAM: "Unable to remove last team",
	/**
 * @description This error occurs when a user attempts to modify a member's information but lacks the necessary permissions.
 *
 * ## Common Causes
 *
 * - User doesn't have member management permissions
 * - Attempting to modify a member with equal or higher privileges
 * - User role doesn't include member update capabilities
 *
 * ## How to resolve
 *
 * - Request member management permissions from an admin
 * - Verify your role has member modification capabilities
 * - Only admins or owners can update member information
 */
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"You are not allowed to update this member",
	/**
 * @description This error occurs when an organization has reached its maximum member capacity.
 *
 * ## Common Causes
 *
 * - Organization has reached the member limit for its plan
 * - Maximum membership quota has been reached
 * - Plan restrictions limit the number of members
 *
 * ## How to resolve
 *
 * - Remove inactive members to free up space
 * - Upgrade your organization plan to allow more members
 * - Contact support to increase your member limit
 */
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
		"Organization membership limit reached",
	/**
 * @description This error occurs when a user attempts to create teams but lacks the necessary permissions in the organization.
 *
 * ## Common Causes
 *
 * - User role doesn't include team creation permissions
 * - Team creation is restricted to specific roles
 * - Organization settings disable team creation for most members
 *
 * ## How to resolve
 *
 * - Request team creation permissions from an admin or owner
 * - Verify your role includes team management capabilities
 * - Contact organization owner for permission changes
 */
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"You are not allowed to create teams in this organization",
	/**
 * @description This error occurs when a user attempts to delete teams but lacks the necessary permissions in the organization.
 *
 * ## Common Causes
 *
 * - User role doesn't include team deletion permissions
 * - Team deletion is restricted to specific roles
 * - Only team creators or admins can delete teams
 *
 * ## How to resolve
 *
 * - Request team deletion permissions from an admin or owner
 * - Verify your role includes team management capabilities
 * - Contact the team creator or organization admin
 */
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"You are not allowed to delete teams in this organization",
	/**
 * @description This error occurs when a user attempts to modify a team but lacks the necessary permissions.
 *
 * ## Common Causes
 *
 * - User is not a team admin or team creator
 * - User role doesn't include team update permissions
 * - Team modification is restricted to specific roles
 *
 * ## How to resolve
 *
 * - Request team admin permissions
 * - Verify your role includes team modification capabilities
 * - Contact team admin or organization owner
 */
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"You are not allowed to update this team",
	/**
 * @description This error occurs when a user attempts to delete a team but lacks the necessary permissions.
 *
 * ## Common Causes
 *
 * - User is not the team creator or admin
 * - User role doesn't include team deletion permissions
 * - Team deletion is restricted to organization owners
 *
 * ## How to resolve
 *
 * - Request team deletion permissions
 * - Contact the team creator or organization admin
 * - Only authorized roles can delete teams
 */
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
		"You are not allowed to delete this team",
	/**
 * @description This error occurs when the organization has reached its maximum number of pending invitations.
 *
 * ## Common Causes
 *
 * - Too many pending invitations exist
 * - Plan limits restrict the number of active invitations
 * - Invitation quota has been reached
 *
 * ## How to resolve
 *
 * - Cancel unused or expired invitations
 * - Wait for pending invitations to be accepted or rejected
 * - Upgrade your plan to allow more simultaneous invitations
 */
	INVITATION_LIMIT_REACHED: "Invitation limit reached",
	/**
 * @description This error occurs when a team has reached its maximum member capacity.
 *
 * ## Common Causes
 *
 * - Team has reached the member limit
 * - Plan restrictions limit team size
 * - Team quota has been reached
 *
 * ## How to resolve
 *
 * - Remove inactive team members
 * - Create additional teams to distribute members
 * - Upgrade your plan to allow larger teams
 */
	TEAM_MEMBER_LIMIT_REACHED: "Team member limit reached",
	/**
 * @description This error occurs when attempting a team operation on a user who is not a member of that team.
 *
 * ## Common Causes
 *
 * - User was removed from the team
 * - User was never added to the team
 * - Operating on wrong team ID
 *
 * ## How to resolve
 *
 * - Verify the user is a member of the team
 * - Add the user to the team first
 * - Check that you're using the correct team ID
 */
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "User is not a member of the team",
	/**
 * @description This error occurs when a user attempts to view team members but lacks the necessary permissions.
 *
 * ## Common Causes
 *
 * - User is not a team member
 * - User role doesn't include member viewing permissions
 * - Team member list is restricted to team members only
 *
 * ## How to resolve
 *
 * - Join the team to view its members
 * - Request permission to view team members
 * - Contact team admin for access
 */
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"You are not allowed to list the members of this team",
	/**
 * @description This error occurs when attempting an operation that requires an active team context but none is set.
 *
 * ## Common Causes
 *
 * - User hasn't selected an active team
 * - Active team was deleted or user was removed
 * - Session doesn't have team context
 *
 * ## How to resolve
 *
 * - Set an active team before performing the operation
 * - Select a team from your team list
 * - Join or create a team if you don't have any
 */
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "You do not have an active team",
	/**
 * @description This error occurs when a user attempts to add a team member but lacks the necessary permissions.
 *
 * ## Common Causes
 *
 * - User doesn't have member addition permissions
 * - User is not a team admin
 * - Member management is restricted to specific roles
 *
 * ## How to resolve
 *
 * - Request team admin permissions
 * - Verify your role includes member management capabilities
 * - Contact team admin or creator
 */
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"You are not allowed to create a new member",
	/**
 * @description This error occurs when a user attempts to remove a team member but lacks the necessary permissions.
 *
 * ## Common Causes
 *
 * - User doesn't have member removal permissions
 * - User is not a team admin
 * - Member management is restricted to specific roles
 *
 * ## How to resolve
 *
 * - Request team admin permissions
 * - Verify your role includes member management capabilities
 * - Contact team admin or creator
 */
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"You are not allowed to remove a team member",
	/**
 * @description This error occurs when a user attempts to access an organization with owner-level permissions but isn't an owner.
 *
 * ## Common Causes
 *
 * - User is not an owner of the organization
 * - Owner-level access is required for the operation
 * - User role is insufficient for owner-only operations
 *
 * ## How to resolve
 *
 * - Request owner role from current owners
 * - Use operations appropriate for your current role
 * - Contact organization owner for owner-level tasks
 */
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"You are not allowed to access this organization as an owner",
	/**
 * @description This error occurs when attempting an organization operation but the user is not a member of that organization.
 *
 * ## Common Causes
 *
 * - User was never added to the organization
 * - User was removed from the organization
 * - User invitation was not accepted
 *
 * ## How to resolve
 *
 * - Join the organization through an invitation
 * - Request membership from organization admins
 * - Verify you're operating on the correct organization
 */
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
		"You are not a member of this organization",
	/**
 * @description This error occurs when dynamic access control is enabled but the required access control instance is not configured on the server.
 *
 * ## Common Causes
 *
 * - Access control plugin configuration is missing
 * - AC instance not properly initialized
 * - Server configuration is incomplete
 *
 * ## How to resolve
 *
 * - Configure the access control instance in your server auth plugin
 * - Check server logs for detailed configuration errors
 * - Review the organization plugin documentation for AC setup
 * - Ensure the access control plugin is properly installed
 */
	MISSING_AC_INSTANCE:
		"Dynamic Access Control requires a pre-defined ac instance on the server auth plugin. Read server logs for more information",
	/**
 * @description This error occurs when attempting to create a role without being in an organization context.
 *
 * ## Common Causes
 *
 * - No active organization is selected
 * - User is not a member of any organization
 * - Organization context is missing from the request
 *
 * ## How to resolve
 *
 * - Set an active organization before creating roles
 * - Join or create an organization first
 * - Ensure organization context is properly set
 */
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"You must be in an organization to create a role",
	/**
 * @description This error occurs when a user attempts to create a custom role but lacks the necessary permissions.
 *
 * ## Common Causes
 *
 * - User doesn't have role creation permissions
 * - Role management is restricted to owners
 * - User role doesn't include role creation capabilities
 *
 * ## How to resolve
 *
 * - Request role management permissions from an owner
 * - Verify your role includes role creation capabilities
 * - Contact organization owner for custom role creation
 */
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "You are not allowed to create a role",
	/**
 * @description This error occurs when a user attempts to modify a role but lacks the necessary permissions.
 *
 * ## Common Causes
 *
 * - User doesn't have role update permissions
 * - Role management is restricted to owners
 * - User role doesn't include role modification capabilities
 *
 * ## How to resolve
 *
 * - Request role management permissions from an owner
 * - Verify your role includes role modification capabilities
 * - Contact organization owner for role updates
 */
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "You are not allowed to update a role",
	/**
 * @description This error occurs when a user attempts to delete a role but lacks the necessary permissions.
 *
 * ## Common Causes
 *
 * - User doesn't have role deletion permissions
 * - Role management is restricted to owners
 * - User role doesn't include role deletion capabilities
 *
 * ## How to resolve
 *
 * - Request role management permissions from an owner
 * - Verify your role includes role deletion capabilities
 * - Contact organization owner for role deletion
 */
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "You are not allowed to delete a role",
	/**
 * @description This error occurs when a user attempts to read role details but lacks the necessary permissions.
 *
 * ## Common Causes
 *
 * - User doesn't have role viewing permissions
 * - Role information is restricted
 * - User role doesn't include role reading capabilities
 *
 * ## How to resolve
 *
 * - Request role viewing permissions
 * - Verify your role includes role access capabilities
 * - Contact organization admin for role information
 */
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "You are not allowed to read a role",
	/**
 * @description This error occurs when a user attempts to list all roles but lacks the necessary permissions.
 *
 * ## Common Causes
 *
 * - User doesn't have role listing permissions
 * - Role list is restricted to specific roles
 * - User role doesn't include role listing capabilities
 *
 * ## How to resolve
 *
 * - Request role listing permissions
 * - Verify your role includes role viewing capabilities
 * - Contact organization admin for role information
 */
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "You are not allowed to list a role",
	/**
 * @description This error occurs when a user attempts to get a specific role but lacks the necessary permissions.
 *
 * ## Common Causes
 *
 * - User doesn't have role viewing permissions
 * - Role details are restricted
 * - User role doesn't include role access capabilities
 *
 * ## How to resolve
 *
 * - Request role viewing permissions
 * - Verify your role includes role access capabilities
 * - Contact organization admin for role details
 */
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "You are not allowed to get a role",
	/**
 * @description This error occurs when the organization has reached its maximum number of custom roles.
 *
 * ## Common Causes
 *
 * - Organization has created too many custom roles
 * - Plan limits restrict the number of roles
 * - Role quota has been reached
 *
 * ## How to resolve
 *
 * - Delete unused custom roles
 * - Consolidate similar roles
 * - Upgrade your plan to allow more custom roles
 */
	TOO_MANY_ROLES: "This organization has too many roles",
	/**
 * @description This error occurs when a permission is configured with a resource that doesn't exist or is not recognized by the system.
 *
 * ## Common Causes
 *
 * - Resource name is misspelled or invalid
 * - Resource is not defined in the access control configuration
 * - Using a custom resource that wasn't registered
 *
 * ## How to resolve
 *
 * - Verify the resource name matches defined resources
 * - Check the access control resource configuration
 * - Use only registered resources in permissions
 */
	INVALID_RESOURCE: "The provided permission includes an invalid resource",
	/**
 * @description This error occurs when attempting to create a role with a name that already exists in the organization.
 *
 * ## Common Causes
 *
 * - Role name is not unique within the organization
 * - Another custom role has the same name
 * - Name conflicts with a predefined role
 *
 * ## How to resolve
 *
 * - Choose a different role name
 * - Check existing roles before creating new ones
 * - Add a suffix or prefix to make the name unique
 */
	ROLE_NAME_IS_ALREADY_TAKEN: "That role name is already taken",
	/**
 * @description This error prevents deletion of system-defined or predefined roles that are required for proper organization functioning.
 *
 * ## Common Causes
 *
 * - Attempting to delete a built-in role (e.g., owner, admin, member)
 * - Role is marked as predefined in the configuration
 * - System roles are protected from deletion
 *
 * ## How to resolve
 *
 * - Only custom roles can be deleted
 * - Keep predefined roles for system integrity
 * - Create custom roles if you need different permissions
 */
	CANNOT_DELETE_A_PRE_DEFINED_ROLE: "Cannot delete a pre-defined role",
});
