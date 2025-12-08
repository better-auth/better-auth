import { randomUUID } from "node:crypto";
import type { createServer } from "node:http";
import { betterFetch } from "@better-fetch/fetch";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { setCookieToHeader } from "better-auth/cookies";
import { bearer } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import bodyParser from "body-parser";
import type {
	Application as ExpressApp,
	Request as ExpressRequest,
	Response as ExpressResponse,
} from "express";
import express from "express";
import * as saml from "samlify";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { sso } from ".";
import { ssoClient } from "./client";

const spMetadata = `
    <md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="http://localhost:3001/api/sso/saml2/sp/metadata">
    <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        <md:KeyDescriptor use="signing">
        <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
            <ds:X509Data>
            <ds:X509Certificate>MIIE3jCCAsYCCQDE5FzoAkixzzANBgkqhkiG9w0BAQsFADAxMQswCQYDVQQGEwJVUzEQMA4GA1UECAwHRmxvcmlkYTEQMA4GA1UEBwwHT3JsYW5kbzAeFw0yMzExMTkxMjUyMTVaFw0zMzExMTYxMjUyMTVaMDExCzAJBgNVBAYTAlVTMRAwDgYDVQQIDAdGbG9yaWRhMRAwDgYDVQQHDAdPcmxhbmRvMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA2ELJsLZs4yBH7a2U5pA7xw+Oiut7b/ROKh2BqSTKRbEG4xy7WwljT02Mh7GTjLvswtZSUObWFO5v14HNORa3+J9JT2DH+9F+FJ770HX8a3cKYBNQt3xP4IeUyjI3QWzrGtkYPwSZ74tDpAUtuqPAxtoCaZXFDtX6lvCJDqiPnfxRZrKkepYWINSwu4DRpg6KoiPWRCYTsEcCzImInzlACdM97jpG1gLGA6a4dmjalQbRtvC56N0Z56gIhYq2F5JdzB2a10pqoIY8ggXZGIJS9I++8mmdTj6So5pPxLwnCYUhwDew1/DMbi9xIwYozs9pEtHCTn1l34jldDwTziVAxGQZO7QUuoMl997zqcPS7pVWRnfz5odKuytLvQDA0lRVfzOxtqbM3qVhoLT2iDmnuEtlZzgfbt4WEuT2538qxZJkFRpZQIrTj3ybqmWAv36Cp49dfeMwaqjhfX7/mVfbsPMSC653DSZBB+n+Uz0FC3QhH+vIdNhXNAQ5tBseHUR6pXiMnLtI/WVbMvpvFwK2faFTcx1oaP/Qk6yCq66tJvPbnatT9qGF8rdBJmAk9aBdQTI+hAh5mDtDweCrgVL+Tm/+Q85hSl4HGzH/LhLVS478tZVX+o+0yorZ35LCW3e4v8iX+1VEGSdg2ooOWtbSSXK2cYZr8ilyUQp0KueenR0CAwEAATANBgkqhkiG9w0BAQsFAAOCAgEAsonAahruWuHlYbDNQVD0ryhL/b+ttKKqVeT87XYDkvVhlSSSVAKcCwK/UU6z8Ty9dODUkd93Qsbof8fGMlXeYCtDHMRanvWLtk4wVkAMyNkDYHzJ1FbO7v44ZBbqNzSLy2kosbRELlcz+P3/42xumlDqAw/k13tWUdlLDxb0pd8R5yBev6HkIdJBIWtKmUuI+e8F/yTNf5kY7HO1p0NeKdVeZw4Ydw33+BwVxVNmhIxzdP5ZFQv0XRFWhCMo/6RLEepCvWUp/T1WRFqgwAdURaQrvvfpjO/Ls+neht1SWDeP8RRgsDrXIc3gZfaD8q4liIDTZ6HsFi7FmLbZatU8jJ4pCstxQLCvmix+1zF6Fwa9V5OApSTbVqBOsDZbJxeAoSzy5Wx28wufAZT4Kc/OaViXPV5o/ordPs4EYKgd/eNFCgIsZYXe75rYXqnieAIfJEGddsLBpqlgLkwvf5KVS4QNqqX+2YubP63y+3sICq2ScdhO3LZs3nlqQ/SgMiJnCBbDUDZ9GGgJNJVVytcSz5IDQHeflrq/zTt1c4q1DO3CS7mimAnTCjetERRQ3mgY/2hRiuCDFj3Cy7QMjFs3vBsbWrjNWlqyveFmHDRkq34Om7eA2jl3LZ5u7vSm0/ylp/vtoysMjwEmw/0NA3hZPTG3OJxcvFcXBsz0SiFcd1U=</ds:X509Certificate>
            </ds:X509Data>
        </ds:KeyInfo>
        </md:KeyDescriptor>
        <md:KeyDescriptor use="encryption">
        <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
            <ds:X509Data>
            <ds:X509Certificate>MIIE3jCCAsYCCQDE5FzoAkixzzANBgkqhkiG9w0BAQsFADAxMQswCQYDVQQGEwJVUzEQMA4GA1UECAwHRmxvcmlkYTEQMA4GA1UEBwwHT3JsYW5kbzAeFw0yMzExMTkxMjUyMTVaFw0zMzExMTYxMjUyMTVaMDExCzAJBgNVBAYTAlVTMRAwDgYDVQQIDAdGbG9yaWRhMRAwDgYDVQQHDAdPcmxhbmRvMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA2ELJsLZs4yBH7a2U5pA7xw+Oiut7b/ROKh2BqSTKRbEG4xy7WwljT02Mh7GTjLvswtZSUObWFO5v14HNORa3+J9JT2DH+9F+FJ770HX8a3cKYBNQt3xP4IeUyjI3QWzrGtkYPwSZ74tDpAUtuqPAxtoCaZXFDtX6lvCJDqiPnfxRZrKkepYWINSwu4DRpg6KoiPWRCYTsEcCzImInzlACdM97jpG1gLGA6a4dmjalQbRtvC56N0Z56gIhYq2F5JdzB2a10pqoIY8ggXZGIJS9I++8mmdTj6So5pPxLwnCYUhwDew1/DMbi9xIwYozs9pEtHCTn1l34jldDwTziVAxGQZO7QUuoMl997zqcPS7pVWRnfz5odKuytLvQDA0lRVfzOxtqbM3qVhoLT2iDmnuEtlZzgfbt4WEuT2538qxZJkFRpZQIrTj3ybqmWAv36Cp49dfeMwaqjhfX7/mVfbsPMSC653DSZBB+n+Uz0FC3QhH+vIdNhXNAQ5tBseHUR6pXiMnLtI/WVbMvpvFwK2faFTcx1oaP/Qk6yCq66tJvPbnatT9qGF8rdBJmAk9aBdQTI+hAh5mDtDweCrgVL+Tm/+Q85hSl4HGzH/LhLVS478tZVX+o+0yorZ35LCW3e4v8iX+1VEGSdg2ooOWtbSSXK2cYZr8ilyUQp0KueenR0CAwEAATANBgkqhkiG9w0BAQsFAAOCAgEAsonAahruWuHlYbDNQVD0ryhL/b+ttKKqVeT87XYDkvVhlSSSVAKcCwK/UU6z8Ty9dODUkd93Qsbof8fGMlXeYCtDHMRanvWLtk4wVkAMyNkDYHzJ1FbO7v44ZBbqNzSLy2kosbRELlcz+P3/42xumlDqAw/k13tWUdlLDxb0pd8R5yBev6HkIdJBIWtKmUuI+e8F/yTNf5kY7HO1p0NeKdVeZw4Ydw33+BwVxVNmhIxzdP5ZFQv0XRFWhCMo/6RLEepCvWUp/T1WRFqgwAdURaQrvvfpjO/Ls+neht1SWDeP8RRgsDrXIc3gZfaD8q4liIDTZ6HsFi7FmLbZatU8jJ4pCstxQLCvmix+1zF6Fwa9V5OApSTbVqBOsDZbJxeAoSzy5Wx28wufAZT4Kc/OaViXPV5o/ordPs4EYKgd/eNFCgIsZYXe75rYXqnieAIfJEGddsLBpqlgLkwvf5KVS4QNqqX+2YubP63y+3sICq2ScdhO3LZs3nlqQ/SgMiJnCBbDUDZ9GGgJNJVVytcSz5IDQHeflrq/zTt1c4q1DO3CS7mimAnTCjetERRQ3mgY/2hRiuCDFj3Cy7QMjFs3vBsbWrjNWlqyveFmHDRkq34Om7eA2jl3LZ5u7vSm0/ylp/vtoysMjwEmw/0NA3hZPTG3OJxcvFcXBsz0SiFcd1U=</ds:X509Certificate>
            </ds:X509Data>
        </ds:KeyInfo>
        </md:KeyDescriptor>
        <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="http://localhost:3001/api/sso/saml2/sp/sls"/>
        <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
        <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="http://localhost:3001/api/sso/saml2/sp/acs" index="1"/>
        <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="http://localhost:3001/api/sso/saml2/sp/acs" index="1"/>
        </md:SPSSODescriptor>
    <md:Organization>
        <md:OrganizationName xml:lang="en-US">Organization Name</md:OrganizationName>
        <md:OrganizationDisplayName xml:lang="en-US">Organization DisplayName</md:OrganizationDisplayName>
        <md:OrganizationURL xml:lang="en-US">http://localhost:3001/</md:OrganizationURL>
    </md:Organization>
    <md:ContactPerson contactType="technical">
        <md:GivenName>Technical Contact Name</md:GivenName>
        <md:EmailAddress>technical_contact@gmail.com</md:EmailAddress>
    </md:ContactPerson>
    <md:ContactPerson contactType="support">
        <md:GivenName>Support Contact Name</md:GivenName>
        <md:EmailAddress>support_contact@gmail.com</md:EmailAddress>
    </md:ContactPerson>
    </md:EntityDescriptor>
    `;
