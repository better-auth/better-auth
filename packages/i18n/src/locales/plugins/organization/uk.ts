import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { LocalizedTranslations } from "../../../types";

export const ukOrganization: LocalizedTranslations<
	typeof ORGANIZATION_ERROR_CODES
> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"У вас немає прав для створення нової організації",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"Ви досягли максимальної кількості організацій",
	ORGANIZATION_ALREADY_EXISTS: "Організація вже існує",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "Цей слаг організації вже зайнятий",
	ORGANIZATION_NOT_FOUND: "Організацію не знайдено",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
		"Користувач не є членом організації",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"У вас немає прав для зміни цієї організації",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"У вас немає прав для видалення цієї організації",
	NO_ACTIVE_ORGANIZATION: "Немає активної організації",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"Користувач вже є членом цієї організації",
	MEMBER_NOT_FOUND: "Член організації не знайдений",
	ROLE_NOT_FOUND: "Роль не знайдено",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
		"У вас немає прав для створення нової команди",
	TEAM_ALREADY_EXISTS: "Команда вже існує",
	TEAM_NOT_FOUND: "Команда не знайдена",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"Ви не можете залишити організацію, оскільки є єдиним власником",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"Ви не можете залишити організацію без власника",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"У вас немає прав для видалення цього члена організації",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"У вас немає прав для запрошення користувачів до цієї організації",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"Користувач вже запрошений до цієї організації",
	INVITATION_NOT_FOUND: "Запрошення не знайдено",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
		"Ви не є отримувачем цього запрошення",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"Перед прийняттям або відхиленням запрошення потрібне підтвердження email",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"Потрібне підтвердження email для перегляду запрошень",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"У вас немає прав для скасування цього запрошення",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"Запросивший користувач більше не є членом організації",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"У вас немає прав для запрошення користувача з такою роллю",
	FAILED_TO_RETRIEVE_INVITATION: "Не вдалося отримати запрошення",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"Ви досягли максимальної кількості команд",
	UNABLE_TO_REMOVE_LAST_TEAM:
		"Недійсний запит: неможливо видалити останню команду",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"У вас немає прав для зміни цього члена організації",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "Досягнуто ліміту членів організації",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"У вас немає прав для створення команд у цій організації",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"У вас нет прав для видалення команд у цій організації",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"У вас немає прав для зміни цієї команди",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
		"У вас немає прав для видалення цієї команди",
	INVITATION_LIMIT_REACHED: "Досягнуто ліміту запрошень",
	TEAM_MEMBER_LIMIT_REACHED: "Досягнуто ліміту учасників команди",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "Користувач не є членом команди",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"У вас немає прав для перегляду списку учасників цієї команди",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "У вас немає активної команди",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"У вас немає прав для додавання нового учасника",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"У вас немає прав для видалення учасника команди",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"У вас немає прав доступу до цієї організації на правах власника",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION: "Ви не є членом цієї організації",
	MISSING_AC_INSTANCE:
		"Динамічний контроль доступу вимагає наявності зумовленого інстансу ac в плагіні сервера",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"Ви повинні перебувати в організації, щоб створити роль",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "У вас немає прав для створення ролі",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "У вас немає прав для зміни ролі",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "У вас немає прав для видалення ролі",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "У вас немає прав для читання ролі",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
		"У вас немає прав для перегляду списку ролей",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "У вас немає прав для отримання ролі",
	TOO_MANY_ROLES: "В цій організації занадто багато ролей",
	INVALID_RESOURCE: "Вказаний дозвіл містить неприпустимий ресурс",
	ROLE_NAME_IS_ALREADY_TAKEN: "Ця назва ролі вже зайнята",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE: "Неможливо видалити зумовлену роль",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"Неможливо видалити роль, призначену користувачам. Спочатку перепризначте користувачів на іншу роль",
	INVALID_TEAM_ID: "ID команди містить зарезервований символ",
};
