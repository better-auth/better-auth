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
};
