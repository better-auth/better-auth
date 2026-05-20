// This logic is originally from the `pluralize`
// https://github.com/blakeembrey/pluralize
/* cspell:disable */

type Rule = [RegExp, string];

const pluralRules: Rule[] = [];
const singularRules: Rule[] = [];
const uncountables: Record<string, boolean> = {};
const irregularPlurals: Record<string, string> = {};
const irregularSingles: Record<string, string> = {};

function sanitizeRule(rule: RegExp | string): RegExp {
	if (typeof rule === "string") {
		return new RegExp("^" + rule + "$", "i");
	}
	return rule;
}

function restoreCase(word: string, token: string): string {
	if (word === token) return token;
	if (word === word.toLowerCase()) return token.toLowerCase();
	if (word === word.toUpperCase()) return token.toUpperCase();
	if (word[0] === word[0]?.toUpperCase()) {
		return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
	}
	return token.toLowerCase();
}

function interpolate(str: string, args: unknown[]): string {
	return str.replace(/\$(\d{1,2})/g, (_match, index: string) => {
		const value = args[Number(index)];
		return typeof value === "string" ? value : "";
	});
}

function replace(word: string, rule: Rule): string {
	return word.replace(rule[0], (match: string, ...rest: unknown[]) => {
		const result = interpolate(rule[1], [match, ...rest]);
		if (match === "") {
			const index = Number(rest[rest.length - 2]);
			return restoreCase(word[index - 1] ?? "", result);
		}
		return restoreCase(match, result);
	});
}

function sanitizeWord(token: string, word: string, rules: Rule[]): string {
	if (!token.length || uncountables.hasOwnProperty(token)) {
		return word;
	}
	let len = rules.length;
	while (len--) {
		const rule = rules[len];
		if (rule && rule[0].test(word)) return replace(word, rule);
	}
	return word;
}

function replaceWord(
	replaceMap: Record<string, string>,
	keepMap: Record<string, string>,
	rules: Rule[],
): (word: string) => string {
	return function (word: string): string {
		const token = word.toLowerCase();
		if (keepMap.hasOwnProperty(token)) {
			return restoreCase(word, token);
		}
		if (replaceMap.hasOwnProperty(token)) {
			return restoreCase(word, replaceMap[token] ?? "");
		}
		return sanitizeWord(token, word, rules);
	};
}

function checkWord(
	replaceMap: Record<string, string>,
	keepMap: Record<string, string>,
	rules: Rule[],
): (word: string) => boolean {
	return function (word: string): boolean {
		const token = word.toLowerCase();
		if (keepMap.hasOwnProperty(token)) return true;
		if (replaceMap.hasOwnProperty(token)) return false;
		return sanitizeWord(token, token, rules) === token;
	};
}

function addPluralRule(rule: RegExp | string, replacement: string): void {
	pluralRules.push([sanitizeRule(rule), replacement]);
}

function addSingularRule(rule: RegExp | string, replacement: string): void {
	singularRules.push([sanitizeRule(rule), replacement]);
}

function addUncountableRule(word: RegExp | string): void {
	if (typeof word === "string") {
		uncountables[word.toLowerCase()] = true;
		return;
	}
	addPluralRule(word, "$0");
	addSingularRule(word, "$0");
}

function addIrregularRule(single: string, pluralForm: string): void {
	const p = pluralForm.toLowerCase();
	const s = single.toLowerCase();
	irregularSingles[s] = p;
	irregularPlurals[p] = s;
}

// Irregular rules
const irregulars: [string, string][] = [
	["I", "we"],
	["me", "us"],
	["he", "they"],
	["she", "they"],
	["them", "them"],
	["myself", "ourselves"],
	["yourself", "yourselves"],
	["itself", "themselves"],
	["herself", "themselves"],
	["himself", "themselves"],
	["themself", "themselves"],
	["is", "are"],
	["was", "were"],
	["has", "have"],
	["this", "these"],
	["that", "those"],
	["my", "our"],
	["its", "their"],
	["his", "their"],
	["her", "their"],
	["echo", "echoes"],
	["dingo", "dingoes"],
	["volcano", "volcanoes"],
	["tornado", "tornadoes"],
	["torpedo", "torpedoes"],
	["genus", "genera"],
	["viscus", "viscera"],
	["stigma", "stigmata"],
	["stoma", "stomata"],
	["dogma", "dogmata"],
	["lemma", "lemmata"],
	["schema", "schemata"],
	["anathema", "anathemata"],
	["ox", "oxen"],
	["axe", "axes"],
	["die", "dice"],
	["yes", "yeses"],
	["foot", "feet"],
	["eave", "eaves"],
	["goose", "geese"],
	["tooth", "teeth"],
	["quiz", "quizzes"],
	["human", "humans"],
	["proof", "proofs"],
	["carve", "carves"],
	["valve", "valves"],
	["looey", "looies"],
	["thief", "thieves"],
	["groove", "grooves"],
	["pickaxe", "pickaxes"],
	["passerby", "passersby"],
	["canvas", "canvases"],
];