const idpMetadata = `
    <md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="http://localhost:8081/api/sso/saml2/idp/metadata">
    <md:IDPSSODescriptor WantAuthnRequestsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        <md:KeyDescriptor use="signing">
        <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
            <ds:X509Data>
            <ds:X509Certificate>MIIFOjCCAyICCQCqP5DN+xQZDjANBgkqhkiG9w0BAQsFADBfMQswCQYDVQQGEwJVUzEQMA4GA1UECAwHRmxvcmlkYTEQMA4GA1UEBwwHT3JsYW5kbzENMAsGA1UECgwEVGVzdDEdMBsGCSqGSIb3DQEJARYOdGVzdEBnbWFpbC5jb20wHhcNMjMxMTE5MTIzNzE3WhcNMzMxMTE2MTIzNzE3WjBfMQswCQYDVQQGEwJVUzEQMA4GA1UECAwHRmxvcmlkYTEQMA4GA1UEBwwHT3JsYW5kbzENMAsGA1UECgwEVGVzdDEdMBsGCSqGSIb3DQEJARYOdGVzdEBnbWFpbC5jb20wggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQD5giLoLyED41IHt0RxB/k6x4K0vzAKiGecPyedRNR1oyiv3OYkuG5jgTE2wcPZc7kD1Eg5d6th0BWHy/ovaNS5mkgnOV6jKkMaWW4sCMSnLnaWy0seftPK3O4mNeZpM5e9amj2gXnZvKrK8cqnJ/bsUUQvXxttXNVVmOHWg/t3c2vJ4XuUfph6wIKbrj297ILzuAFRNvAVxeS0tElwepvZ5Wbf7Hc1MORAqTpw/mp8cRjHRzYCA9y6OM4hgVs1gvTJS8WGoMmsdAZHaOnv9vLJvW3jDLQQecOheYIJncWgcESzJFIkmXadorYCEfWhwwBdVphknmeLr4BMpJBclAYaFjYDLIKpMcXYO5k/2r3BgSPlw4oqbxbR5geD05myKYtZ/wNUtku118NjhIfJFulU/kfDcp1rYYkvzgBfqr80wgNps4oQzVr1mnpgHsSTAhXMuZbaTByJRmPqecyvyQqRQcRIN0oTLJNGyzoUf0RkH6DKJ4+7qDhlq4Zhlfso9OFMv9xeONfIrJo5HtTfFZfidkXZqir2ZqwqNlNOMfK5DsYq37x2Gkgqig4nqLpITXyxfnQpL2HsaoFrlctt/OL+Zqba7NT4heYk9GX8qlAS+Ipsv6T2HSANbah55oSS3uvcrDOug2Zq7+GYMLKS1IKUKhwX+wLMxmMwSJQ9ZgFwfQIDAQABMA0GCSqGSIb3DQEBCwUAA4ICAQCkGPZdflocTSXIe5bbehsBn/IPdyb38eH2HaAvWqO2XNcDcq+6/uLc8BVK4JMa3AFS9xtBza7MOXN/lw/Ccb8uJGVNUE31+rTvsJaDtMCQkp+9aG04I1BonEHfSB0ANcTy/Gp+4hKyFCd6x35uyPO7CWX5Z8I87q9LF6Dte3/v1j7VZgDjAi9yHpBJv9Xje33AK1vF+WmEfDUOi8y2B8htVeoyS3owln3ZUbnmJdCmMp2BMRq63ymINwklEaYaNrp1L201bSqNdKZF2sNwROWyDX+WFYgufrnzPYb6HS8gYb4oEZmaG5cBM7Hs730/3BlbHKhxNTy1Io2TVCYcMQD+ieiVg5e5eGTwaPYGuVvY3NVhO8FaYBG7K2NT2hqutdCMaQpGyHEzbbbTY1afhbeMmWWqivRnVJNDv4kgBc2SE8JO82qHikIW9Om0cghC5xwTT+1JTtxxD1KeC1M1IwLzzuuMmwJSKAsv4duDqN+YRIP78J2SlrssqlsmoF8+48e7Vzr7JRT/Ya274P8RpUPNtxTR7WDmZ4tunqXjiBpz6l0uTtVXnj5UBo4HCyRjWJOGf15OCuQX03qz8tKn1IbZUf723qrmSF+cxBwHqpAywqhTSsaLjIXKnQ0UlMov7QWb0a5N07JZMdMSerbHvbXd/z9S1Ssea2+EGuTYuQur3A==</ds:X509Certificate>
            </ds:X509Data>
        </ds:KeyInfo>
        </md:KeyDescriptor>
        <md:KeyDescriptor use="encryption">
        <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
            <ds:X509Data>
            <ds:X509Certificate>MIIFOjCCAyICCQCqP5DN+xQZDjANBgkqhkiG9w0BAQsFADBfMQswCQYDVQQGEwJVUzEQMA4GA1UECAwHRmxvcmlkYTEQMA4GA1UEBwwHT3JsYW5kbzENMAsGA1UECgwEVGVzdDEdMBsGCSqGSIb3DQEJARYOdGVzdEBnbWFpbC5jb20wHhcNMjMxMTE5MTIzNzE3WhcNMzMxMTE2MTIzNzE3WjBfMQswCQYDVQQGEwJVUzEQMA4GA1UECAwHRmxvcmlkYTEQMA4GA1UEBwwHT3JsYW5kbzENMAsGA1UECgwEVGVzdDEdMBsGCSqGSIb3DQEJARYOdGVzdEBnbWFpbC5jb20wggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQD5giLoLyED41IHt0RxB/k6x4K0vzAKiGecPyedRNR1oyiv3OYkuG5jgTE2wcPZc7kD1Eg5d6th0BWHy/ovaNS5mkgnOV6jKkMaWW4sCMSnLnaWy0seftPK3O4mNeZpM5e9amj2gXnZvKrK8cqnJ/bsUUQvXxttXNVVmOHWg/t3c2vJ4XuUfph6wIKbrj297ILzuAFRNvAVxeS0tElwepvZ5Wbf7Hc1MORAqTpw/mp8cRjHRzYCA9y6OM4hgVs1gvTJS8WGoMmsdAZHaOnv9vLJvW3jDLQQecOheYIJncWgcESzJFIkmXadorYCEfWhwwBdVphknmeLr4BMpJBclAYaFjYDLIKpMcXYO5k/2r3BgSPlw4oqbxbR5geD05myKYtZ/wNUtku118NjhIfJFulU/kfDcp1rYYkvzgBfqr80wgNps4oQzVr1mnpgHsSTAhXMuZbaTByJRmPqecyvyQqRQcRIN0oTLJNGyzoUf0RkH6DKJ4+7qDhlq4Zhlfso9OFMv9xeONfIrJo5HtTfFZfidkXZqir2ZqwqNlNOMfK5DsYq37x2Gkgqig4nqLpITXyxfnQpL2HsaoFrlctt/OL+Zqba7NT4heYk9GX8qlAS+Ipsv6T2HSANbah55oSS3uvcrDOug2Zq7+GYMLKS1IKUKhwX+wLMxmMwSJQ9ZgFwfQIDAQABMA0GCSqGSIb3DQEBCwUAA4ICAQCkGPZdflocTSXIe5bbehsBn/IPdyb38eH2HaAvWqO2XNcDcq+6/uLc8BVK4JMa3AFS9xtBza7MOXN/lw/Ccb8uJGVNUE31+rTvsJaDtMCQkp+9aG04I1BonEHfSB0ANcTy/Gp+4hKyFCd6x35uyPO7CWX5Z8I87q9LF6Dte3/v1j7VZgDjAi9yHpBJv9Xje33AK1vF+WmEfDUOi8y2B8htVeoyS3owln3ZUbnmJdCmMp2BMRq63ymINwklEaYaNrp1L201bSqNdKZF2sNwROWyDX+WFYgufrnzPYb6HS8gYb4oEZmaG5cBM7Hs730/3BlbHKhxNTy1Io2TVCYcMQD+ieiVg5e5eGTwaPYGuVvY3NVhO8FaYBG7K2NT2hqutdCMaQpGyHEzbbbTY1afhbeMmWWqivRnVJNDv4kgBc2SE8JO82qHikIW9Om0cghC5xwTT+1JTtxxD1KeC1M1IwLzzuuMmwJSKAsv4duDqN+YRIP78J2SlrssqlsmoF8+48e7Vzr7JRT/Ya274P8RpUPNtxTR7WDmZ4tunqXjiBpz6l0uTtVXnj5UBo4HCyRjWJOGf15OCuQX03qz8tKn1IbZUf723qrmSF+cxBwHqpAywqhTSsaLjIXKnQ0UlMov7QWb0a5N07JZMdMSerbHvbXd/z9S1Ssea2+EGuTYuQur3A==</ds:X509Certificate>
            </ds:X509Data>
        </ds:KeyInfo>
        </md:KeyDescriptor>
        <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="http://localhost:8081/api/sso/saml2/idp/slo"/>
        <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
        <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="http://localhost:8081/api/sso/saml2/idp/redirect"/>
        <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="http://localhost:8081/api/sso/saml2/idp/post"/>
        </md:IDPSSODescriptor>
    <md:Organization>
        <md:OrganizationName xml:lang="en-US">Your Organization Name</md:OrganizationName>
        <md:OrganizationDisplayName xml:lang="en-US">Your Organization DisplayName</md:OrganizationDisplayName>
        <md:OrganizationURL xml:lang="en-US">http://localhost:8081</md:OrganizationURL>
    </md:Organization>
    <md:ContactPerson contactType="technical">
        <md:GivenName>Technical Contact Name</md:GivenName>
        <md:EmailAddress>technical_contact@gmail.com</md:EmailAddress>
    </md:ContactPerson>
    <md:ContactPerson contactType="support">
        <md:GivenName>Support Contact Name</md:GivenName>
        <md:EmailAddress>support_contact@gmail.com</md:EmailAddress>
    </md:ContactPerson>
    </md:EntityDescriptor>
    `;
