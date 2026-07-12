import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const viStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
	UNAUTHORIZED: "Truy cập không hợp lệ",
	INVALID_REQUEST_BODY: "Yêu cầu không hợp lệ",
	SUBSCRIPTION_NOT_FOUND: "Không tìm thấy gói đăng ký",
	SUBSCRIPTION_PLAN_NOT_FOUND: "Không tìm thấy gói cước",
	ALREADY_SUBSCRIBED_PLAN: "Bạn đã đăng ký gói cước này rồi",
	REFERENCE_ID_NOT_ALLOWED: "ID tham chiếu không được phép",
	CUSTOMER_NOT_FOUND: "Không tìm thấy khách hàng Stripe cho người dùng này",
	UNABLE_TO_CREATE_CUSTOMER: "Không thể tạo khách hàng",
	UNABLE_TO_CREATE_BILLING_PORTAL: "Không thể tạo phiên cổng thanh toán",
	STRIPE_SIGNATURE_NOT_FOUND: "Không tìm thấy chữ ký Stripe",
	STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Không tìm thấy mã bảo mật webhook Stripe",
	STRIPE_WEBHOOK_ERROR: "Lỗi webhook Stripe",
	FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Không thể tạo sự kiện Stripe",
	FAILED_TO_FETCH_PLANS: "Tải các gói cước thất bại",
	EMAIL_VERIFICATION_REQUIRED:
		"Cần xác thực email trước khi bạn có thể đăng ký một gói cước",
	SUBSCRIPTION_NOT_ACTIVE: "Gói đăng ký không hoạt động",
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"Gói đăng ký không được lên lịch hủy bỏ",
	SUBSCRIPTION_NOT_PENDING_CHANGE:
		"Gói đăng ký không có yêu cầu hủy hoặc thay đổi gói cước nào đang chờ xử lý",
	ORGANIZATION_NOT_FOUND: "Không tìm thấy tổ chức",
	ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
		"Gói đăng ký tổ chức chưa được kích hoạt",
	AUTHORIZE_REFERENCE_REQUIRED:
		"Gói đăng ký tổ chức yêu cầu cấu hình callback authorizeReference",
	ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
		"Không thể xóa tổ chức khi đang có gói đăng ký hoạt động",
	ORGANIZATION_REFERENCE_ID_REQUIRED:
		"ID tham chiếu là bắt buộc. Hãy cung cấp referenceId hoặc đặt activeOrganizationId trong phiên làm việc",
};