for (const [s, p] of irregulars) {
	addIrregularRule(s, p);
}

// Pluralization rules
const pluralizationRules: [RegExp | string, string][] = [
	[/s?$/i, "s"],
	[/[^\u0000-\u007F]$/i, "$0"],
	[/([^aeiou]ese)$/i, "$1"],
	[/(ax|test)is$/i, "$1es"],
	[/(alias|[^aou]us|t[lm]as|gas|ris)$/i, "$1es"],
	[/(e[mn]u)s?$/i, "$1s"],
	[/([^l]ias|[aeiou]las|[ejzr]as|[iu]am)$/i, "$1"],
	[
		/(alumn|syllab|vir|radi|nucle|fung|cact|stimul|termin|bacill|foc|uter|loc|strat)(?:us|i)$/i,
		"$1i",
	],
	[/(alumn|alg|vertebr)(?:a|ae)$/i, "$1ae"],
	[/(seraph|cherub)(?:im)?$/i, "$1im"],
	[/(her|at|gr)o$/i, "$1oes"],
	[
		/(agend|addend|millenni|dat|extrem|bacteri|desiderat|strat|candelabr|errat|ov|symposi|curricul|automat|quor)(?:a|um)$/i,
		"$1a",
	],
	[
		/(apheli|hyperbat|periheli|asyndet|noumen|phenomen|criteri|organ|prolegomen|hedr|automat)(?:a|on)$/i,
		"$1a",
	],
	[/sis$/i, "ses"],
	[/(?:(kni|wi|li)fe|(ar|l|ea|eo|oa|hoo)f)$/i, "$1$2ves"],
	[/([^aeiouy]|qu)y$/i, "$1ies"],
	[/([^ch][ieo][ln])ey$/i, "$1ies"],
	[/(x|ch|ss|sh|zz)$/i, "$1es"],
	[/(matr|cod|mur|sil|vert|ind|append)(?:ix|ex)$/i, "$1ices"],
	[/\b((?:tit)?m|l)(?:ice|ouse)$/i, "$1ice"],
	[/(pe)(?:rson|ople)$/i, "$1ople"],
	[/(child)(?:ren)?$/i, "$1ren"],
	[/eaux$/i, "$0"],
	[/m[ae]n$/i, "men"],
	["thou", "you"],
];

for (const [rule, replacement] of pluralizationRules) {
	addPluralRule(rule, replacement);
}

// Singularization rules
const singularizationRules: [RegExp | string, string][] = [
	[/s$/i, ""],
	[/(ss)$/i, "$1"],
	[/(wi|kni|(?:after|half|high|low|mid|non|night|[^\w]|^)li)ves$/i, "$1fe"],
	[/(ar|(?:wo|[ae])l|[eo][ao])ves$/i, "$1f"],
	[/ies$/i, "y"],
	[/(dg|ss|ois|lk|ok|wn|mb|th|ch|ec|oal|is|ck|ix|sser|ts|wb)ies$/i, "$1ie"],
	[
		/\b(l|(?:neck|cross|hog|aun)?t|coll|faer|food|gen|goon|group|hipp|junk|vegg|(?:pork)?p|charl|calor|cut)ies$/i,
		"$1ie",
	],
	[/\b(mon|smil)ies$/i, "$1ey"],
	[/\b((?:tit)?m|l)ice$/i, "$1ouse"],
	[/(seraph|cherub)im$/i, "$1"],
	[
		/(x|ch|ss|sh|zz|tto|go|cho|alias|[^aou]us|t[lm]as|gas|(?:her|at|gr)o|[aeiou]ris)(?:es)?$/i,
		"$1",
	],
	[
		/(analy|diagno|parenthe|progno|synop|the|empha|cri|ne)(?:sis|ses)$/i,
		"$1sis",
	],
	[/(movie|twelve|abuse|e[mn]u)s$/i, "$1"],
	[/(test)(?:is|es)$/i, "$1is"],
	[
		/(alumn|syllab|vir|radi|nucle|fung|cact|stimul|termin|bacill|foc|uter|loc|strat)(?:us|i)$/i,
		"$1us",
	],
	[
		/(agend|addend|millenni|dat|extrem|bacteri|desiderat|strat|candelabr|errat|ov|symposi|curricul|quor)a$/i,
		"$1um",
	],
	[
		/(apheli|hyperbat|periheli|asyndet|noumen|phenomen|criteri|organ|prolegomen|hedr|automat)a$/i,
		"$1on",
	],
	[/(alumn|alg|vertebr)ae$/i, "$1a"],
	[/(cod|mur|sil|vert|ind)ices$/i, "$1ex"],
	[/(matr|append)ices$/i, "$1ix"],
	[/(pe)(rson|ople)$/i, "$1rson"],
	[/(child)ren$/i, "$1"],
	[/(eau)x?$/i, "$1"],
	[/men$/i, "man"],
];

