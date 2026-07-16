import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { LocalizedTranslations } from "../../../types";

export const koOrganization: LocalizedTranslations<
	typeof ORGANIZATION_ERROR_CODES
> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"새 조직을 생성할 권한이 없습니다",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"조직 최대 수에 도달했습니다",
	ORGANIZATION_ALREADY_EXISTS: "조직이 이미 존재합니다",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "이미 사용 중인 조직 슬러그입니다",
	ORGANIZATION_NOT_FOUND: "조직을 찾을 수 없습니다",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: "사용자가 조직의 멤버가 아닙니다",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"이 조직을 업데이트할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"이 조직을 삭제할 권한이 없습니다",
	NO_ACTIVE_ORGANIZATION: "활성화된 조직이 없습니다",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"사용자가 이미 이 조직의 멤버입니다",
	MEMBER_NOT_FOUND: "멤버를 찾을 수 없습니다",
	ROLE_NOT_FOUND: "역할을 찾을 수 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM: "새 팀을 생성할 권한이 없습니다",
	TEAM_ALREADY_EXISTS: "팀이 이미 존재합니다",
	TEAM_NOT_FOUND: "팀을 찾을 수 없습니다",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"유일한 소유자로서 조직을 탈퇴할 수 없습니다",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"소유자 없이 조직을 탈퇴할 수 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER: "이 멤버를 삭제할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"이 조직에 사용자를 초대할 권한이 없습니다",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"사용자가 이미 이 조직에 초대되었습니다",
	INVITATION_NOT_FOUND: "초대장을 찾을 수 없습니다",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
		"귀하는 초대장의 수신자가 아닙니다",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"초대를 수락하거나 거절하기 전에 이메일 인증이 필요합니다",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"초대장을 보려면 이메일 인증이 필요합니다",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"이 초대를 취소할 권한이 없습니다",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"초대자가 더 이상 조직의 멤버가 아닙니다",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"이 역할의 사용자를 초대할 권한이 없습니다",
	FAILED_TO_RETRIEVE_INVITATION: "초대장을 가져오지 못했습니다",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS: "팀 최대 수에 도달했습니다",
	UNABLE_TO_REMOVE_LAST_TEAM: "마지막 팀을 삭제할 수 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"이 멤버를 업데이트할 권한이 없습니다",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "조직 멤버 제한에 도달했습니다",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"이 조직에서 팀을 생성할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"이 조직에서 팀을 삭제할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM: "이 팀을 업데이트할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM: "이 팀을 삭제할 권한이 없습니다",
	INVITATION_LIMIT_REACHED: "초대 한도에 도달했습니다",
	TEAM_MEMBER_LIMIT_REACHED: "팀 멤버 제한에 도달했습니다",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "사용자가 팀의 멤버가 아닙니다",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"이 팀의 멤버를 조회할 권한이 없습니다",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "활성화된 팀이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"새 멤버를 생성할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"팀 멤버를 제거할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"소유자로서 이 조직에 접근할 권한이 없습니다",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION: "귀하는 이 조직의 멤버가 아닙니다",
	MISSING_AC_INSTANCE:
		"동적 액세스 제어를 사용하려면 서버 인증 플러그인에 ac 인스턴스가 미리 정의되어 있어야 합니다",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"역할을 생성하려면 조직에 속해 있어야 합니다",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "역할을 생성할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "역할을 업데이트할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "역할을 삭제할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "역할을 조회할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "역할 목록을 조회할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "역할을 가져올 권한이 없습니다",
	TOO_MANY_ROLES: "이 조직에 역할이 너무 많습니다",
	INVALID_RESOURCE: "제공된 권한에 유효하지 않은 리소스가 포함되어 있습니다",
	ROLE_NAME_IS_ALREADY_TAKEN: "해당 역할 이름은 이미 사용 중입니다",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE: "기본으로 정의된 역할은 삭제할 수 없습니다",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"멤버에게 할당된 역할은 삭제할 수 없습니다. 먼저 멤버에게 다른 역할을 할당하세요",
	INVALID_TEAM_ID: "팀 ID에 예약된 문자가 포함되어 있습니다",
};
