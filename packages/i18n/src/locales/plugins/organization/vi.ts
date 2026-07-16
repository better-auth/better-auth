import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { LocalizedTranslations } from "../../../types";

export const viOrganization: LocalizedTranslations<
	typeof ORGANIZATION_ERROR_CODES
> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"Bạn không được phép tạo tổ chức mới",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"Bạn đã đạt số lượng tổ chức tối đa",
	ORGANIZATION_ALREADY_EXISTS: "Tổ chức đã tồn tại",
	ORGANIZATION_SLUG_ALREADY_TAKEN:
		"Đường dẫn thu gọn của tổ chức đã được sử dụng",
	ORGANIZATION_NOT_FOUND: "Không tìm thấy tổ chức",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
		"Người dùng không phải thành viên của tổ chức",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"Bạn không được phép cập nhật tổ chức này",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"Bạn không được phép xóa tổ chức này",
	NO_ACTIVE_ORGANIZATION: "Không có tổ chức nào đang hoạt động",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"Người dùng đã là thành viên của tổ chức này",
	MEMBER_NOT_FOUND: "Không tìm thấy thành viên",
	ROLE_NOT_FOUND: "Không tìm thấy vai trò",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM: "Bạn không được phép tạo nhóm mới",
	TEAM_ALREADY_EXISTS: "Nhóm đã tồn tại",
	TEAM_NOT_FOUND: "Không tìm thấy nhóm",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"Bạn không thể rời tổ chức khi là chủ sở hữu duy nhất",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"Bạn không thể rời tổ chức mà không có chủ sở hữu",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"Bạn không được phép xóa thành viên này",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"Bạn không được phép mời người dùng vào tổ chức này",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"Người dùng đã được mời vào tổ chức này",
	INVITATION_NOT_FOUND: "Không tìm thấy lời mời",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
		"Bạn không phải người nhận lời mời này",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"Cần xác thực email trước khi chấp nhận hoặc từ chối lời mời",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"Cần xác thực email để xem các lời mời",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"Bạn không được phép hủy lời mời này",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"Người mời không còn là thành viên của tổ chức",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"Bạn không được phép mời người dùng với vai trò này",
	FAILED_TO_RETRIEVE_INVITATION: "Lấy thông tin lời mời thất bại",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"Bạn đã đạt số lượng nhóm tối đa",
	UNABLE_TO_REMOVE_LAST_TEAM: "Không thể xóa nhóm cuối cùng",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"Bạn không được phép cập nhật thành viên này",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
		"Đạt giới hạn số thành viên của tổ chức",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"Bạn không được phép tạo nhóm trong tổ chức này",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"Bạn không được phép xóa nhóm trong tổ chức này",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"Bạn không được phép cập nhật nhóm này",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM: "Bạn không được phép xóa nhóm này",
	INVITATION_LIMIT_REACHED: "Đạt giới hạn số lời mời",
	TEAM_MEMBER_LIMIT_REACHED: "Đạt giới hạn số thành viên nhóm",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "Người dùng không phải thành viên nhóm",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"Bạn không được xem danh sách thành viên nhóm này",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "Bạn không có nhóm nào đang hoạt động",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"Bạn không được phép tạo thành viên mới",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"Bạn không được phép xóa thành viên nhóm",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"Bạn không được phép truy cập tổ chức này với tư cách chủ sở hữu",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
		"Bạn không phải thành viên của tổ chức này",
	MISSING_AC_INSTANCE:
		"Kiểm soát truy cập động yêu cầu phiên bản ac được định nghĩa trước trên plugin máy chủ",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"Bạn phải ở trong tổ chức để tạo vai trò",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "Bạn không được phép tạo vai trò",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "Bạn không được phép cập nhật vai trò",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "Bạn không được phép xóa vai trò",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE:
		"Bạn không được phép đọc thông tin vai trò",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "Bạn không được phép liệt kê các vai trò",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE:
		"Bạn không được phép lấy thông tin vai trò",
	TOO_MANY_ROLES: "Tổ chức này có quá nhiều vai trò",
	INVALID_RESOURCE: "Quyền hạn được cung cấp bao gồm tài nguyên không hợp lệ",
	ROLE_NAME_IS_ALREADY_TAKEN: "Tên vai trò này đã được sử dụng",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE:
		"Không thể xóa vai trò được định nghĩa trước",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"Không thể xóa vai trò đã được gán cho các thành viên. Hãy gán vai trò khác cho thành viên trước",
	INVALID_TEAM_ID: "ID của nhóm chứa ký tự dự phòng",
};
