import type { haveIBeenPwned } from "better-auth/plugins";
import type { ErrorTranslations } from "../../types";

type HaveIBeenPwnedErrorCodes = ReturnType<
	typeof haveIBeenPwned
>["$ERROR_CODES"];

export const haveIBeenPwnedTranslations: ErrorTranslations<HaveIBeenPwnedErrorCodes> =
	{
		ar: {
			PASSWORD_COMPROMISED:
				"كلمة المرور التي أدخلتها مخترقة. يرجى اختيار كلمة مرور مختلفة.",
		},
		bn: {
			PASSWORD_COMPROMISED:
				"আপনার প্রবেশ করা পাসওয়ার্ডটি আপোস করা হয়েছে। অনুগ্রহ করে একটি ভিন্ন পাসওয়ার্ড বেছে নিন।",
		},
		de: {
			PASSWORD_COMPROMISED:
				"Das eingegebene Passwort wurde kompromittiert. Bitte wählen Sie ein anderes Passwort.",
		},
		en: {
			PASSWORD_COMPROMISED:
				"The password you entered has been compromised. Please choose a different password.",
		},
		es: {
			PASSWORD_COMPROMISED:
				"La contraseña que ingresaste ha sido comprometida. Por favor, elige una contraseña diferente.",
		},
		fa: {
			PASSWORD_COMPROMISED:
				"رمز عبوری که وارد کردید در معرض خطر قرار گرفته است. لطفاً رمز عبور دیگری انتخاب کنید.",
		},
		fr: {
			PASSWORD_COMPROMISED:
				"Le mot de passe que vous avez saisi a été compromis. Veuillez choisir un mot de passe différent.",
		},
		hi: {
			PASSWORD_COMPROMISED:
				"आपने जो पासवर्ड दर्ज किया है वह उजागर हो गया है। कृपया एक अलग पासवर्ड चुनें।",
		},
		id: {
			PASSWORD_COMPROMISED:
				"Kata sandi yang Anda masukkan telah dikompromikan. Harap pilih kata sandi yang berbeda.",
		},
		it: {
			PASSWORD_COMPROMISED:
				"La password che hai inserito è stata compromessa. Scegli una password diversa.",
		},
		ja: {
			PASSWORD_COMPROMISED:
				"入力したパスワードは侵害されています。別のパスワードを選択してください。",
		},
		ko: {
			PASSWORD_COMPROMISED:
				"입력하신 비밀번호가 유출된 적이 있습니다. 다른 비밀번호를 선택해 주세요.",
		},
		nl: {
			PASSWORD_COMPROMISED:
				"Het ingevoerde wachtwoord is gecompromitteerd. Kies een ander wachtwoord.",
		},
		pl: {
			PASSWORD_COMPROMISED:
				"Wprowadzone hasło zostało ujawnione. Wybierz inne hasło.",
		},
		pt: {
			PASSWORD_COMPROMISED:
				"A senha que você digitou foi comprometida. Por favor, escolha uma senha diferente.",
		},
		ru: {
			PASSWORD_COMPROMISED:
				"Введённый вами пароль был скомпрометирован. Пожалуйста, выберите другой пароль.",
		},
		sv: {
			PASSWORD_COMPROMISED:
				"Lösenordet du angav har blivit komprometterat. Välj ett annat lösenord.",
		},
		th: {
			PASSWORD_COMPROMISED: "รหัสผ่านที่คุณป้อนถูกบุกรุก กรุณาเลือกรหัสผ่านอื่น",
		},
		tr: {
			PASSWORD_COMPROMISED:
				"Girdiğiniz şifre ele geçirilmiş. Lütfen farklı bir şifre seçin.",
		},
		uk: {
			PASSWORD_COMPROMISED:
				"Введений вами пароль був скомпрометований. Будь ласка, виберіть інший пароль.",
		},
		vi: {
			PASSWORD_COMPROMISED:
				"Mật khẩu bạn nhập đã bị xâm phạm. Vui lòng chọn mật khẩu khác.",
		},
		zh: {
			PASSWORD_COMPROMISED: "您输入的密码已被泄露，请选择不同的密码。",
		},
	};
