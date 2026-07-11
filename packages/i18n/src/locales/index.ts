// biome-ignore-all assist/source/organizeImports: plugin translation imports must follow core locale imports
import { ar as coreAr } from "./ar";
import { bn as coreBn } from "./bn";
import { de as coreDe } from "./de";
import { en as coreEn } from "./en";
import { es as coreEs } from "./es";
import { fa as coreFa } from "./fa";
import { fr as coreFr } from "./fr";
import { hi as coreHi } from "./hi";
import { id as coreId } from "./id";
import { it as coreIt } from "./it";
import { ja as coreJa } from "./ja";
import { ko as coreKo } from "./ko";
import { nl as coreNl } from "./nl";
import { pl as corePl } from "./pl";
import { pt as corePt } from "./pt";
import { ru as coreRu } from "./ru";
import { sv as coreSv } from "./sv";
import { th as coreTh } from "./th";
import { tr as coreTr } from "./tr";
import { uk as coreUk } from "./uk";
import { vi as coreVi } from "./vi";
import { zh as coreZh } from "./zh";
// Plugin translations appended last — merged with core messages
import { emailOtpTranslations } from "./plugins/email-otp";
import { phoneNumberTranslations } from "./plugins/phone-number";
import { twoFactorTranslations } from "./plugins/two-factor";
import { usernameTranslations } from "./plugins/username";
import { anonymousTranslations } from "./plugins/anonymous";
import { adminTranslations } from "./plugins/admin";
import { organizationTranslations } from "./plugins/organization";
import { multiSessionTranslations } from "./plugins/multi-session";
import { deviceAuthorizationTranslations } from "./plugins/device-authorization";
import { captchaTranslations } from "./plugins/captcha";
import { genericOAuthTranslations } from "./plugins/generic-oauth";
import { haveIBeenPwnedTranslations } from "./plugins/haveibeenpwned";
import { oauthPopupTranslations } from "./plugins/oauth-popup";

// ─── Core locales merged with plugin translations ─────────────────────────────

export const ar = {
	...coreAr,
	...phoneNumberTranslations.ar,
	...emailOtpTranslations.ar,
	...twoFactorTranslations.ar,
	...usernameTranslations.ar,
	...anonymousTranslations.ar,
	...adminTranslations.ar,
	...organizationTranslations.ar,
	...multiSessionTranslations.ar,
	...deviceAuthorizationTranslations.ar,
	...captchaTranslations.ar,
	...genericOAuthTranslations.ar,
	...haveIBeenPwnedTranslations.ar,
	...oauthPopupTranslations.ar,
};

export const bn = {
	...coreBn,
	...phoneNumberTranslations.bn,
	...emailOtpTranslations.bn,
	...twoFactorTranslations.bn,
	...usernameTranslations.bn,
	...anonymousTranslations.bn,
	...adminTranslations.bn,
	...organizationTranslations.bn,
	...multiSessionTranslations.bn,
	...deviceAuthorizationTranslations.bn,
	...captchaTranslations.bn,
	...genericOAuthTranslations.bn,
	...haveIBeenPwnedTranslations.bn,
	...oauthPopupTranslations.bn,
};

export const de = {
	...coreDe,
	...phoneNumberTranslations.de,
	...emailOtpTranslations.de,
	...twoFactorTranslations.de,
	...usernameTranslations.de,
	...anonymousTranslations.de,
	...adminTranslations.de,
	...organizationTranslations.de,
	...multiSessionTranslations.de,
	...deviceAuthorizationTranslations.de,
	...captchaTranslations.de,
	...genericOAuthTranslations.de,
	...haveIBeenPwnedTranslations.de,
	...oauthPopupTranslations.de,
};

export const en = {
	...coreEn,
	...phoneNumberTranslations.en,
	...emailOtpTranslations.en,
	...twoFactorTranslations.en,
	...usernameTranslations.en,
	...anonymousTranslations.en,
	...adminTranslations.en,
	...organizationTranslations.en,
	...multiSessionTranslations.en,
	...deviceAuthorizationTranslations.en,
	...captchaTranslations.en,
	...genericOAuthTranslations.en,
	...haveIBeenPwnedTranslations.en,
	...oauthPopupTranslations.en,
};

export const es = {
	...coreEs,
	...phoneNumberTranslations.es,
	...emailOtpTranslations.es,
	...twoFactorTranslations.es,
	...usernameTranslations.es,
	...anonymousTranslations.es,
	...adminTranslations.es,
	...organizationTranslations.es,
	...multiSessionTranslations.es,
	...deviceAuthorizationTranslations.es,
	...captchaTranslations.es,
	...genericOAuthTranslations.es,
	...haveIBeenPwnedTranslations.es,
	...oauthPopupTranslations.es,
};