const idPk = `
    -----BEGIN RSA PRIVATE KEY-----
    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
    -----END RSA PRIVATE KEY-----

    `;
const spPrivateKey = `
    -----BEGIN RSA PRIVATE KEY-----
    Proc-Type: 4,ENCRYPTED
    DEK-Info: DES-EDE3-CBC,9C86371F0420A091

    77TqgiK/IYRgO5w3ZMyV81/gk0zN5wPTGWxoztNFjQKXCySFnrL30kUqlGituBxX
    VgxwXbkoYMrd5MoDZKL5EJuf0H59hq92O0+3uwJA8QyZjOm4brQcjXKmIrkvihgs
    FvpaJiGzp6kS/O7vFBDNTQWr9yY9Y3FBPcmOUWufpRp4Q5nhpSlqnMmIqZyWQUL/
    YJSJETtzJVsk38lCqIxxDT3LtbGySahj0jRuRqspAZQeLTpnJqzNMC4vnJew9luC
    R+UffrX7gVsnwOhNtyRzYaMsLnbRfXT8Jqx2gRHg36GxkOVgyU7e62nk9CzeC0WA
    kHHCNVqqivRx9/EC0mQkkRgRzo3BZWp0o671sUsGTy57JhktiGfTnWMrl7ZfhAza
    SZnjyTwuI1bTQipIkNI3aJBTP/o/gNUE1sj5D5FZlFdpq5ks2Vxww3GNx1FRrvWd
    98z5CNt78ZR0ihLmdz/EakEBKBUteQu/5zPLUlwmGuou4wPuEHG2BsjGzb/d5Zfc
    ElIjUV+yrMmGHvBfPyPnDUrCUyLn18S1NZiCMCdN5PqCybjhk8oMPYZhWBqp8Ymr
    yHIC7BCnTJhIvgQZR6M68NwVv0aBBgH/I/DB0jADo6/B5Eajwus9i6zSv8QIbqhw
    fusKtI04vxc91aP0GWRr0J/O4mkxXYNPfa3a/I7sGTXGl0k0CygckE3fLXRy/WEk
    ikZt4UHqg5ZQ8vc5NSAM5f5Yx/72CU1I6ehFtxHsyE5yndpZXWp2X2S4l31e8fLs
    ddOoybroJgbyLrh7JT3Yac3XOEsKATWIvqU+hNYq6KwqLWev9jInHVgjzfyOKbmF
    hkrzDDHaKULYZuTsUq5mLc1SzSu98lXYfXp1WE4XsH0X0VicPzf8ZH4Kutuig0VG
    5Kg9HB/Cin65VMm0ffEiTraO6johIlwFGRrtAs38ONKgsPCQUv7ee9SEGOHViNZq
    NpWPr1KOzbI4wEB1ueKoZuEQ0a+tzfJgszJrM48bM82J6iEjN/PSOTsdTKJq9e47
    dlUp+tqQsvGkbBOIOt5OOpkr8Z+8qbEd21ojF9Q0p0T4WMThRP6YBRKvt8mmFwRs
    DjEhMiPa4L70Eqldfu2lWdI6ietfHrK97WXwQO1gF73LOnA+EdMXNxr1iLd0Tdke
    z6fUSw3hKZL+I7nX6O40+KgkhXVSZOsRz5CEvo2iChIUrYGEGDl94K/ofqGu71Y+
    G8KBvbha6EC7xcUrTYP5Gek5wsrw7cGgDZJjMsyXYFBZjQO1N6g9fncLmc5pB5Ix
    W3gLfQS/My4daWNTvrYOgfA08J4M4ZWd0v5TglxOSV78psG4J4slppDySNFB2d/3
    7JiwWVm5SMk0StLWwb2azmTvBoinnrZJzPnPlOytxvE5uGJ/i0WAik7C99YgVJkS
    9hO3FJGasrOnHeiOvMZEdRuIVspKz9iMFx7hWHpVHTTyjwceEpaiEkhmqLM9QkKh
    kCZqeWyVsKBIc0sse+CKNK8ik9eTeUlCklGMV1Q4kKjR6uuHUOLyjk/xhqslV4TS
    jnnjCjsK5YzTa4hmbHhPZIW262KoFV9TqxYKkhP5ab7AXRSakrdrY2cwACWN4AMT
    -----END RSA PRIVATE KEY-----
    `;
const idpPrivateKey = `
    -----BEGIN RSA PRIVATE KEY-----
    Proc-Type: 4,ENCRYPTED
    DEK-Info: DES-EDE3-CBC,116B0EBB2F2F0A9D

    HMmUsJPVPTsq1e06yrrskfinY21OOHosfRzibLueBg9ByFFZ7+/oW/DKy1GcDeBc
    ycL+3gylIoGUYuZ+DPC11ArjdxFqLFnHJb96rwy5h4sTP0lE+qHy+06AwsowUgp3
    pdD2unPFeydpu5h/dqgoDzkGSucz0Ty/spHXNBvns0vJO18B7XlzXUtfH5aHco22
    DyVY6FrJwMts9E4Rzs9JsxJJ7mi/6+Qsc0rOr8/6KKsRo1sKD6cvQIQ05dEvGrE9
    /2fubHkRTl+zBqOVyQvC6iUtocwxlMP4KfmyYrD1wlQAnP/+smq2G+xf7uGc4X4P
    8q0jEy2P9n5ASlwZ3XCS9hZgp8VRAcXWOYjzzNouQp3NEP9d5D3wN4aFKa/JW6pk
    a6VwraEweuyJqvZ7nnam1emW0ge0z7hJabR0+j0PnUxFIwkI5jO3HI5UiuUzuQFe
    2bTLA3XnJ7QD08ZKom0rmApbFrmm9BWBRTmt46NlQDy49VODPY4gFuQ/mpaFjaBy
    fSNJaOSS/MDuAdPabNEh3l+yCGKtHIbPVIms76PxYf6o0VVxW96/Q25hrvyOJCxn
    dVQyyJbQ1jGenu4ViDNrW9ZQfw4aJCPpY7lUQd09BGz2NMKgkrSl8bKSan4lvlF3
    ok8BjfIw+pIrTyesPU5tF0YudDxwi8fbIG70iwrpsSt2wVIMa+Nz2lwFT1dV8be7
    NARkkkhLWJYAsxsyVfdl+ucNSqhvo8xLITuG8CZnzKf0T2HMKnMNegFx/ipfM7ff
    Mx5CjayN5Oy99MWsagYEutUGzCGPAuVpqYpJuuYa3lWbFk2XWihWkAiUwgRqIluE
    M6LpO8l3LVXVjN1+6bK1GZpbfLay+E6vy4W38XMuXZSNpyhy6e+XggTPH2xbbwoi
    OcAzcojhMaxVGpxm/aXyRxg9zBdrQjtqM/aCN91ri55bvOKxELVi+D/VcZKpd2CR
    X/vWcqoGaK/6+vlPWMZSHCJkPa4KBT0aUcnEdeFWx2nmrwdrHvETzCYLAzVBSECV
    ZoYH0xTkFr/RI2AOAzx701LSuYbnPoCq+w7TXtjPaooZdYVVgrYuI+j4JOlseFS7
    1c9iRiJVPBfnpUNIZdHLw19+k81IJ/FmumiuDhfLS5pwQmtuXkO3DWZDa3UPlV8e
    6dmZeP1XGwRLL9VpOKx7NCqZM+CdEt87CXpFFWXdw8tL+3K/2r8w4lHIzBKaVPSS
    5uFqXc1vzfP6Qeov31IjeLPE1pWTHNqRPdmvt9Scq9tKS3o18wmLBxOVinOE0cxQ
    oddzPd0z5NxNYVayqZORwDdVv6CVXKnrvBSnOFFslZqv1G8/diE5BXxeaAPEMcZE
    3lD7MzdoEHK5oL2MXofLWZbNtMkOZLaLqY80zKT1UG3Gs8U44d44aLXO1dBL0HGX
    dNfNUaH+IGZf2ccS6OR1RhwIazDZ8qk0XeUwQV588adwC3FUvscVA3eHZa95z4kX
    xvHg+ylzRtKRfpSPzB2IVwgV9/rsOg0OmvwhV8+5IQpdcFr+hf2Bn6AVn6H9aX8A
    JjycN6KMcHaFa0EUqagGm9tsQLmf/MGCj8sy9am1IbRmFCz5lB5A7P/YLPM2Csjg
    -----END RSA PRIVATE KEY-----`;
