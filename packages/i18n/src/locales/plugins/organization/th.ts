import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { LocalizedTranslations } from "../../../types";

export const thOrganization: LocalizedTranslations<
	typeof ORGANIZATION_ERROR_CODES
> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"คุณไม่ได้รับอนุญาตให้สร้างองค์กรใหม่",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"คุณมีจำนวนองค์กรครบตามกำหนดสูงสุดแล้ว",
	ORGANIZATION_ALREADY_EXISTS: "องค์กรมีอยู่แล้ว",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "สลักองค์กรถูกใช้งานแล้ว",
	ORGANIZATION_NOT_FOUND: "ไม่พบองค์กร",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: "ผู้ใช้ไม่ได้เป็นสมาชิกขององค์กร",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION: "คุณไม่ได้รับอนุญาตให้อัปเดตองค์กรนี้",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION: "คุณไม่ได้รับอนุญาตให้ลบองค์กรนี้",
	NO_ACTIVE_ORGANIZATION: "ไม่มีองค์กรที่เปิดใช้งานอยู่",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "ผู้ใช้เป็นสมาชิกขององค์กรนี้อยู่แล้ว",
	MEMBER_NOT_FOUND: "ไม่พบสมาชิก",
	ROLE_NOT_FOUND: "ไม่พบการกําหนดบทบาท",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM: "คุณไม่ได้รับอนุญาตให้สร้างทีมใหม่",
	TEAM_ALREADY_EXISTS: "ทีมมีอยู่แล้ว",
	TEAM_NOT_FOUND: "ไม่พบทีม",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"คุณไม่สามารถออกจากองค์กรในฐานะเจ้าของเพียงคนเดียวได้",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"คุณไม่สามารถออกจากองค์กรโดยไม่มีเจ้าของได้",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER: "คุณไม่ได้รับอนุญาตให้ลบสมาชิกรายนี้",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"คุณไม่ได้รับอนุญาตให้เชิญผู้ใช้เข้าสู่องค์กรนี้",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: "ผู้ใช้ได้รับเชิญเข้าสู่องค์กรนี้แล้ว",
	INVITATION_NOT_FOUND: "ไม่พบคำเชิญ",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "คุณไม่ใช่ผู้รับคำเชิญนี้",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"จำเป็นต้องยืนยันอีเมลก่อนยอมรับหรือปฏิเสธคำเชิญ",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION: "จำเป็นต้องยืนยันอีเมลเพื่อดูคำเชิญ",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION: "คุณไม่ได้รับอนุญาตให้ยกเลิกคำเชิญนี้",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"ผู้เชิญไม่ได้เป็นสมาชิกขององค์กรอีกต่อไป",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"คุณไม่ได้รับอนุญาตให้เชิญผู้ใช้ที่มีบทบาทนี้",
	FAILED_TO_RETRIEVE_INVITATION: "ดึงข้อมูลคำเชิญไม่สำเร็จ",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS: "คุณมีจำนวนทีมครบตามกำหนดสูงสุดแล้ว",
	UNABLE_TO_REMOVE_LAST_TEAM: "ไม่สามารถลบทีมสุดท้ายได้",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER: "คุณไม่ได้รับอนุญาตให้อัปเดตสมาชิกรายนี้",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "จำนวนสมาชิกในองค์กรถึงขีดจำกัดแล้ว",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"คุณไม่ได้รับอนุญาตให้สร้างทีมในองค์กรนี้",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"คุณไม่ได้รับอนุญาตให้ลบทีมในองค์กรนี้",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM: "คุณไม่ได้รับอนุญาตให้อัปเดตทีมนี้",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM: "คุณไม่ได้รับอนุญาตให้ลบทีมนี้",
	INVITATION_LIMIT_REACHED: "ถึงขีดจำกัดการส่งคำเชิญแล้ว",
	TEAM_MEMBER_LIMIT_REACHED: "ถึงขีดจำกัดสมาชิกในทีมแล้ว",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "ผู้ใช้ไม่ได้เป็นสมาชิกของทีม",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"คุณไม่ได้รับอนุญาตให้แสดงรายการสมาชิกของทีมนี้",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "คุณไม่มีทีมที่ใช้งานอยู่",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER: "คุณไม่ได้รับอนุญาตให้เพิ่มสมาชิกใหม่",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER: "คุณไม่ได้รับอนุญาตให้ลบสมาชิกทีมออก",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"คุณไม่ได้รับอนุญาตให้เข้าถึงองค์กรนี้ในฐานะเจ้าของ",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION: "คุณไม่ได้เป็นสมาชิกขององค์กรนี้",
	MISSING_AC_INSTANCE:
		"การควบคุมการเข้าถึงแบบไดนามิกจำเป็นต้องมีอินสแตนซ์ ac ที่กำหนดไว้ล่วงหน้าบนปลั๊กอินเซิร์ฟเวอร์",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"คุณต้องอยู่ในองค์กรก่อนจึงจะสามารถสร้างบทบาทได้",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "คุณไม่ได้รับอนุญาตให้สร้างบทบาท",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "คุณไม่ได้รับอนุญาตให้อัปเดตบทบาท",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "คุณไม่ได้รับอนุญาตให้ลบบทบาท",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "คุณไม่ได้รับอนุญาตให้อ่านบทบาท",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "คุณไม่ได้รับอนุญาตให้แสดงรายการบทบาท",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "คุณไม่ได้รับอนุญาตให้รับข้อมูลบทบาท",
	TOO_MANY_ROLES: "องค์กรนี้มีบทบาทมากเกินไป",
	INVALID_RESOURCE: "สิทธิ์ที่ระบุมีทรัพยากรที่ไม่ถูกต้อง",
	ROLE_NAME_IS_ALREADY_TAKEN: "ชื่อบทบาทนั้นถูกใช้ไปแล้ว",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE: "ไม่สามารถลบบทบาทที่กำหนดไว้ล่วงหน้าได้",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"ไม่สามารถลบบทบาทที่มีสมาชิกใช้อยู่ได้ กรุณาย้ายสมาชิกไปยังบทบาทอื่นก่อน",
	INVALID_TEAM_ID: "ID ของทีมมีอักขระที่สงวนไว้",
};
