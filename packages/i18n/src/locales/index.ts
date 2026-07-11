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

// ─── Core locales merged with plugin translations ─────────────────────────────

export const ar = {
	...coreAr,
	...phoneNumberTranslations.ar,
	...emailOtpTranslations.ar,
	...twoFactorTranslations.ar,
	...usernameTranslations.ar,
};

export const bn = {
	...coreBn,
	...phoneNumberTranslations.bn,
	...emailOtpTranslations.bn,
	...twoFactorTranslations.bn,
	...usernameTranslations.bn,
};

export const de = {
	...coreDe,
	...phoneNumberTranslations.de,
	...emailOtpTranslations.de,
	...twoFactorTranslations.de,
	...usernameTranslations.de,
};

export const en = {
	...coreEn,
	...phoneNumberTranslations.en,
	...emailOtpTranslations.en,
	...twoFactorTranslations.en,
	...usernameTranslations.en,
};

export const es = {
	...coreEs,
	...phoneNumberTranslations.es,
	...emailOtpTranslations.es,
	...twoFactorTranslations.es,
	...usernameTranslations.es,
};

export const fa = {
	...coreFa,
	...phoneNumberTranslations.fa,
	...emailOtpTranslations.fa,
	...twoFactorTranslations.fa,
	...usernameTranslations.fa,
};

export const fr = {
	...coreFr,
	...phoneNumberTranslations.fr,
	...emailOtpTranslations.fr,
	...twoFactorTranslations.fr,
	...usernameTranslations.fr,
};

export const hi = {
	...coreHi,
	...phoneNumberTranslations.hi,
	...emailOtpTranslations.hi,
	...twoFactorTranslations.hi,
	...usernameTranslations.hi,
};

export const id = {
	...coreId,
	...phoneNumberTranslations.id,
	...emailOtpTranslations.id,
	...twoFactorTranslations.id,
	...usernameTranslations.id,
};

export const it = {
	...coreIt,
	...phoneNumberTranslations.it,
	...emailOtpTranslations.it,
	...twoFactorTranslations.it,
	...usernameTranslations.it,
};

export const ja = {
	...coreJa,
	...phoneNumberTranslations.ja,
	...emailOtpTranslations.ja,
	...twoFactorTranslations.ja,
	...usernameTranslations.ja,
};

export const ko = {
	...coreKo,
	...phoneNumberTranslations.ko,
	...emailOtpTranslations.ko,
	...twoFactorTranslations.ko,
	...usernameTranslations.ko,
};

export const nl = {
	...coreNl,
	...phoneNumberTranslations.nl,
	...emailOtpTranslations.nl,
	...twoFactorTranslations.nl,
	...usernameTranslations.nl,
};

export const pl = {
	...corePl,
	...phoneNumberTranslations.pl,
	...emailOtpTranslations.pl,
	...twoFactorTranslations.pl,
	...usernameTranslations.pl,
};

export const pt = {
	...corePt,
	...phoneNumberTranslations.pt,
	...emailOtpTranslations.pt,
	...twoFactorTranslations.pt,
	...usernameTranslations.pt,
};

export const ru = {
	...coreRu,
	...phoneNumberTranslations.ru,
	...emailOtpTranslations.ru,
	...twoFactorTranslations.ru,
	...usernameTranslations.ru,
};

export const sv = {
	...coreSv,
	...phoneNumberTranslations.sv,
	...emailOtpTranslations.sv,
	...twoFactorTranslations.sv,
	...usernameTranslations.sv,
};

export const th = {
	...coreTh,
	...phoneNumberTranslations.th,
	...emailOtpTranslations.th,
	...twoFactorTranslations.th,
	...usernameTranslations.th,
};

export const tr = {
	...coreTr,
	...phoneNumberTranslations.tr,
	...emailOtpTranslations.tr,
	...twoFactorTranslations.tr,
	...usernameTranslations.tr,
};

export const uk = {
	...coreUk,
	...phoneNumberTranslations.uk,
	...emailOtpTranslations.uk,
	...twoFactorTranslations.uk,
	...usernameTranslations.uk,
};

export const vi = {
	...coreVi,
	...phoneNumberTranslations.vi,
	...emailOtpTranslations.vi,
	...twoFactorTranslations.vi,
	...usernameTranslations.vi,
};

export const zh = {
	...coreZh,
	...phoneNumberTranslations.zh,
	...emailOtpTranslations.zh,
	...twoFactorTranslations.zh,
	...usernameTranslations.zh,
};