export const fa = {
	...coreFa,
	...phoneNumberTranslations.fa,
	...emailOtpTranslations.fa,
	...twoFactorTranslations.fa,
	...usernameTranslations.fa,
	...anonymousTranslations.fa,
	...adminTranslations.fa,
	...organizationTranslations.fa,
	...multiSessionTranslations.fa,
	...deviceAuthorizationTranslations.fa,
	...captchaTranslations.fa,
	...genericOAuthTranslations.fa,
	...haveIBeenPwnedTranslations.fa,
	...oauthPopupTranslations.fa,
};

export const fr = {
	...coreFr,
	...phoneNumberTranslations.fr,
	...emailOtpTranslations.fr,
	...twoFactorTranslations.fr,
	...usernameTranslations.fr,
	...anonymousTranslations.fr,
	...adminTranslations.fr,
	...organizationTranslations.fr,
	...multiSessionTranslations.fr,
	...deviceAuthorizationTranslations.fr,
	...captchaTranslations.fr,
	...genericOAuthTranslations.fr,
	...haveIBeenPwnedTranslations.fr,
	...oauthPopupTranslations.fr,
};

export const hi = {
	...coreHi,
	...phoneNumberTranslations.hi,
	...emailOtpTranslations.hi,
	...twoFactorTranslations.hi,
	...usernameTranslations.hi,
	...anonymousTranslations.hi,
	...adminTranslations.hi,
	...organizationTranslations.hi,
	...multiSessionTranslations.hi,
	...deviceAuthorizationTranslations.hi,
	...captchaTranslations.hi,
	...genericOAuthTranslations.hi,
	...haveIBeenPwnedTranslations.hi,
	...oauthPopupTranslations.hi,
};

export const id = {
	...coreId,
	...phoneNumberTranslations.id,
	...emailOtpTranslations.id,
	...twoFactorTranslations.id,
	...usernameTranslations.id,
	...anonymousTranslations.id,
	...adminTranslations.id,
	...organizationTranslations.id,
	...multiSessionTranslations.id,
	...deviceAuthorizationTranslations.id,
	...captchaTranslations.id,
	...genericOAuthTranslations.id,
	...haveIBeenPwnedTranslations.id,
	...oauthPopupTranslations.id,
};

export const it = {
	...coreIt,
	...phoneNumberTranslations.it,
	...emailOtpTranslations.it,
	...twoFactorTranslations.it,
	...usernameTranslations.it,
	...anonymousTranslations.it,
	...adminTranslations.it,
	...organizationTranslations.it,
	...multiSessionTranslations.it,
	...deviceAuthorizationTranslations.it,
	...captchaTranslations.it,
	...genericOAuthTranslations.it,
	...haveIBeenPwnedTranslations.it,
	...oauthPopupTranslations.it,
};

export const ja = {
	...coreJa,
	...phoneNumberTranslations.ja,
	...emailOtpTranslations.ja,
	...twoFactorTranslations.ja,
	...usernameTranslations.ja,
	...anonymousTranslations.ja,
	...adminTranslations.ja,
	...organizationTranslations.ja,
	...multiSessionTranslations.ja,
	...deviceAuthorizationTranslations.ja,
	...captchaTranslations.ja,
	...genericOAuthTranslations.ja,
	...haveIBeenPwnedTranslations.ja,
	...oauthPopupTranslations.ja,
};

export const ko = {
	...coreKo,
	...phoneNumberTranslations.ko,
	...emailOtpTranslations.ko,
	...twoFactorTranslations.ko,
	...usernameTranslations.ko,
	...anonymousTranslations.ko,
	...adminTranslations.ko,
	...organizationTranslations.ko,
	...multiSessionTranslations.ko,
	...deviceAuthorizationTranslations.ko,
	...captchaTranslations.ko,
	...genericOAuthTranslations.ko,
	...haveIBeenPwnedTranslations.ko,
	...oauthPopupTranslations.ko,
};

export const nl = {
	...coreNl,
	...phoneNumberTranslations.nl,
	...emailOtpTranslations.nl,
	...twoFactorTranslations.nl,
	...usernameTranslations.nl,
	...anonymousTranslations.nl,
	...adminTranslations.nl,
	...organizationTranslations.nl,
	...multiSessionTranslations.nl,
	...deviceAuthorizationTranslations.nl,
	...captchaTranslations.nl,
	...genericOAuthTranslations.nl,
	...haveIBeenPwnedTranslations.nl,
	...oauthPopupTranslations.nl,
};

export const pl = {
	...corePl,
	...phoneNumberTranslations.pl,
	...emailOtpTranslations.pl,
	...twoFactorTranslations.pl,
	...usernameTranslations.pl,
	...anonymousTranslations.pl,
	...adminTranslations.pl,
	...organizationTranslations.pl,
	...multiSessionTranslations.pl,
	...deviceAuthorizationTranslations.pl,
	...captchaTranslations.pl,
	...genericOAuthTranslations.pl,
	...haveIBeenPwnedTranslations.pl,
	...oauthPopupTranslations.pl,
};