const certificate = `
    -----BEGIN CERTIFICATE-----
    MIIDlzCCAn+gAwIBAgIJAO1ymQc33+bWMA0GCSqGSIb3DQEBCwUAMGIxCzAJBgNV
    BAYTAkhLMRMwEQYDVQQIDApTb21lLVN0YXRlMRowGAYDVQQKDBFJZGVudGl0eSBQ
    cm92aWRlcjEUMBIGA1UECwwLRGV2ZWxvcG1lbnQxDDAKBgNVBAMMA0lEUDAeFw0x
    NTA3MDUxODAyMjdaFw0xODA3MDQxODAyMjdaMGIxCzAJBgNVBAYTAkhLMRMwEQYD
    VQQIDApTb21lLVN0YXRlMRowGAYDVQQKDBFJZGVudGl0eSBQcm92aWRlcjEUMBIG
    A1UECwwLRGV2ZWxvcG1lbnQxDDAKBgNVBAMMA0lEUDCCASIwDQYJKoZIhvcNAQEB
    BQADggEPADCCAQoCggEBAODZsWhCe+yG0PalQPTUoD7yko5MTWMCRxJ8hSm2k7mG
    3Eg/Y2v0EBdCmTw7iDCevRqUmbmFnq7MROyV4eriJzh0KabAdZf7/k6koghst3ZU
    tWOwzshyxkBtWDwGmBpQGTGsKxJ8M1js3aSqNRXBT4OBWM9w2Glt1+8ty30RhYv3
    pSF+/HHLH7Ac+vLSIAlokaFW34RWTcJ/8rADuRWlXih4GfnIu0W/ncm5nTSaJiRA
    vr3dGDRO/khiXoJdbbOj7dHPULxVGbH9IbPK76TCwLbF7ikIMsPovVbTrpyL6vsb
    VUKeEl/5GKppTwp9DLAOeoSYpCYkkDkYKu9TRQjF02MCAwEAAaNQME4wHQYDVR0O
    BBYEFP2ut2AQdy6D1dwdwK740IHmbh38MB8GA1UdIwQYMBaAFP2ut2AQdy6D1dwd
    wK740IHmbh38MAwGA1UdEwQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBANMZUoPN
    mHzgja2PYkbvBYMHmpvUkVoiuvQ9cJPlqGTB2CRfG68BNNs/Clz8P7cIrAdkhCUw
    i1rSBhDuslGFNrSaIpv6B10FpBuKwef3G7YrPWFNEN6khY7aHNWSTHqKgs1DrGef
    2B9hvkrnHWbQVSVXrBFKe1wTCqcgGcOpYoSK7L8C6iX6uIA/uZYnVQ4NgBrizJ0a
    zkjdegz3hwO/gt4malEURy8D85/AAVt6PAzhpb9VJUGxSXr/EfntVUEz3L2gUFWW
    k1CnZFyz0rIOEt/zPmeAY8BLyd/Tjxm4Y+gwNazKq5y9AJS+m858b/nM4QdCnUE4
    yyoWAJDUHiAmvFA=
    -----END CERTIFICATE-----
    `;
const idpEncryptionKey = `
    -----BEGIN RSA PRIVATE KEY-----
    Proc-Type: 4,ENCRYPTED
    DEK-Info: DES-EDE3-CBC,860FDB9F3BE14699

    bMpTdWaAEqNciUFQhHYNv1F9N12aqOQd6cFbMozfRnNR19HW6QIPDmEOPSSCaaRy
    QCnJhbpcSnaz9pvI7EzeJzdykDmR8Boos+0NSK9qIX0buBO55mfPr7hjx7bLFEVl
    kkHk+k9F1rLyjyAGJrVoTNoWjyuMOFUCWR7ZxoYticwM/sL+Rbhn1FsfdkdfhFW0
    08OHTouRK33Aifx0A3MWxR0ILvw49E6urtbbIrskEzKzfWQug8gY1TJhI3sbsMsI
    1bS5Vg88TvilFFBGn0Yv6GEJjgOrsrKDGKtYGhuBfK4fd4rwnQKKvC6gTKeNXIfV
    7Qm1R20LUJXC8zv35pdKoVk+NdS/MGNXJRFgO3Kkp01aVf3n1oo2+AllS02AYyWt
    1svHecsRwbibXip8gSQsOtDdpqQrEDyqZlFHXEw/IcJE9vQWEJmpHD5GFhbKtttp
    E0B3ZtNl6YcyUz0rSf9zjuMx/wReWdRb6H2WoIqoRS7vAUONDRPt7wvfjtLlDRVi
    bc2RTN8yce/57lGnA1n8bxPV5+9VxCJOEipV3io/nrj+uNO8i/0rUpkKdZy8wy2C
    Rksoxq4TxwegONz1HQcJVpJu0iBdu7B+BXVjxQQScvMQlOTbua8k+YdaCeZAb83j
    JVX89/PFy+Xj7eGyzzBTqz7dV0Xkxq9mpiMYUCoyNL5Iq1jD9Xb5TzVW1Gbh8zCZ
    YXjcZEQKeartaBC4/fRWyxqK3gJRX4SJkl4gYMQrPS2pbTzVCO+WLxSwIh3dOZpo
    eErXLSrylIv9cE2Xrs0McXAR+hfGrqgtILBWwgbh2NhmUiFfLwUTUxU51eu7QZ2T
    V1VFBX0QTmn2kM0JLSSC96mDUzbs6qfURUaXbuffF5cqdUjXgtzZj5SFEbIv4UFS
    0DAS+6i/jTGSz7aAp/uofOxhYkCqK/s2Cex2jQbDpcKXKiWzPdULOCjAh3fdCAp0
    3ua3fdAI7H8PslSDiPFrcY78OxZaWXzazEiun77WKbzrMloLMP5dpCPlUCOqxbZ0
    ykSuo0M7p/UPY34yi3AMHS9grvQQ1DykMPoqKKEheI6nUGcQ1AFcdr307ILWRsPO
    T6gHOLXZaR4+UEeYfkTKsjrMUhozx7JIyuLgTXA9TWC+tZ9WZpbJ7i3bpQ+RNwX2
    AxQSwc9ZOcNxg8YCbGlJgJHnRVhA202kNT5ORplcRKqaOaO9LK7491gaaShjaspg
    4THDnH+HHFORmbgwyO9P74wuw+n6tI40Ia3qzRLVz6sJBQMtLEN+cvNoNi3KYkNj
    GJM1iWfSz6PjrEGxbzQZKoFPPiZrVRnVfPhBNyT2OZj+TJii9CaukhmkkA2/AJmS
    5XoO3GNIaqOGYV9HLyh1++cn3NhjgFYe/Q3ORCTIg2Ltd8Qr6mYe0LcONQFgiv4c
    AUOZtOq05fJDXE74R1JjYHPaQF6uZEbTF98jN9QZIfCEvDdv1nC83MvSwATi0j5S
    LvdU/MSPaZ0VKzPc4JPwv72dveEPME6QyswKx9izioJVrQJr36YtmrhDlKR1WBny
    ISbutnQPUN5fsaIsgKDIV3T7n6519t6brobcW5bdigmf5ebFeZJ16/lYy6V77UM5
    -----END RSA PRIVATE KEY-----
    `;
const spEncryptionKey = `
    -----BEGIN RSA PRIVATE KEY-----
    Proc-Type: 4,ENCRYPTED
    DEK-Info: DES-EDE3-CBC,860FDB9F3BE14699

    bMpTdWaAEqNciUFQhHYNv1F9N12aqOQd6cFbMozfRnNR19HW6QIPDmEOPSSCaaRy
    QCnJhbpcSnaz9pvI7EzeJzdykDmR8Boos+0NSK9qIX0buBO55mfPr7hjx7bLFEVl
    kkHk+k9F1rLyjyAGJrVoTNoWjyuMOFUCWR7ZxoYticwM/sL+Rbhn1FsfdkdfhFW0
    08OHTouRK33Aifx0A3MWxR0ILvw49E6urtbbIrskEzKzfWQug8gY1TJhI3sbsMsI
    1bS5Vg88TvilFFBGn0Yv6GEJjgOrsrKDGKtYGhuBfK4fd4rwnQKKvC6gTKeNXIfV
    7Qm1R20LUJXC8zv35pdKoVk+NdS/MGNXJRFgO3Kkp01aVf3n1oo2+AllS02AYyWt
    1svHecsRwbibXip8gSQsOtDdpqQrEDyqZlFHXEw/IcJE9vQWEJmpHD5GFhbKtttp
    E0B3ZtNl6YcyUz0rSf9zjuMx/wReWdRb6H2WoIqoRS7vAUONDRPt7wvfjtLlDRVi
    bc2RTN8yce/57lGnA1n8bxPV5+9VxCJOEipV3io/nrj+uNO8i/0rUpkKdZy8wy2C
    Rksoxq4TxwegONz1HQcJVpJu0iBdu7B+BXVjxQQScvMQlOTbua8k+YdaCeZAb83j
    JVX89/PFy+Xj7eGyzzBTqz7dV0Xkxq9mpiMYUCoyNL5Iq1jD9Xb5TzVW1Gbh8zCZ
    YXjcZEQKeartaBC4/fRWyxqK3gJRX4SJkl4gYMQrPS2pbTzVCO+WLxSwIh3dOZpo
    eErXLSrylIv9cE2Xrs0McXAR+hfGrqgtILBWwgbh2NhmUiFfLwUTUxU51eu7QZ2T
    V1VFBX0QTmn2kM0JLSSC96mDUzbs6qfURUaXbuffF5cqdUjXgtzZj5SFEbIv4UFS
    0DAS+6i/jTGSz7aAp/uofOxhYkCqK/s2Cex2jQbDpcKXKiWzPdULOCjAh3fdCAp0
    3ua3fdAI7H8PslSDiPFrcY78OxZaWXzazEiun77WKbzrMloLMP5dpCPlUCOqxbZ0
    ykSuo0M7p/UPY34yi3AMHS9grvQQ1DykMPoqKKEheI6nUGcQ1AFcdr307ILWRsPO
    T6gHOLXZaR4+UEeYfkTKsjrMUhozx7JIyuLgTXA9TWC+tZ9WZpbJ7i3bpQ+RNwX2
    AxQSwc9ZOcNxg8YCbGlJgJHnRVhA202kNT5ORplcRKqaOaO9LK7491gaaShjaspg
    4THDnH+HHFORmbgwyO9P74wuw+n6tI40Ia3qzRLVz6sJBQMtLEN+cvNoNi3KYkNj
    GJM1iWfSz6PjrEGxbzQZKoFPPiZrVRnVfPhBNyT2OZj+TJii9CaukhmkkA2/AJmS
    5XoO3GNIaqOGYV9HLyh1++cn3NhjgFYe/Q3ORCTIg2Ltd8Qr6mYe0LcONQFgiv4c
    AUOZtOq05fJDXE74R1JjYHPaQF6uZEbTF98jN9QZIfCEvDdv1nC83MvSwATi0j5S
    LvdU/MSPaZ0VKzPc4JPwv72dveEPME6QyswKx9izioJVrQJr36YtmrhDlKR1WBny
    ISbutnQPUN5fsaIsgKDIV3T7n6519t6brobcW5bdigmf5ebFeZJ16/lYy6V77UM5
    -----END RSA PRIVATE KEY-----
    `;
