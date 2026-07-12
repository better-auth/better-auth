import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const thStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
	UNAUTHORIZED: "การเข้าถึงไม่ได้รับอนุญาต",
	INVALID_REQUEST_BODY: "เนื้อหาคำขอไม่ถูกต้อง",
	SUBSCRIPTION_NOT_FOUND: "ไม่พบการสมัครสมาชิก",
	SUBSCRIPTION_PLAN_NOT_FOUND: "ไม่พบแผนการสมัครสมาชิก",
	ALREADY_SUBSCRIBED_PLAN: "คุณสมัครแผนบริการนี้อยู่แล้ว",
	REFERENCE_ID_NOT_ALLOWED: "ไม่อนุญาตให้ระบุ Reference ID",
	CUSTOMER_NOT_FOUND: "ไม่พบข้อมูลลูกค้า Stripe สำหรับผู้ใช้นี้",
	UNABLE_TO_CREATE_CUSTOMER: "ไม่สามารถสร้างข้อมูลลูกค้าได้",
	UNABLE_TO_CREATE_BILLING_PORTAL: "ไม่สามารถสร้างเซสชันสำหรับพอร์ทัลชำระเงินได้",
	STRIPE_SIGNATURE_NOT_FOUND: "ไม่พบข้อมูลลายเซ็นของ Stripe",
	STRIPE_WEBHOOK_SECRET_NOT_FOUND: "ไม่พบรหัสความลับของ Stripe webhook",
	STRIPE_WEBHOOK_ERROR: "เกิดข้อผิดพลาดของ Stripe webhook",
	FAILED_TO_CONSTRUCT_STRIPE_EVENT: "การสร้างออบเจกต์เหตุการณ์ Stripe ล้มเหลว",
	FAILED_TO_FETCH_PLANS: "ดึงข้อมูลแผนล้มเหลว",
	EMAIL_VERIFICATION_REQUIRED: "จำเป็นต้องยืนยันอีเมลก่อนที่จะสามารถสมัครสมาชิกแผนได้",
	SUBSCRIPTION_NOT_ACTIVE: "การสมัครสมาชิกไม่มีผลใช้งาน",
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"ไม่มีกำหนดเวลาสำหรับการยกเลิกการสมัครสมาชิก",
	SUBSCRIPTION_NOT_PENDING_CHANGE:
		"ไม่มีการยกเลิกการสมัครสมาชิกที่รอดำเนินการหรือแผนการเปลี่ยนแผนบริการที่กำหนดเวลาไว้",
	ORGANIZATION_NOT_FOUND: "ไม่พบองค์กร",
	ORGANIZATION_SUBSCRIPTION_NOT_ENABLED: "การสมัครสมาชิกขององค์กรไม่ถูกเปิดใช้งาน",
	AUTHORIZE_REFERENCE_REQUIRED:
		"การสมัครสมาชิกขององค์กรต้องได้รับการกำหนดค่าคอลแบ็ก authorizeReference",
	ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
		"ไม่สามารถลบองค์กรที่มีการสมัครสมาชิกที่ใช้งานอยู่ได้",
	ORGANIZATION_REFERENCE_ID_REQUIRED:
		"จำเป็นต้องมีรหัสอ้างอิง โปรดระบุ referenceId หรือกำหนดค่า activeOrganizationId ในเซสชัน",
};
