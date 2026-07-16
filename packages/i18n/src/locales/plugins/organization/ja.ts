import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { LocalizedTranslations } from "../../../types";

export const jaOrganization: LocalizedTranslations<
	typeof ORGANIZATION_ERROR_CODES
> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"新しい組織を作成することは許可されていません",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"組織の最大数に達しました",
	ORGANIZATION_ALREADY_EXISTS: "組織はすでに存在します",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "組織のスラッグはすでに使用されています",
	ORGANIZATION_NOT_FOUND: "組織が見つかりません",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
		"ユーザーは組織のメンバーではありません",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"この組織を更新することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"この組織を削除することは許可されていません",
	NO_ACTIVE_ORGANIZATION: "アクティブな組織がありません",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"ユーザーはすでにこの組織のメンバーです",
	MEMBER_NOT_FOUND: "メンバーが見つかりません",
	ROLE_NOT_FOUND: "役割が見つかりません",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
		"新しいチームを作成することは許可されていません",
	TEAM_ALREADY_EXISTS: "チームはすでに存在します",
	TEAM_NOT_FOUND: "チームが見つかりません",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"唯一の所有者として組織を脱退することはできません",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"所有者なしで組織を脱退することはできません",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"このメンバーを削除することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"この組織にユーザーを招待することは許可されていません",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"ユーザーはすでにこの組織に招待されています",
	INVITATION_NOT_FOUND: "招待が見つかりません",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
		"あなたは招待の受信者ではありません",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"招待を承諾または拒否する前にメール認証が必要です",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"招待を表示するにはメール認証が必要です",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"この招待をキャンセルすることは許可されていません",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"招待者はすでに組織のメンバーではありません",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"この役割のユーザーを招待することは許可されていません",
	FAILED_TO_RETRIEVE_INVITATION: "招待の取得に失敗しました",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS: "チームの最大数に達しました",
	UNABLE_TO_REMOVE_LAST_TEAM: "最後のチームを削除できません",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"このメンバーを更新することは許可されていません",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "組織のメンバーシップ制限に達しました",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"この組織でチームを作成することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"この組織でチームを削除することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"このチームを更新することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
		"このチームを削除することは許可されていません",
	INVITATION_LIMIT_REACHED: "招待制限に達しました",
	TEAM_MEMBER_LIMIT_REACHED: "チームメンバー制限に達しました",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "ユーザーはチームのメンバーではありません",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"このチームのメンバーを一覧表示することは許可されていません",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "アクティブなチームがありません",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"新しいメンバーを作成することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"チームメンバーを削除することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"所有者としてこの組織にアクセスすることは許可されていません",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
		"あなたはこの組織のメンバーではありません",
	MISSING_AC_INSTANCE:
		"動的アクセス制御には、サーバーの認証プラグインにあらかじめ定義されたacインスタンスが必要です",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"役割を作成するには組織に所属している必要があります",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE:
		"役割を作成することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
		"役割を更新することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE:
		"役割を削除することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "役割を読み取ることは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
		"役割を一覧表示することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "役割を取得することは許可されていません",
	TOO_MANY_ROLES: "この組織には役割が多すぎます",
	INVALID_RESOURCE: "指定された権限に無効なリソースが含まれています",
	ROLE_NAME_IS_ALREADY_TAKEN: "その役割名はすでに使用されています",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE: "定義済みの役割を削除することはできません",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"メンバーに割り当てられている役割を削除することはできません。まず、メンバーを別の役割に割り当て直してください",
	INVALID_TEAM_ID: "チームIDに予約文字が含まれています",
};