const generateRequestID = () => {
	return "_" + randomUUID();
};
const createTemplateCallback =
	(idp: any, sp: any, email: string) => (template: any) => {
		const assertionConsumerServiceUrl =
			sp.entityMeta.getAssertionConsumerService(
				saml.Constants.wording.binding.post,
			);

		const nameIDFormat = idp.entitySetting.nameIDFormat;
		const selectedNameIDFormat = Array.isArray(nameIDFormat)
			? nameIDFormat[0]
			: nameIDFormat;

		const id = generateRequestID();
		const now = new Date();
		const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);
		const tagValues = {
			ID: id,
			AssertionID: generateRequestID(),
			Destination: assertionConsumerServiceUrl,
			Audience: sp.entityMeta.getEntityID(),
			EntityID: sp.entityMeta.getEntityID(),
			SubjectRecipient: assertionConsumerServiceUrl,
			Issuer: idp.entityMeta.getEntityID(),
			IssueInstant: now.toISOString(),
			AssertionConsumerServiceURL: assertionConsumerServiceUrl,
			StatusCode: "urn:oasis:names:tc:SAML:2.0:status:Success",
			ConditionsNotBefore: now.toISOString(),
			ConditionsNotOnOrAfter: fiveMinutesLater.toISOString(),
			SubjectConfirmationDataNotOnOrAfter: fiveMinutesLater.toISOString(),
			NameIDFormat: selectedNameIDFormat,
			NameID: email,
			InResponseTo: "null",
			AuthnStatement: "",
			attrFirstName: "Test",
			attrLastName: "User",
			attrEmail: "test@email.com",
		};

		return {
			id,
			context: saml.SamlLib.replaceTagsByValue(template, tagValues),
		};
	};

const createMockSAMLIdP = (port: number) => {
	const app: ExpressApp = express();
	let server: ReturnType<typeof createServer> | undefined;

	app.use(bodyParser.urlencoded({ extended: true }));
	app.use(bodyParser.json());

	const idp = saml.IdentityProvider({
		metadata: idpMetadata,
		privateKey: idPk,
		isAssertionEncrypted: false,
		privateKeyPass: "jXmKf9By6ruLnUdRo90G",
		loginResponseTemplate: {
			context:
				'<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="{ID}" Version="2.0" IssueInstant="{IssueInstant}" Destination="{Destination}" InResponseTo="{InResponseTo}"><saml:Issuer>{Issuer}</saml:Issuer><samlp:Status><samlp:StatusCode Value="{StatusCode}"/></samlp:Status><saml:Assertion ID="{AssertionID}" Version="2.0" IssueInstant="{IssueInstant}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"><saml:Issuer>{Issuer}</saml:Issuer><saml:Subject><saml:NameID Format="{NameIDFormat}">{NameID}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="{SubjectConfirmationDataNotOnOrAfter}" Recipient="{SubjectRecipient}" InResponseTo="{InResponseTo}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="{ConditionsNotBefore}" NotOnOrAfter="{ConditionsNotOnOrAfter}"><saml:AudienceRestriction><saml:Audience>{Audience}</saml:Audience></saml:AudienceRestriction></saml:Conditions>{AttributeStatement}</saml:Assertion></samlp:Response>',
			attributes: [
				{
					name: "firstName",
					valueTag: "firstName",
					nameFormat: "urn:oasis:names:tc:SAML:2.0:attrname-format:basic",
					valueXsiType: "xs:string",
				},
				{
					name: "lastName",
					valueTag: "lastName",
					nameFormat: "urn:oasis:names:tc:SAML:2.0:attrname-format:basic",
					valueXsiType: "xs:string",
				},
				{
					name: "email",
					valueTag: "email",
					nameFormat: "urn:oasis:names:tc:SAML:2.0:attrname-format:basic",
					valueXsiType: "xs:string",
				},
			],
		},
	});
	const sp = saml.ServiceProvider({
		metadata: spMetadata,
	});
	app.get(
		"/api/sso/saml2/idp/post",
		async (req: ExpressRequest, res: ExpressResponse) => {
			const user = { emailAddress: "test@email.com", famName: "hello world" };
			const { context, entityEndpoint } = await idp.createLoginResponse(
				sp,
				{} as any,
				saml.Constants.wording.binding.post,
				user,
				createTemplateCallback(idp, sp, user.emailAddress),
			);
			res.status(200).send({ samlResponse: context, entityEndpoint });
		},
	);
	app.get(
		"/api/sso/saml2/idp/redirect",
		async (req: ExpressRequest, res: ExpressResponse) => {
			const user = { emailAddress: "test@email.com", famName: "hello world" };
			const { context, entityEndpoint } = await idp.createLoginResponse(
				sp,
				{} as any,
				saml.Constants.wording.binding.post,
				user,
				createTemplateCallback(idp, sp, user.emailAddress),
			);
			res.status(200).send({ samlResponse: context, entityEndpoint });
		},
	);
	app.post("/api/sso/saml2/sp/acs", async (req: any, res: any) => {
		try {
			const parseResult = await sp.parseLoginResponse(
				idp,
				saml.Constants.wording.binding.post,
				req,
			);
			const { extract } = parseResult;
			const { attributes } = extract;
			const relayState = req.body.RelayState;
			if (relayState) {
				return res.status(200).send({ relayState, attributes });
			} else {
				return res
					.status(200)
					.send({ extract, message: "RelayState is missing." });
			}
		} catch (error) {
			console.error("Error handling SAML ACS endpoint:", error);
			res.status(500).send({ error: "Failed to process SAML response." });
		}
	});
	app.post(
		"/api/sso/saml2/callback/:providerId",
		async (req: ExpressRequest, res: ExpressResponse) => {
			const { SAMLResponse, RelayState } = req.body;
			try {
				const parseResult = await sp.parseLoginResponse(
					idp,
					saml.Constants.wording.binding.post,
					{ body: { SAMLResponse } },
				);

				const { attributes, nameID } = parseResult.extract;

				res.redirect(302, RelayState || "http://localhost:3000/dashboard");
			} catch (error) {
				console.error("Error processing SAML callback:", error);
				res.status(500).send({ error: "Failed to process SAML response" });
			}
		},
	);
	app.get(
		"/api/sso/saml2/idp/metadata",
		(req: ExpressRequest, res: ExpressResponse) => {
			res.type("application/xml");
			res.send(idpMetadata);
		},
	);
	const start = () =>
		new Promise<void>((resolve) => {
			app.use(bodyParser.urlencoded({ extended: true }));
			server = app.listen(port, () => {
				console.log(`Mock SAML IdP running on port ${port}`);
				resolve();
			});
		});

	const stop = () =>
		new Promise<void>((resolve, reject) => {
			app.use(bodyParser.urlencoded({ extended: true }));
			server?.close((err) => {
				if (err) reject(err);
				else resolve();
			});
		});

	const metadataUrl = `http://localhost:${port}/idp/metadata`;

	return { start, stop, metadataUrl };
};

describe("SAML SSO with defaultSSO array", async () => {
	const data = {
		user: [],
		session: [],
		verification: [],
		account: [],
		ssoProvider: [],
	};

	const memory = memoryAdapter(data);
	const mockIdP = createMockSAMLIdP(8081); // Different port from your main app

	const ssoOptions = {
		defaultSSO: [
			{
				domain: "localhost:8081",
				providerId: "default-saml",
				samlConfig: {
					issuer: "http://localhost:8081",
					entryPoint: "http://localhost:8081/api/sso/saml2/idp/post",
					cert: certificate,
					callbackUrl: "http://localhost:8081/dashboard",
					wantAssertionsSigned: false,
					signatureAlgorithm: "sha256",
					digestAlgorithm: "sha256",
					idpMetadata: {
						metadata: idpMetadata,
					},
					spMetadata: {
						metadata: spMetadata,
					},
					identifierFormat:
						"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
				},
			},
		],
		provisionUser: vi
			.fn()
			.mockImplementation(async ({ user, userInfo, token, provider }) => {
				return {
					id: "provisioned-user-id",
					email: userInfo.email,
					name: userInfo.name,
					attributes: userInfo.attributes,
				};
			}),
	};

	const auth = betterAuth({
		database: memory,
		baseURL: "http://localhost:3000",
		emailAndPassword: {
			enabled: true,
		},
		plugins: [sso(ssoOptions)],
	});

	const ctx = await auth.$context;

	const authClient = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [bearer(), ssoClient()],
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	beforeAll(async () => {
		await mockIdP.start();
	});

	afterAll(async () => {
		await mockIdP.stop();
	});

	it("should use default SAML SSO provider from array when no provider found in database", async () => {
		const signInResponse = await auth.api.signInSSO({
			body: {
				providerId: "default-saml",
				callbackURL: "http://localhost:3000/dashboard",
			},
		});

		expect(signInResponse).toEqual({
			url: expect.stringContaining("http://localhost:8081"),
			redirect: true,
		});
	});
});