for (const [rule, replacement] of singularizationRules) {
	addSingularRule(rule, replacement);
}

// Uncountable rules
const uncountableWords: (string | RegExp)[] = [
	"adulthood",
	"advice",
	"agenda",
	"aid",
	"aircraft",
	"alcohol",
	"ammo",
	"analytics",
	"anime",
	"athletics",
	"audio",
	"bison",
	"blood",
	"bream",
	"buffalo",
	"butter",
	"carp",
	"cash",
	"chassis",
	"chess",
	"clothing",
	"cod",
	"commerce",
	"cooperation",
	"corps",
	"debris",
	"diabetes",
	"digestion",
	"elk",
	"energy",
	"equipment",
	"excretion",
	"expertise",
	"firmware",
	"flounder",
	"fun",
	"gallows",
	"garbage",
	"graffiti",
	"hardware",
	"headquarters",
	"health",
	"herpes",
	"highjinks",
	"homework",
	"housework",
	"information",
	"jeans",
	"justice",
	"kudos",
	"labour",
	"literature",
	"machinery",
	"mackerel",
	"mail",
	"media",
	"mews",
	"moose",
	"music",
	"mud",
	"manga",
	"news",
	"only",
	"personnel",
	"pike",
	"plankton",
	"pliers",
	"police",
	"pollution",
	"premises",
	"rain",
	"research",
	"rice",
	"salmon",
	"scissors",
	"series",
	"sewage",
	"shambles",
	"shrimp",
	"software",
	"staff",
	"swine",
	"tennis",
	"traffic",
	"transportation",
	"trout",
	"tuna",
	"wealth",
	"welfare",
	"whiting",
	"wildebeest",
	"wildlife",
	"you",
	/pok[eé]mon$/i,
	/[^aeiou]ese$/i,
	/deer$/i,
	/fish$/i,
	/measles$/i,
	/o[iu]s$/i,
	/pox$/i,
	/sheep$/i,
];

for (const word of uncountableWords) {
	addUncountableRule(word);
}

/**
 * Converts a word to its plural form.
 *
 * @example
 * plural("person"); // "people"
 * plural("user"); // "users"
 */
export const plural: (word: string) => string = replaceWord(
	irregularSingles,
	irregularPlurals,
	pluralRules,
);

/**
 * Converts a word to its singular form.
 *
 * @example
 * singular("people"); // "person"
 * singular("user"); // "user"
 */
export const singular: (word: string) => string = replaceWord(
	irregularPlurals,
	irregularSingles,
	singularRules,
);

/**
 * Checks whether a word is in plural form.
 *
 * @example
 * isPlural("users"); // true
 * isPlural("user"); // false
 */
export const isPlural: (word: string) => boolean = checkWord(
	irregularSingles,
	irregularPlurals,
	pluralRules,
);

/**
 * Checks whether a word is in singular form.
 *
 * @example
 * isSingular("user"); // true
 * isSingular("users"); // false
 */
export const isSingular: (word: string) => boolean = checkWord(
	irregularPlurals,
	irregularSingles,
	singularRules,
);

/**
 * Appends "s" to the word unless it's already plural.
 *
 * This maintains backward compatibility with the naive "s" suffix approach
 * while preventing double-pluralization.
 *
 * @example
 * safePlural("user"); // "users"
 * safePlural("users"); // "users"
 */
export function safePlural(word: string): string {
	return isPlural(word) ? word : `${word}s`;
}
