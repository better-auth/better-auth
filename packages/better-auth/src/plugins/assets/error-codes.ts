import { defineErrorCodes } from "@better-auth/core/utils";

export const ASSET_ERROR_CODES = defineErrorCodes({
	ASSET_NOT_FOUND: "Asset not found",
	ASSET_TYPE_NOT_FOUND: "Asset type not found",
	ASSET_ROLE_NOT_FOUND: "Asset role not found",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_AN_ASSET:
		"You are not allowed to create an asset",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ASSET:
		"You are not allowed to update this asset",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ASSET:
		"You are not allowed to delete this asset",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_AN_ASSET_TYPE:
		"You are not allowed to create an asset type",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ASSET_TYPE:
		"You are not allowed to update this asset type",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ASSET_TYPE:
		"You are not allowed to delete this asset type",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_AN_ASSET_ROLE:
		"You are not allowed to create an asset role",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ASSET_ROLE:
		"You are not allowed to update this asset role",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ASSET_ROLE:
		"You are not allowed to delete this asset role",
	ASSET_TYPE_NAME_ALREADY_EXISTS: "Asset type name already exists",
	ASSET_ROLE_TYPE_ALREADY_EXISTS: "Asset role type already exists",
	CANNOT_DELETE_ASSET_TYPE_WITH_ASSETS:
		"Cannot delete asset type that has associated assets",
	CANNOT_DELETE_ASSET_ROLE_WITH_ASSIGNMENTS:
		"Cannot delete asset role that has assignments",
	INVALID_ASSET_TYPE_SCOPE: "Invalid asset type scope",
	ORGANIZATION_REQUIRED: "Organization plugin is required for this operation",
	INVALID_MEMBER_OR_USER_ASSIGNMENT:
		"Either memberId or userId must be set, but not both",
});