describe("SAML SSO", async () => {
	const data = {
		user: [],
		session: [],
		verification: [],
		account: [],
		ssoProvider: [],
	};

	const memory = memoryAdapter(data);
	const mockIdP = createMockSAMLIdP(8081); // Different port from your main app

	const ssoOptions = {
		provisionUser: vi
			.fn()
			.mockImplementation(async ({ user, userInfo, token, provider }) => {
				return {
					id: "provisioned-user-id",
					email: userInfo.email,
					name: userInfo.name,
					attributes: userInfo.attributes,
				};
			}),
	};

	const auth = betterAuth({
		database: memory,
		baseURL: "http://localhost:3000",
		emailAndPassword: {
			enabled: true,
		},
		plugins: [sso(ssoOptions)],
	});

	const ctx = await auth.$context;

	const authClient = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [bearer(), ssoClient()],
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	const testUser = {
		email: "test@email.com",
		password: "password",
		name: "Test User",
	};

	beforeAll(async () => {
		await mockIdP.start();
		const res = await authClient.signUp.email({
			email: testUser.email,
			password: testUser.password,
			name: testUser.name,
		});
	});

	afterAll(async () => {
		await mockIdP.stop();
	});

	beforeEach(() => {
		data.user = [];
		data.session = [];
		data.verification = [];
		data.account = [];
		data.ssoProvider = [];

		vi.clearAllMocks();
	});

	async function getAuthHeaders() {
		const headers = new Headers();
		await authClient.signUp.email({
			email: testUser.email,
			password: testUser.password,
			name: testUser.name,
		});
		const res = await authClient.signIn.email(testUser, {
			throw: true,
			onSuccess: setCookieToHeader(headers),
		});
		return headers;
	}

	it("should register a new SAML provider", async () => {
		const headers = await getAuthHeaders();
		const res = await authClient.signIn.email(testUser, {
			throw: true,
			onSuccess: setCookieToHeader(headers),
		});

		const provider = await auth.api.registerSSOProvider({
			body: {
				providerId: "saml-provider-1",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: mockIdP.metadataUrl,
					cert: certificate,
					callbackUrl: "http://localhost:8081/api/sso/saml2/callback",
					wantAssertionsSigned: false,
					signatureAlgorithm: "sha256",
					digestAlgorithm: "sha256",
					idpMetadata: {
						metadata: idpMetadata,
						privateKey: idpPrivateKey,
						privateKeyPass: "q9ALNhGT5EhfcRmp8Pg7e9zTQeP2x1bW",
						isAssertionEncrypted: true,
						encPrivateKey: idpEncryptionKey,
						encPrivateKeyPass: "g7hGcRmp8PxT5QeP2q9Ehf1bWe9zTALN",
					},
					spMetadata: {
						metadata: spMetadata,
						binding: "post",
						privateKey: spPrivateKey,
						privateKeyPass: "VHOSp5RUiBcrsjrcAuXFwU1NKCkGA8px",
						isAssertionEncrypted: true,
						encPrivateKey: spEncryptionKey,
						encPrivateKeyPass: "BXFNKpxrsjrCkGA8cAu5wUVHOSpci1RU",
					},
					identifierFormat:
						"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
				},
			},
			headers,
		});
		expect(provider).toMatchObject({
			id: expect.any(String),
			issuer: "http://localhost:8081",
			samlConfig: {
				entryPoint: mockIdP.metadataUrl,
				cert: expect.any(String),
				callbackUrl: "http://localhost:8081/api/sso/saml2/callback",
				wantAssertionsSigned: false,
				signatureAlgorithm: "sha256",
				digestAlgorithm: "sha256",
				identifierFormat:
					"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
			},
		});
	});
	it("Should fetch sp metadata", async () => {
		const headers = await getAuthHeaders();
		await authClient.signIn.email(testUser, {
			throw: true,
			onSuccess: setCookieToHeader(headers),
		});
		const provider = await auth.api.registerSSOProvider({
			body: {
				providerId: "saml-provider-1",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: mockIdP.metadataUrl,
					cert: certificate,
					callbackUrl: "http://localhost:8081/api/sso/saml2/sp/acs",
					wantAssertionsSigned: false,
					signatureAlgorithm: "sha256",
					digestAlgorithm: "sha256",
					idpMetadata: {
						metadata: idpMetadata,
						privateKey: idpPrivateKey,
						privateKeyPass: "q9ALNhGT5EhfcRmp8Pg7e9zTQeP2x1bW",
						isAssertionEncrypted: true,
						encPrivateKey: idpEncryptionKey,
						encPrivateKeyPass: "g7hGcRmp8PxT5QeP2q9Ehf1bWe9zTALN",
					},
					spMetadata: {
						metadata: spMetadata,
						binding: "post",
						privateKey: spPrivateKey,
						privateKeyPass: "VHOSp5RUiBcrsjrcAuXFwU1NKCkGA8px",
						isAssertionEncrypted: true,
						encPrivateKey: spEncryptionKey,
						encPrivateKeyPass: "BXFNKpxrsjrCkGA8cAu5wUVHOSpci1RU",
					},
					identifierFormat:
						"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
				},
			},
			headers,
		});

		const spMetadataRes = await auth.api.spMetadata({
			query: {
				providerId: provider.providerId,
			},
		});
		const spMetadataResResValue = await spMetadataRes.text();
		expect(spMetadataRes.status).toBe(200);
		expect(spMetadataResResValue).toBe(spMetadata);
	});
	it("Should fetch sp metadata", async () => {
		const headers = await getAuthHeaders();
		await authClient.signIn.email(testUser, {
			throw: true,
			onSuccess: setCookieToHeader(headers),
		});
		const issuer = "http://localhost:8081";
		const provider = await auth.api.registerSSOProvider({
			body: {
				providerId: "saml-provider-1",
				issuer: issuer,
				domain: issuer,
				samlConfig: {
					entryPoint: mockIdP.metadataUrl,
					cert: certificate,
					callbackUrl: `${issuer}/api/sso/saml2/sp/acs`,
					wantAssertionsSigned: false,
					signatureAlgorithm: "sha256",
					digestAlgorithm: "sha256",
					idpMetadata: {
						metadata: idpMetadata,
						privateKey: idpPrivateKey,
						privateKeyPass: "q9ALNhGT5EhfcRmp8Pg7e9zTQeP2x1bW",
						isAssertionEncrypted: true,
						encPrivateKey: idpEncryptionKey,
						encPrivateKeyPass: "g7hGcRmp8PxT5QeP2q9Ehf1bWe9zTALN",
					},
					spMetadata: {
						binding: "post",
						privateKey: spPrivateKey,
						privateKeyPass: "VHOSp5RUiBcrsjrcAuXFwU1NKCkGA8px",
						isAssertionEncrypted: true,
						encPrivateKey: spEncryptionKey,
						encPrivateKeyPass: "BXFNKpxrsjrCkGA8cAu5wUVHOSpci1RU",
					},
					identifierFormat:
						"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
				},
			},
			headers,
		});

		const spMetadataRes = await auth.api.spMetadata({
			query: {
				providerId: provider.providerId,
			},
		});
		const spMetadataResResValue = await spMetadataRes.text();
		expect(spMetadataRes.status).toBe(200);
		expect(spMetadataResResValue).toBeDefined();
		expect(spMetadataResResValue).toContain(
			"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
		);
		expect(spMetadataResResValue).toContain(
			"urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
		);
		expect(spMetadataResResValue).toContain(
			`<EntityDescriptor entityID="${issuer}"`,
		);
		expect(spMetadataResResValue).toContain(
			`Location="${issuer}/api/sso/saml2/sp/acs"`,
		);
	});
	it("should initiate SAML login and handle response", async () => {
		const headers = await getAuthHeaders();
		const res = await authClient.signIn.email(testUser, {
			throw: true,
			onSuccess: setCookieToHeader(headers),
		});
		const provider = await auth.api.registerSSOProvider({
			body: {
				providerId: "saml-provider-1",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: "http://localhost:8081/api/sso/saml2/idp/post",
					cert: certificate,
					callbackUrl: "http://localhost:8081/dashboard",
					wantAssertionsSigned: false,
					signatureAlgorithm: "sha256",
					digestAlgorithm: "sha256",
					idpMetadata: {
						metadata: idpMetadata,
						privateKey: idpPrivateKey,
						privateKeyPass: "q9ALNhGT5EhfcRmp8Pg7e9zTQeP2x1bW",
						isAssertionEncrypted: true,
						encPrivateKey: idpEncryptionKey,
						encPrivateKeyPass: "g7hGcRmp8PxT5QeP2q9Ehf1bWe9zTALN",
					},
					spMetadata: {
						metadata: spMetadata,
						binding: "post",
						privateKey: spPrivateKey,
						privateKeyPass: "VHOSp5RUiBcrsjrcAuXFwU1NKCkGA8px",
						isAssertionEncrypted: true,
						encPrivateKey: spEncryptionKey,
						encPrivateKeyPass: "BXFNKpxrsjrCkGA8cAu5wUVHOSpci1RU",
					},
					identifierFormat:
						"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
				},
			},
			headers,
		});

		const signInResponse = await auth.api.signInSSO({
			body: {
				providerId: "saml-provider-1",
				callbackURL: "http://localhost:3000/dashboard",
			},
		});

		expect(signInResponse).toEqual({
			url: expect.stringContaining("http://localhost:8081"),
			redirect: true,
		});
		let samlResponse: any;
		await betterFetch(signInResponse?.url as string, {
			onSuccess: async (context) => {
				samlResponse = await context.data;
			},
		});
		let redirectLocation = "";
		await betterFetch(
			"http://localhost:8081/api/sso/saml2/callback/saml-provider-1",
			{
				method: "POST",
				redirect: "manual",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					SAMLResponse: samlResponse.samlResponse,
				}),
				onError: (context) => {
					expect(context.response.status).toBe(302);
					redirectLocation = context.response.headers.get("location") || "";
				},
			},
		);
		expect(redirectLocation).toBe("http://localhost:3000/dashboard");
	});

	it("should not allow creating a provider if limit is set to 0", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso({ providersLimit: 0 })],
		});
		const { headers } = await signInWithTestUser();
		await expect(
			auth.api.registerSSOProvider({
				body: {
					providerId: "saml-provider-1",
					issuer: "http://localhost:8081",
					domain: "http://localhost:8081",
					samlConfig: {
						entryPoint: mockIdP.metadataUrl,
						cert: certificate,
						callbackUrl: "http://localhost:8081/api/sso/saml2/callback",
						wantAssertionsSigned: false,
						signatureAlgorithm: "sha256",
						digestAlgorithm: "sha256",
						spMetadata: {
							metadata: spMetadata,
						},
					},
				},
				headers,
			}),
		).rejects.toMatchObject({
			status: "FORBIDDEN",
			body: { message: "SSO provider registration is disabled" },
		});
	});

	it("should not allow creating a provider if limit is reached", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso({ providersLimit: 1 })],
		});
		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "saml-provider-1",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: mockIdP.metadataUrl,
					cert: certificate,
					callbackUrl: "http://localhost:8081/api/sso/saml2/callback",
					wantAssertionsSigned: false,
					signatureAlgorithm: "sha256",
					digestAlgorithm: "sha256",
					spMetadata: {
						metadata: spMetadata,
					},
				},
			},
			headers,
		});

		await expect(
			auth.api.registerSSOProvider({
				body: {
					providerId: "saml-provider-2",
					issuer: "http://localhost:8081",
					domain: "http://localhost:8081",
					samlConfig: {
						entryPoint: mockIdP.metadataUrl,
						cert: certificate,
						callbackUrl: "http://localhost:8081/api/sso/saml2/callback",
						wantAssertionsSigned: false,
						signatureAlgorithm: "sha256",
						digestAlgorithm: "sha256",
						spMetadata: {
							metadata: spMetadata,
						},
					},
				},
				headers,
			}),
		).rejects.toMatchObject({
			status: "FORBIDDEN",
			body: {
				message: "You have reached the maximum number of SSO providers",
			},
		});
	});

	it("should not allow creating a provider if limit from function is reached", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				sso({
					providersLimit: async (user) => {
						return user.email === "pro@example.com" ? 2 : 1;
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "saml-provider-1",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: mockIdP.metadataUrl,
					cert: certificate,
					callbackUrl: "http://localhost:8081/api/sso/saml2/callback",
					wantAssertionsSigned: false,
					signatureAlgorithm: "sha256",
					digestAlgorithm: "sha256",
					spMetadata: {
						metadata: spMetadata,
					},
				},
			},
			headers,
		});

		await expect(
			auth.api.registerSSOProvider({
				body: {
					providerId: "saml-provider-2",
					issuer: "http://localhost:8081",
					domain: "http://localhost:8081",
					samlConfig: {
						entryPoint: mockIdP.metadataUrl,
						cert: certificate,
						callbackUrl: "http://localhost:8081/api/sso/saml2/callback",
						wantAssertionsSigned: false,
						signatureAlgorithm: "sha256",
						digestAlgorithm: "sha256",
						spMetadata: {
							metadata: spMetadata,
						},
					},
				},
				headers,
			}),
		).rejects.toMatchObject({
			status: "FORBIDDEN",
			body: {
				message: "You have reached the maximum number of SSO providers",
			},
		});
	});

	it("should not allow creating a provider with duplicate providerId", async () => {
		const headers = await getAuthHeaders();
		await authClient.signIn.email(testUser, {
			throw: true,
			onSuccess: setCookieToHeader(headers),
		});

		await auth.api.registerSSOProvider({
			body: {
				providerId: "duplicate-provider",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: mockIdP.metadataUrl,
					cert: certificate,
					callbackUrl: "http://localhost:8081/api/sso/saml2/callback",
					spMetadata: {
						metadata: spMetadata,
					},
				},
			},
			headers,
		});

		await expect(
			auth.api.registerSSOProvider({
				body: {
					providerId: "duplicate-provider",
					issuer: "http://localhost:8082",
					domain: "http://localhost:8082",
					samlConfig: {
						entryPoint: mockIdP.metadataUrl,
						cert: certificate,
						callbackUrl: "http://localhost:8082/api/sso/saml2/callback",
						spMetadata: {
							metadata: spMetadata,
						},
					},
				},
				headers,
			}),
		).rejects.toMatchObject({
			status: "UNPROCESSABLE_ENTITY",
			body: {
				message: "SSO provider with this providerId already exists",
			},
		});
	});

	it("should reject SAML sign-in when disableImplicitSignUp is true and user doesn't exist", async () => {
		const { auth: authWithDisabledSignUp, signInWithTestUser } =
			await getTestInstance({
				plugins: [sso({ disableImplicitSignUp: true })],
			});

		const { headers } = await signInWithTestUser();

		// Register SAML provider
		await authWithDisabledSignUp.api.registerSSOProvider({
			body: {
				providerId: "saml-test-provider",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: "http://localhost:8081/api/sso/saml2/idp/post",
					cert: certificate,
					callbackUrl: "http://localhost:3000/dashboard",
					wantAssertionsSigned: false,
					signatureAlgorithm: "sha256",
					digestAlgorithm: "sha256",
					idpMetadata: {
						metadata: idpMetadata,
					},
					spMetadata: {
						metadata: spMetadata,
					},
					identifierFormat:
						"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
				},
			},
			headers: headers,
		});

		// Identity Provider-initiated: Get SAML response directly from IdP
		// The mock IdP will return test@email.com, which doesn't exist in the DB
		let samlResponse: any;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = await context.data;
			},
		});

		// Attempt to complete SAML callback - should fail because test@email.com doesn't exist
		// and disableImplicitSignUp is true
		await expect(
			authWithDisabledSignUp.api.callbackSSOSAML({
				body: {
					SAMLResponse: samlResponse.samlResponse,
					RelayState: "http://localhost:3000/dashboard",
				},
				params: {
					providerId: "saml-test-provider",
				},
			}),
		).rejects.toMatchObject({
			status: "UNAUTHORIZED",
			body: {
				message:
					"User not found and implicit sign up is disabled for this provider",
			},
		});
	});

	it("should deny account linking when provider is not trusted and domain is not verified", async () => {
		const {
			auth: authUntrusted,
			signInWithTestUser,
			client,
		} = await getTestInstance({
			account: {
				accountLinking: {
					enabled: true,
					trustedProviders: [],
				},
			},
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		await authUntrusted.api.registerSSOProvider({
			body: {
				providerId: "untrusted-saml-provider",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: "http://localhost:8081/api/sso/saml2/idp/post",
					cert: certificate,
					callbackUrl: "http://localhost:3000/dashboard",
					wantAssertionsSigned: false,
					signatureAlgorithm: "sha256",
					digestAlgorithm: "sha256",
					idpMetadata: {
						metadata: idpMetadata,
					},
					spMetadata: {
						metadata: spMetadata,
					},
					identifierFormat:
						"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
				},
			},
			headers,
		});

		const ctx = await authUntrusted.$context;
		await ctx.adapter.create({
			model: "user",
			data: {
				id: "existing-user-id",
				email: "test@email.com",
				name: "Existing User",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		let samlResponse: any;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = await context.data;
			},
		});

		const response = await authUntrusted.handler(
			new Request(
				"http://localhost:3000/api/auth/sso/saml2/callback/untrusted-saml-provider",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						SAMLResponse: samlResponse.samlResponse,
						RelayState: "http://localhost:3000/dashboard",
					}),
				},
			),
		);

		expect(response.status).toBe(302);
		const redirectLocation = response.headers.get("location") || "";
		expect(redirectLocation).toContain("error=account_not_linked");
	});

	it("should allow account linking when provider is in trustedProviders", async () => {
		const { auth: authWithTrusted, signInWithTestUser } = await getTestInstance(
			{
				account: {
					accountLinking: {
						enabled: true,
						trustedProviders: ["trusted-saml-provider"],
					},
				},
				plugins: [sso()],
			},
		);

		const { headers } = await signInWithTestUser();

		await authWithTrusted.api.registerSSOProvider({
			body: {
				providerId: "trusted-saml-provider",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: "http://localhost:8081/api/sso/saml2/idp/post",
					cert: certificate,
					callbackUrl: "http://localhost:3000/dashboard",
					wantAssertionsSigned: false,
					signatureAlgorithm: "sha256",
					digestAlgorithm: "sha256",
					idpMetadata: {
						metadata: idpMetadata,
					},
					spMetadata: {
						metadata: spMetadata,
					},
					identifierFormat:
						"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
				},
			},
			headers,
		});

		const ctx = await authWithTrusted.$context;
		await ctx.adapter.create({
			model: "user",
			data: {
				id: "existing-user-id-2",
				email: "test@email.com",
				name: "Existing User",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		let samlResponse: any;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = await context.data;
			},
		});

		const response = await authWithTrusted.handler(
			new Request(
				"http://localhost:3000/api/auth/sso/saml2/callback/trusted-saml-provider",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						SAMLResponse: samlResponse.samlResponse,
						RelayState: "http://localhost:3000/dashboard",
					}),
				},
			),
		);

		expect(response.status).toBe(302);
		const redirectLocation = response.headers.get("location") || "";
		expect(redirectLocation).not.toContain("error");
		expect(redirectLocation).toContain("dashboard");
	});
});

