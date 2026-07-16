import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { LocalizedTranslations } from "../../../types";

export const ruOrganization: LocalizedTranslations<
	typeof ORGANIZATION_ERROR_CODES
> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"У вас нет прав для создания новой организации",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"Вы достигли максимального количества организаций",
	ORGANIZATION_ALREADY_EXISTS: "Организация уже существует",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "Этот слаг организации уже занят",
	ORGANIZATION_NOT_FOUND: "Организация не найдена",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
		"Пользователь не является членом организации",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"У вас нет прав для изменения этой организации",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"У вас нет прав для удаления этой организации",
	NO_ACTIVE_ORGANIZATION: "Нет активной организации",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"Пользователь уже является членом этой организации",
	MEMBER_NOT_FOUND: "Член организации не найден",
	ROLE_NOT_FOUND: "Роль не найдена",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
		"У вас нет прав для создания новой команды",
	TEAM_ALREADY_EXISTS: "Команда уже существует",
	TEAM_NOT_FOUND: "Команда не найдена",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"Вы не можете покинуть организацию, так как являетесь единственным владельцем",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"Вы не можете покинуть организацию без владельца",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"У вас нет прав для удаления этого члена организации",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"У вас нет прав для приглашения пользователей в эту организацию",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"Пользователь уже приглашен в эту организацию",
	INVITATION_NOT_FOUND: "Приглашение не найдено",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
		"Вы не являетесь получателем этого приглашения",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"Перед принятием или отклонением приглашения требуется подтверждение email",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"Требуется подтверждение email для просмотра приглашений",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"У вас нет прав для отмены этого приглашения",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"Пригласивший пользователь больше не является членом организации",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"У вас нет прав для приглашения пользователя с такой ролью",
	FAILED_TO_RETRIEVE_INVITATION: "Не удалось получить приглашение",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"Вы достигли максимального количества команд",
	UNABLE_TO_REMOVE_LAST_TEAM:
		"Невозможно удалить единственную оставшуюся команду",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"У вас нет прав для изменения этого члена организации",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "Превышен лимит членов организации",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"У вас нет прав для создания команд в этой организации",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"У вас нет прав для удаления команд в этой организации",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"У вас нет прав для изменения этой команды",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
		"У вас нет прав для удаления этой команды",
	INVITATION_LIMIT_REACHED: "Превышен лимит приглашений",
	TEAM_MEMBER_LIMIT_REACHED: "Превышен лимит участников команды",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "Пользователь не является членом команды",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"У вас нет прав для просмотра списка участников этой команды",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "У вас нет активной команды",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"У вас нет прав для добавления нового участника",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"У вас нет прав для удаления участника команды",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"У вас нет прав доступа к этой организации на правах владельца",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
		"Вы не являетесь членом этой организации",
	MISSING_AC_INSTANCE:
		"Динамический контроль доступа требует наличия предопределенного инстанса ac в серверном плагине",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"Вы должны состоять в организации, чтобы создать роль",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "У вас нет прав для создания роли",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "У вас нет прав для изменения роли",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "У вас нет прав для удаления роли",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "У вас нет прав для чтения роли",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
		"У вас нет прав для просмотра списка ролей",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "У вас нет прав для получения роли",
	TOO_MANY_ROLES: "В этой организации слишком много ролей",
	INVALID_RESOURCE: "Указанное разрешение содержит недопустимый ресурс",
	ROLE_NAME_IS_ALREADY_TAKEN: "Имя роли уже занято",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE: "Невозможно удалить предопределенную роль",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"Невозможно удалить роль, назначенную пользователям. Сначала переназначьте пользователей на другую роль",
	INVALID_TEAM_ID: "ID команды содержит зарезервированный символ",
};
