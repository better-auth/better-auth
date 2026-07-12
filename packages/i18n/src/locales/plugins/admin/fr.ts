import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const frAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "Échec de la création de l'utilisateur",
	USER_ALREADY_EXISTS: "L'utilisateur existe déjà.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"L'utilisateur existe déjà. Utilisez une autre adresse e-mail.",
	YOU_CANNOT_BAN_YOURSELF: "Vous ne pouvez pas vous bannir vous-même",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"Vous n'êtes pas autorisé à modifier le rôle des utilisateurs",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
		"Vous n'êtes pas autorisé à créer des utilisateurs",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
		"Vous n'êtes pas autorisé à lister les utilisateurs",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"Vous n'êtes pas autorisé à lister les sessions des utilisateurs",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
		"Vous n'êtes pas autorisé à bannir des utilisateurs",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"Vous n'êtes pas autorisé à usurper l'identité d'utilisateurs",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"Vous n'êtes pas autorisé à révoquer les sessions des utilisateurs",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
		"Vous n'êtes pas autorisé à supprimer des utilisateurs",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"Vous n'êtes pas autorisé à définir le mot de passe des utilisateurs",
	BANNED_USER: "Vous avez été banni de cette application",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER:
		"Vous n'êtes pas autorisé à obtenir l'utilisateur",
	NO_DATA_TO_UPDATE: "Aucune donnée à mettre à jour",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
		"Vous n'êtes pas autorisé à mettre à jour des utilisateurs",
	YOU_CANNOT_REMOVE_YOURSELF: "Vous ne pouvez pas vous retirer vous-même",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"Vous n'êtes pas autorisé à définir une valeur de rôle inexistante",
	YOU_CANNOT_IMPERSONATE_ADMINS:
		"Vous ne pouvez pas usurper l'identité d'administrateurs",
	INVALID_ROLE_TYPE: "Type de rôle invalide",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"Vous n'êtes pas autorisé à mettre à jour l'e-mail des utilisateurs",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"Le mot de passe ne peut pas être mis à jour via l'e-mail ou les informations de l'utilisateur. Utilisez plutôt l'API de modification de mot de passe",
};