describe("SAML SSO with custom fields", () => {
	const ssoOptions = {
		modelName: "sso_provider",
		fields: {
			issuer: "the_issuer",
			oidcConfig: "oidc_config",
			samlConfig: "saml_config",
			userId: "user_id",
			providerId: "provider_id",
			organizationId: "organization_id",
			domain: "the_domain",
		},
	};

	const data = {
		user: [],
		session: [],
		verification: [],
		account: [],
		sso_provider: [],
	};

	const memory = memoryAdapter(data);
	const mockIdP = createMockSAMLIdP(8081); // Different port from your main app

	const auth = betterAuth({
		database: memory,
		baseURL: "http://localhost:3000",
		emailAndPassword: {
			enabled: true,
		},
		plugins: [sso(ssoOptions)],
	});

	const authClient = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [bearer(), ssoClient()],
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	const testUser = {
		email: "test@email.com",
		password: "password",
		name: "Test User",
	};

	beforeAll(async () => {
		await mockIdP.start();
		const res = await authClient.signUp.email({
			email: testUser.email,
			password: testUser.password,
			name: testUser.name,
		});
	});

	afterAll(async () => {
		await mockIdP.stop();
	});

	beforeEach(() => {
		data.user = [];
		data.session = [];
		data.verification = [];
		data.account = [];
		data.sso_provider = [];

		vi.clearAllMocks();
	});

	async function getAuthHeaders() {
		const headers = new Headers();
		await authClient.signUp.email({
			email: testUser.email,
			password: testUser.password,
			name: testUser.name,
		});
		await authClient.signIn.email(testUser, {
			throw: true,
			onSuccess: setCookieToHeader(headers),
		});
		return headers;
	}

	it("should register a new SAML provider", async () => {
		const headers = await getAuthHeaders();

		const provider = await auth.api.registerSSOProvider({
			body: {
				providerId: "saml-provider-1",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: mockIdP.metadataUrl,
					cert: certificate,
					callbackUrl: "http://localhost:8081/api/sso/saml2/callback",
					wantAssertionsSigned: false,
					signatureAlgorithm: "sha256",
					digestAlgorithm: "sha256",
					idpMetadata: {
						metadata: idpMetadata,
						privateKey: idpPrivateKey,
						privateKeyPass: "q9ALNhGT5EhfcRmp8Pg7e9zTQeP2x1bW",
						isAssertionEncrypted: true,
						encPrivateKey: idpEncryptionKey,
						encPrivateKeyPass: "g7hGcRmp8PxT5QeP2q9Ehf1bWe9zTALN",
					},
					spMetadata: {
						metadata: spMetadata,
						binding: "post",
						privateKey: spPrivateKey,
						privateKeyPass: "VHOSp5RUiBcrsjrcAuXFwU1NKCkGA8px",
						isAssertionEncrypted: true,
						encPrivateKey: spEncryptionKey,
						encPrivateKeyPass: "BXFNKpxrsjrCkGA8cAu5wUVHOSpci1RU",
					},
					identifierFormat:
						"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
				},
			},
			headers,
		});
		expect(provider).toMatchObject({
			id: expect.any(String),
			issuer: "http://localhost:8081",
			samlConfig: {
				entryPoint: mockIdP.metadataUrl,
				cert: expect.any(String),
				callbackUrl: "http://localhost:8081/api/sso/saml2/callback",
				wantAssertionsSigned: false,
				signatureAlgorithm: "sha256",
				digestAlgorithm: "sha256",
				identifierFormat:
					"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
			},
		});
	});
});

