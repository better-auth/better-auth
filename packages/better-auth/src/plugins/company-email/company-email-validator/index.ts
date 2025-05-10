import { validate } from '../email-validator'
import free_email_provider_set from './free_email_provider_domains';

export const isCompanyEmail = (email: string) => {
    if (!validate(email)) {
        return false;
    }

    const fields = email.split('@');
    const domain = fields[1];
    return !free_email_provider_set.has(domain); 
}

export const isCompanyDomain = (domain: string) => {
    return !free_email_provider_set.has(domain);
}

export default {
    isCompanyEmail,
    isCompanyDomain
}