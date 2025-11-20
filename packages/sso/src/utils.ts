export const validateEmailDomain = (email: string, domain: string) => {
	const emailDomain = email.split("@")[1]?.toLowerCase();
	const providerDomain = domain.toLowerCase();
	if (!emailDomain || !providerDomain) {
		return false;
	}
	return (
		emailDomain === providerDomain || emailDomain.endsWith(`.${providerDomain}`)
	);
};