import { safeJsonParse } from "./utils";

describe("safeJsonParse", () => {
	it("returns object as-is when value is already an object", () => {
		const obj = { a: 1, nested: { b: 2 } };
		const result = safeJsonParse<typeof obj>(obj);
		expect(result).toBe(obj); // same reference
		expect(result).toEqual({ a: 1, nested: { b: 2 } });
	});

	it("parses stringified JSON when value is a string", () => {
		const json = '{"a":1,"nested":{"b":2}}';
		const result = safeJsonParse<{ a: number; nested: { b: number } }>(json);
		expect(result).toEqual({ a: 1, nested: { b: 2 } });
	});

	it("returns null for null input", () => {
		const result = safeJsonParse<{ a: number }>(null);
		expect(result).toBeNull();
	});

	it("returns null for undefined input", () => {
		const result = safeJsonParse<{ a: number }>(undefined);
		expect(result).toBeNull();
	});

	it("throws error for invalid JSON string", () => {
		expect(() => safeJsonParse<{ a: number }>("not valid json")).toThrow(
			"Failed to parse JSON",
		);
	});

	it("handles empty object", () => {
		const obj = {};
		const result = safeJsonParse<typeof obj>(obj);
		expect(result).toBe(obj);
	});

	it("handles empty string JSON", () => {
		const result = safeJsonParse<Record<string, never>>("{}");
		expect(result).toEqual({});
	});
});

describe("SSO Provider Config Parsing", () => {
	it("returns parsed SAML config and avoids [object Object] in response", async () => {
		const data = {
			user: [] as any[],
			session: [] as any[],
			verification: [] as any[],
			account: [] as any[],
			ssoProvider: [] as any[],
		};

		const memory = memoryAdapter(data);

		const auth = betterAuth({
			database: memory,
			baseURL: "http://localhost:3000",
			emailAndPassword: { enabled: true },
			plugins: [sso()],
		});

		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [bearer(), ssoClient()],
			fetchOptions: {
				customFetchImpl: async (url, init) =>
					auth.handler(new Request(url, init)),
			},
		});

		const headers = new Headers();
		await authClient.signUp.email({
			email: "test@example.com",
			password: "password123",
			name: "Test User",
		});
		await authClient.signIn.email(
			{ email: "test@example.com", password: "password123" },
			{ onSuccess: setCookieToHeader(headers) },
		);

		const provider = await auth.api.registerSSOProvider({
			body: {
				providerId: "saml-config-provider",
				issuer: "http://localhost:8081",
				domain: "example.com",
				samlConfig: {
					entryPoint: "http://localhost:8081/sso",
					cert: "test-cert",
					callbackUrl: "http://localhost:3000/callback",
					spMetadata: {
						entityID: "test-entity",
					},
				},
			},
			headers,
		});

		expect(provider.samlConfig).toBeDefined();
		expect(typeof provider.samlConfig).toBe("object");
		expect(provider.samlConfig?.entryPoint).toBe("http://localhost:8081/sso");
		expect(provider.samlConfig?.cert).toBe("test-cert");

		const serialized = JSON.stringify(provider.samlConfig);
		expect(serialized).not.toContain("[object Object]");

		expect(provider.samlConfig?.spMetadata?.entityID).toBe("test-entity");
	});

	it("returns parsed OIDC config and avoids [object Object] in response", async () => {
		const data = {
			user: [] as any[],
			session: [] as any[],
			verification: [] as any[],
			account: [] as any[],
			ssoProvider: [] as any[],
		};

		const memory = memoryAdapter(data);

		const auth = betterAuth({
			database: memory,
			baseURL: "http://localhost:3000",
			emailAndPassword: { enabled: true },
			plugins: [sso()],
		});

		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [bearer(), ssoClient()],
			fetchOptions: {
				customFetchImpl: async (url, init) =>
					auth.handler(new Request(url, init)),
			},
		});

		const headers = new Headers();
		await authClient.signUp.email({
			email: "test@example.com",
			password: "password123",
			name: "Test User",
		});
		await authClient.signIn.email(
			{ email: "test@example.com", password: "password123" },
			{ onSuccess: setCookieToHeader(headers) },
		);

		const provider = await auth.api.registerSSOProvider({
			body: {
				providerId: "oidc-config-provider",
				issuer: "http://localhost:8080",
				domain: "example.com",
				oidcConfig: {
					clientId: "test-client",
					clientSecret: "test-secret",
					discoveryEndpoint:
						"http://localhost:8080/.well-known/openid-configuration",
					mapping: {
						id: "sub",
						email: "email",
						name: "name",
					},
				},
			},
			headers,
		});

		expect(provider.oidcConfig).toBeDefined();
		expect(typeof provider.oidcConfig).toBe("object");
		expect(provider.oidcConfig?.clientId).toBe("test-client");
		expect(provider.oidcConfig?.clientSecret).toBe("test-secret");

		const serialized = JSON.stringify(provider.oidcConfig);
		expect(serialized).not.toContain("[object Object]");

		expect(provider.oidcConfig?.mapping?.id).toBe("sub");
	});
});
