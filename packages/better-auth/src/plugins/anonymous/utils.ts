/**
 * Generate anonymous user email address
 */
export function generateAnonymousEmail(
	id: string,
	emailLocalPart = "temp",
	emailDomainName?: string,
) {
	return emailDomainName
		? `${emailLocalPart}-${id}@${emailDomainName}`
		: `${emailLocalPart}@${id}.com`;
}
