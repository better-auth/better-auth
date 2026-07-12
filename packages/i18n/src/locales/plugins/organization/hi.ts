import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { LocalizedTranslations } from "../../../types";

export const hiOrganization: LocalizedTranslations<
	typeof ORGANIZATION_ERROR_CODES
> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"आपको एक नया संगठन बनाने की अनुमति नहीं है",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"आप संगठनों की अधिकतम संख्या तक पहुँच गए हैं",
	ORGANIZATION_ALREADY_EXISTS: "संगठन पहले से मौजूद है",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "संगठन स्लग पहले से ही लिया जा चुका है",
	ORGANIZATION_NOT_FOUND: "संगठन नहीं मिला",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: "उपयोगकर्ता संगठन का सदस्य नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"आपको इस संगठन को अपडेट करने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"आपको इस संगठन को हटाने की अनुमति नहीं है",
	NO_ACTIVE_ORGANIZATION: "कोई सक्रिय संगठन नहीं है",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"उपयोगकर्ता पहले से ही इस संगठन का सदस्य है",
	MEMBER_NOT_FOUND: "सदस्य नहीं मिला",
	ROLE_NOT_FOUND: "भूमिका नहीं मिली",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
		"आपको एक नई टीम बनाने की अनुमति नहीं है",
	TEAM_ALREADY_EXISTS: "टीम पहले से मौजूद है",
	TEAM_NOT_FOUND: "टीम नहीं मिली",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"आप एकमात्र स्वामी के रूप में संगठन नहीं छोड़ सकते",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"आप बिना स्वामी के संगठन नहीं छोड़ सकते",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"आपको इस सदस्य को हटाने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"आपको इस संगठन में उपयोगकर्ताओं को आमंत्रित करने की अनुमति नहीं है",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"उपयोगकर्ता को पहले से ही इस संगठन में आमंत्रित किया गया है",
	INVITATION_NOT_FOUND: "आमंत्रण नहीं मिला",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "आप आमंत्रण के प्राप्तकर्ता नहीं हैं",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"आमंत्रण स्वीकार या अस्वीकार करने से पहले ईमेल सत्यापन आवश्यक है",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"आमंत्रण देखने के लिए ईमेल सत्यापन आवश्यक है",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"आपको इस आमंत्रण को रद्द करने की अनुमति नहीं है",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"आमंत्रित करने वाला अब संगठन का सदस्य नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"आपको इस भूमिका वाले उपयोगकर्ता को आमंत्रित करने की अनुमति नहीं है",
	FAILED_TO_RETRIEVE_INVITATION: "आमंत्रण प्राप्त करने में विफल",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"आप टीमों की अधिकतम संख्या तक पहुँच गए हैं",
	UNABLE_TO_REMOVE_LAST_TEAM: "अंतिम टीम को हटाने में असमर्थ",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"आपको इस सदस्य को अपडेट करने की अनुमति नहीं है",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "संगठन सदस्यता सीमा पूरी हो गई है",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"आपको इस संगठन में टीमें बनाने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"आपको इस संगठन में टीमों को हटाने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"आपको इस टीम को अपडेट करने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM: "आपको इस टीम को हटाने की अनुमति नहीं है",
	INVITATION_LIMIT_REACHED: "आमंत्रण सीमा पूरी हो गई है",
	TEAM_MEMBER_LIMIT_REACHED: "टीम सदस्य सीमा पूरी हो गई है",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "उपयोगकर्ता टीम का सदस्य नहीं है",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"आपको इस टीम के सदस्यों को सूचीबद्ध करने की अनुमति नहीं है",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "आपके पास कोई सक्रिय टीम नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"आपको एक नया सदस्य बनाने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"आपको टीम के सदस्य को हटाने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"आपको स्वामी के रूप में इस संगठन तक पहुँचने की अनुमति नहीं है",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION: "आप इस संगठन के सदस्य नहीं हैं",
	MISSING_AC_INSTANCE:
		"डायनामिक एक्सेस कंट्रोल के लिए सर्वर प्लगइन पर एक पूर्व-निर्धारित ac इंस्टेंस की आवश्यकता होती है",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"भूमिका बनाने के लिए आपका संगठन में होना आवश्यक है",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "आपको भूमिका बनाने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "आपको भूमिका अपडेट करने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "आपको भूमिका हटाने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "आपको भूमिका पढ़ने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
		"आपको भूमिकाओं को सूचीबद्ध करने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "आपको भूमिका प्राप्त करने की अनुमति नहीं है",
	TOO_MANY_ROLES: "इस संगठन में बहुत अधिक भूमिकाएँ हैं",
	INVALID_RESOURCE: "प्रदान की गई अनुमति में एक अमान्य संसाधन शामिल है",
	ROLE_NAME_IS_ALREADY_TAKEN: "वह भूमिका नाम पहले से ही लिया जा चुका है",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE: "पूर्व-निर्धारित भूमिका को हटाया नहीं जा सकता",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"सदस्य को सौंपी गई भूमिका को हटाया नहीं जा सकता। कृपया पहले सदस्यों को एक अलग भूमिका सौंपें",
	INVALID_TEAM_ID: "टीम आईडी में एक आरक्षित वर्ण है",
};