export const pt = {
	...corePt,
	...phoneNumberTranslations.pt,
	...emailOtpTranslations.pt,
	...twoFactorTranslations.pt,
	...usernameTranslations.pt,
	...anonymousTranslations.pt,
	...adminTranslations.pt,
	...organizationTranslations.pt,
	...multiSessionTranslations.pt,
	...deviceAuthorizationTranslations.pt,
	...captchaTranslations.pt,
	...genericOAuthTranslations.pt,
	...haveIBeenPwnedTranslations.pt,
	...oauthPopupTranslations.pt,
};

export const ru = {
	...coreRu,
	...phoneNumberTranslations.ru,
	...emailOtpTranslations.ru,
	...twoFactorTranslations.ru,
	...usernameTranslations.ru,
	...anonymousTranslations.ru,
	...adminTranslations.ru,
	...organizationTranslations.ru,
	...multiSessionTranslations.ru,
	...deviceAuthorizationTranslations.ru,
	...captchaTranslations.ru,
	...genericOAuthTranslations.ru,
	...haveIBeenPwnedTranslations.ru,
	...oauthPopupTranslations.ru,
};

export const sv = {
	...coreSv,
	...phoneNumberTranslations.sv,
	...emailOtpTranslations.sv,
	...twoFactorTranslations.sv,
	...usernameTranslations.sv,
	...anonymousTranslations.sv,
	...adminTranslations.sv,
	...organizationTranslations.sv,
	...multiSessionTranslations.sv,
	...deviceAuthorizationTranslations.sv,
	...captchaTranslations.sv,
	...genericOAuthTranslations.sv,
	...haveIBeenPwnedTranslations.sv,
	...oauthPopupTranslations.sv,
};

export const th = {
	...coreTh,
	...phoneNumberTranslations.th,
	...emailOtpTranslations.th,
	...twoFactorTranslations.th,
	...usernameTranslations.th,
	...anonymousTranslations.th,
	...adminTranslations.th,
	...organizationTranslations.th,
	...multiSessionTranslations.th,
	...deviceAuthorizationTranslations.th,
	...captchaTranslations.th,
	...genericOAuthTranslations.th,
	...haveIBeenPwnedTranslations.th,
	...oauthPopupTranslations.th,
};

export const tr = {
	...coreTr,
	...phoneNumberTranslations.tr,
	...emailOtpTranslations.tr,
	...twoFactorTranslations.tr,
	...usernameTranslations.tr,
	...anonymousTranslations.tr,
	...adminTranslations.tr,
	...organizationTranslations.tr,
	...multiSessionTranslations.tr,
	...deviceAuthorizationTranslations.tr,
	...captchaTranslations.tr,
	...genericOAuthTranslations.tr,
	...haveIBeenPwnedTranslations.tr,
	...oauthPopupTranslations.tr,
};

export const uk = {
	...coreUk,
	...phoneNumberTranslations.uk,
	...emailOtpTranslations.uk,
	...twoFactorTranslations.uk,
	...usernameTranslations.uk,
	...anonymousTranslations.uk,
	...adminTranslations.uk,
	...organizationTranslations.uk,
	...multiSessionTranslations.uk,
	...deviceAuthorizationTranslations.uk,
	...captchaTranslations.uk,
	...genericOAuthTranslations.uk,
	...haveIBeenPwnedTranslations.uk,
	...oauthPopupTranslations.uk,
};

export const vi = {
	...coreVi,
	...phoneNumberTranslations.vi,
	...emailOtpTranslations.vi,
	...twoFactorTranslations.vi,
	...usernameTranslations.vi,
	...anonymousTranslations.vi,
	...adminTranslations.vi,
	...organizationTranslations.vi,
	...multiSessionTranslations.vi,
	...deviceAuthorizationTranslations.vi,
	...captchaTranslations.vi,
	...genericOAuthTranslations.vi,
	...haveIBeenPwnedTranslations.vi,
	...oauthPopupTranslations.vi,
};

export const zh = {
	...coreZh,
	...phoneNumberTranslations.zh,
	...emailOtpTranslations.zh,
	...twoFactorTranslations.zh,
	...usernameTranslations.zh,
	...anonymousTranslations.zh,
	...adminTranslations.zh,
	...organizationTranslations.zh,
	...multiSessionTranslations.zh,
	...deviceAuthorizationTranslations.zh,
	...captchaTranslations.zh,
	...genericOAuthTranslations.zh,
	...haveIBeenPwnedTranslations.zh,
	...oauthPopupTranslations.zh,
};
