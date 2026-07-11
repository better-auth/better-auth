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
import { twoFactorTranslations } from "./plugins/two-factor";

// ─── Core locales merged with plugin translations ─────────────────────────────

export const ar = {
	...coreAr,
	...emailOtpTranslations.ar,
	...twoFactorTranslations.ar,
};

export const bn = {
	...coreBn,
	...emailOtpTranslations.bn,
	...twoFactorTranslations.bn,
};

export const de = {
	...coreDe,
	...emailOtpTranslations.de,
	...twoFactorTranslations.de,
};

export const en = {
	...coreEn,
	...emailOtpTranslations.en,
	...twoFactorTranslations.en,
};

export const es = {
	...coreEs,
	...emailOtpTranslations.es,
	...twoFactorTranslations.es,
};

export const fa = {
	...coreFa,
	...emailOtpTranslations.fa,
	...twoFactorTranslations.fa,
};

export const fr = {
	...coreFr,
	...emailOtpTranslations.fr,
	...twoFactorTranslations.fr,
};

export const hi = {
	...coreHi,
	...emailOtpTranslations.hi,
	...twoFactorTranslations.hi,
};

export const id = {
	...coreId,
	...emailOtpTranslations.id,
	...twoFactorTranslations.id,
};

export const it = {
	...coreIt,
	...emailOtpTranslations.it,
	...twoFactorTranslations.it,
};

export const ja = {
	...coreJa,
	...emailOtpTranslations.ja,
	...twoFactorTranslations.ja,
};

export const ko = {
	...coreKo,
	...emailOtpTranslations.ko,
	...twoFactorTranslations.ko,
};

export const nl = {
	...coreNl,
	...emailOtpTranslations.nl,
	...twoFactorTranslations.nl,
};

export const pl = {
	...corePl,
	...emailOtpTranslations.pl,
	...twoFactorTranslations.pl,
};

export const pt = {
	...corePt,
	...emailOtpTranslations.pt,
	...twoFactorTranslations.pt,
};

export const ru = {
	...coreRu,
	...emailOtpTranslations.ru,
	...twoFactorTranslations.ru,
};

export const sv = {
	...coreSv,
	...emailOtpTranslations.sv,
	...twoFactorTranslations.sv,
};

export const th = {
	...coreTh,
	...emailOtpTranslations.th,
	...twoFactorTranslations.th,
};

export const tr = {
	...coreTr,
	...emailOtpTranslations.tr,
	...twoFactorTranslations.tr,
};

export const uk = {
	...coreUk,
	...emailOtpTranslations.uk,
	...twoFactorTranslations.uk,
};

export const vi = {
	...coreVi,
	...emailOtpTranslations.vi,
	...twoFactorTranslations.vi,
};

export const zh = {
	...coreZh,
	...emailOtpTranslations.zh,
	...twoFactorTranslations.zh,
};
