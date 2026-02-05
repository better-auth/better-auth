import { randomUUID } from "node:crypto";
import type { createServer } from "node:http";
import { betterFetch } from "@better-fetch/fetch";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { APIError } from "better-auth/api";
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
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { sso, validateSAMLTimestamp } from ".";
import { ssoClient } from "./client";
import { DEFAULT_CLOCK_SKEW_MS } from "./constants";

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
    MIIJKgIBAAKCAgEA+YIi6C8hA+NSB7dEcQf5OseCtL8wCohnnD8nnUTUdaMor9zm
    JLhuY4ExNsHD2XO5A9RIOXerYdAVh8v6L2jUuZpIJzleoypDGlluLAjEpy52lstL
    Hn7TytzuJjXmaTOXvWpo9oF52byqyvHKpyf27FFEL18bbVzVVZjh1oP7d3NryeF7
    lH6YesCCm649veyC87gBUTbwFcXktLRJcHqb2eVm3+x3NTDkQKk6cP5qfHEYx0c2
    AgPcujjOIYFbNYL0yUvFhqDJrHQGR2jp7/byyb1t4wy0EHnDoXmCCZ3FoHBEsyRS
    JJl2naK2AhH1ocMAXVaYZJ5ni6+ATKSQXJQGGhY2AyyCqTHF2DuZP9q9wYEj5cOK
    Km8W0eYHg9OZsimLWf8DVLZLtdfDY4SHyRbpVP5Hw3Kda2GJL84AX6q/NMIDabOK
    EM1a9Zp6YB7EkwIVzLmW2kwciUZj6nnMr8kKkUHESDdKEyyTRss6FH9EZB+gyieP
    u6g4ZauGYZX7KPThTL/cXjjXyKyaOR7U3xWX4nZF2aoq9masKjZTTjHyuQ7GKt+8
    dhpIKooOJ6i6SE18sX50KS9h7GqBa5XLbfzi/mam2uzU+IXmJPRl/KpQEviKbL+k
    9h0gDW2oeeaEkt7r3KwzroNmau/hmDCyktSClCocF/sCzMZjMEiUPWYBcH0CAwEA
    AQKCAgABJVzdriG7r9aXnHre/gdiArqR8/LXiYrYR935tfA33hj4vc38yzAOmvBL
    7RXmMMbfwqDWSrtpxpfiuMgcYaHgfFnqfDP4EeCfBVwhLaUhk3AN/z8IE9MLMnqR
    iFvXjdobj5qNz0hs/JXYOsYQgHl82l6yzQAGP4/nRb17y71i7g/HrJZxtyciITI4
    XtN/xM9RKT4wTk1J/E+xmMZhkt6WYJxZWO+vOdtChMR08mYwziAsAiK4XaYs4Mfp
    lXuCwmg3aHauyJxEg3/n4g55AKxaytjvWwaUsMp6OmGjg6r9sqZOIFOUQXQvAylM
    1yJGrOuagiRPCf81wAeZ0oOrOS7R+4fF4Ypa+V7Cp6Ty3VPcw8BFpXJ6fRtf92kh
    ix00DnFEK/TdndyBpFKdmf8f2SSFBLrPlmTfjdMAvShE5yFpeWyXQjftI5q/0d3U
    Ug0MBby66yT/TZtTKVPdK6bG3fYvzgKCpZGrKgn+umq4XR+gh9S0ptmwNF5mzJy4
    mol5CkazGPlOSwlBc4oKeepcqZ0TKCJwonub90CJeH8IKoyRsswShRl6YTRza1SB
    Fx4Gis5xcaNp7eXnLBDgKV/1bhCUSvQ886r+Xo4nfhk9n8WrtaQFC4tFID1e8TAM
    jYxZIBpCHOZHX/+BpC3FyqD4RbI12iudyz4KwS5Ps/wlIpVMQQKCAQEA/70X3Fz2
    SJyPP9UdiiqLot1ppbagQGjG20yFnfRDhNY+q2U8N77yJUXWvE7YQ6OUTOaPuJX2
    X7vulTSQ0YyFYp0B5G4QiFtvPOpBvn7OxrFKBKxwbOU7L2rAuXWYEIRuKuwBRMFU
    oaar8gkKlnsUtUxrLM827gmL13i3GX2bmm6NhhGCKbSCoD51+UUGo7Ix5ZLznKmX
    G1mq4IxtJe8vLk/9RT9CzRV7VO61EgEh7Iji7g4cDIiZV+B9gG8YMlTOcALPpgud
    nF7SEvDuMH3dgOj+iSO9piJ53okU59Mk4Nyka3p3v6RABMcDYO1/wkbE83+Oobrx
    RiRQHtBgo1r9cQKCAQEA+cNpxVCi/BkatlzKentRabnQjfxrEQdIdc9xqzr5k2xK
    w9n+XGzeNT+HKI/S1KkfvJTQC0j9WBQ3uupf8Zg6/mNF84YCXpun3JXpvzc+4ya3
    i1AXtdul/JYU5qhMrJI+I1WXrWAls5zbIs23iz1Fq530Mb7FUQ5jmO0p123AmMGG
    hSTJDqvKDMpQXdUYQMqrSL/aNh8u7wpw2S052uj2bdbdgq1FboLzbwWTOsVYs3aS
    HABb95263Cf3OdRr4lyN6khFMLhQPUhYnn6l2ob0kIZ7V2f8fxKvJoTTDTxWpUgF
    FrdHigaDo09WYkIukj+YdSZY/ZEAu7lyMmY0l8HNzQKCAQEA7HE3jlWknp2hE7NG
    DGgpkfqDouKmZuZ4dGjbYJ5ljntGldCTTDcOSce4MYH0ERU8F51TY6XCk+B9RRXE
    jvkMmY/wH/Ji9q8SuY8cGbPEGY/wj0Ge8A9AGSbp6I4AecT21lg9FARq6sneT3hs
    gZRqIPT2YgdzEcFhuWWyY67uHmn4DuxBG634147oI/7dlJs75rVm5oElY/QTOGic
    wWXSiU8LKurCKDqkPHI2lt7VLougw9fntu7UV5sGbahJBr/B3W277hjvL5O7Rifb
    EJpOINFKBCE3RlK5ujWjTnK4te1JVtVzwYtqZQBa71KlvEkR7s8QYBcm22LXcKXX
    szB9AQKCAQEAwUua8DoX6UMEiV4G1gPaXhiQb1KLCgK48XQ6ZGqf/JgyxKBRWvZm
    go9H6vxkDnFVPn1tBU7XwvLirqX02uUVwwrReEaeTtnob68V2AbJhMLSCd9Sekwj
    ifgc9OYLcQM9U9tKJ8PhacBbV/QduIUTBl6YPmeGDdU0/4WMfE1UYORlV2XAtLn/
    BScOS5A/1OUE6qiQGJLJn/ZUn7+ApwrkrN09UYUH1x9BhwqphzJ0E3AQY9tjUZ+g
    ngHQM9FSLT20Fz0XTz1V3BfBfehGM3l+jNuHWX4Ay9eJ9iWVsQihhgjW512w4AFq
    n1knYaQWptjRBNlIxfUSvDYpSxgOW+SBgQKCAQEA7ikfNUZDmhyShcmIl9Hgcral
    o2M/ggUVwWd9AaJD+Y/WcGoR0DPGt8UGLGTBNBwbyTgHdDzsWA+02r5r+5ArhhnP
    iWQ1soQI9FpZIUCyzAjTQpfpzo5dGqpQbW9LuHJOEbDyY2wG+lFhIm4JJBJ/vws1
    yt9Y170VbPXmDdLevDLmlFOILdMJWWl3hrtlU3KEogqWKDOXciYtG5Ji0+512BqH
    yY9+uVNb1eu6MLU5R5U9GdvOFZZjShIhOlpZVR1K21dg5frBCWBZ0pvu4fZf2FAV
    lX6+ORENSjqJsQWTaeiMoAPOj8QxQuOwUCajbVkrCZV6D49E0D9XxmZcuKCAXg==
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
				await sp.parseLoginResponse(idp, saml.Constants.wording.binding.post, {
					body: { SAMLResponse },
				});

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

// Shared mock SAML IdP for all tests
const sharedMockIdP = createMockSAMLIdP(8081);

beforeAll(async () => {
	await sharedMockIdP.start();
});

afterAll(async () => {
	await sharedMockIdP.stop();
});

describe("SAML SSO with defaultSSO array", async () => {
	const data = {
		user: [],
		session: [],
		verification: [],
		account: [],
		ssoProvider: [],
	};

	const memory = memoryAdapter(data);

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

describe("SAML SSO with signed AuthnRequests", async () => {
	// IdP metadata with WantAuthnRequestsSigned="true" for testing signed requests
	const idpMetadataWithSignedRequests = `
    <md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="http://localhost:8081/api/sso/saml2/idp/metadata">
    <md:IDPSSODescriptor WantAuthnRequestsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        <md:KeyDescriptor use="signing">
        <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
            <ds:X509Data>
            <ds:X509Certificate>MIIFOjCCAyICCQCqP5DN+xQZDjANBgkqhkiG9w0BAQsFADBfMQswCQYDVQQGEwJVUzEQMA4GA1UECAwHRmxvcmlkYTEQMA4GA1UEBwwHT3JsYW5kbzENMAsGA1UECgwEVGVzdDEdMBsGCSqGSIb3DQEJARYOdGVzdEBnbWFpbC5jb20wHhcNMjMxMTE5MTIzNzE3WhcNMzMxMTE2MTIzNzE3WjBfMQswCQYDVQQGEwJVUzEQMA4GA1UECAwHRmxvcmlkYTEQMA4GA1UEBwwHT3JsYW5kbzENMAsGA1UECgwEVGVzdDEdMBsGCSqGSIb3DQEJARYOdGVzdEBnbWFpbC5jb20wggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQD5giLoLyED41IHt0RxB/k6x4K0vzAKiGecPyedRNR1oyiv3OYkuG5jgTE2wcPZc7kD1Eg5d6th0BWHy/ovaNS5mkgnOV6jKkMaWW4sCMSnLnaWy0seftPK3O4mNeZpM5e9amj2gXnZvKrK8cqnJ/bsUUQvXxttXNVVmOHWg/t3c2vJ4XuUfph6wIKbrj297ILzuAFRNvAVxeS0tElwepvZ5Wbf7Hc1MORAqTpw/mp8cRjHRzYCA9y6OM4hgVs1gvTJS8WGoMmsdAZHaOnv9vLJvW3jDLQQecOheYIJncWgcESzJFIkmXadorYCEfWhwwBdVphknmeLr4BMpJBclAYaFjYDLIKpMcXYO5k/2r3BgSPlw4oqbxbR5geD05myKYtZ/wNUtku118NjhIfJFulU/kfDcp1rYYkvzgBfqr80wgNps4oQzVr1mnpgHsSTAhXMuZbaTByJRmPqecyvyQqRQcRIN0oTLJNGyzoUf0RkH6DKJ4+7qDhlq4Zhlfso9OFMv9xeONfIrJo5HtTfFZfidkXZqir2ZqwqNlNOMfK5DsYq37x2Gkgqig4nqLpITXyxfnQpL2HsaoFrlctt/OL+Zqba7NT4heYk9GX8qlAS+Ipsv6T2HSANbah55oSS3uvcrDOug2Zq7+GYMLKS1IKUKhwX+wLMxmMwSJQ9ZgFwfQIDAQABMA0GCSqGSIb3DQEBCwUAA4ICAQCkGPZdflocTSXIe5bbehsBn/IPdyb38eH2HaAvWqO2XNcDcq+6/uLc8BVK4JMa3AFS9xtBza7MOXN/lw/Ccb8uJGVNUE31+rTvsJaDtMCQkp+9aG04I1BonEHfSB0ANcTy/Gp+4hKyFCd6x35uyPO7CWX5Z8I87q9LF6Dte3/v1j7VZgDjAi9yHpBJv9Xje33AK1vF+WmEfDUOi8y2B8htVeoyS3owln3ZUbnmJdCmMp2BMRq63ymINwklEaYaNrp1L201bSqNdKZF2sNwROWyDX+WFYgufrnzPYb6HS8gYb4oEZmaG5cBM7Hs730/3BlbHKhxNTy1Io2TVCYcMQD+ieiVg5e5eGTwaPYGuVvY3NVhO8FaYBG7K2NT2hqutdCMaQpGyHEzbbbTY1afhbeMmWWqivRnVJNDv4kgBc2SE8JO82qHikIW9Om0cghC5xwTT+1JTtxxD1KeC1M1IwLzzuuMmwJSKAsv4duDqN+YRIP78J2SlrssqlsmoF8+48e7Vzr7JRT/Ya274P8RpUPNtxTR7WDmZ4tunqXjiBpz6l0uTtVXnj5UBo4HCyRjWJOGf15OCuQX03qz8tKn1IbZUf723qrmSF+cxBwHqpAywqhTSsaLjIXKnQ0UlMov7QWb0a5N07JZMdMSerbHvbXd/z9S1Ssea2+EGuTYuQur3A==</ds:X509Certificate>
            </ds:X509Data>
        </ds:KeyInfo>
        </md:KeyDescriptor>
        <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="http://localhost:8081/api/sso/saml2/idp/redirect"/>
        <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="http://localhost:8081/api/sso/saml2/idp/post"/>
        </md:IDPSSODescriptor>
    </md:EntityDescriptor>
    `;

	const data = {
		user: [],
		session: [],
		verification: [],
		account: [],
		ssoProvider: [],
	};

	const memory = memoryAdapter(data);

	const ssoOptions = {
		defaultSSO: [
			{
				domain: "localhost:8081",
				providerId: "signed-saml",
				samlConfig: {
					issuer: "http://localhost:8081",
					entryPoint: "http://localhost:8081/api/sso/saml2/idp/post",
					cert: certificate,
					callbackUrl: "http://localhost:8081/dashboard",
					wantAssertionsSigned: false,
					authnRequestsSigned: true,
					signatureAlgorithm: "sha256",
					digestAlgorithm: "sha256",
					privateKey: idPk,
					spMetadata: {
						privateKey: idPk,
					},
					idpMetadata: {
						metadata: idpMetadataWithSignedRequests,
					},
					identifierFormat:
						"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
				},
			},
		],
	};

	const auth = betterAuth({
		database: memory,
		baseURL: "http://localhost:3000",
		emailAndPassword: {
			enabled: true,
		},
		plugins: [sso(ssoOptions)],
	});

	it("should generate signed AuthnRequest when authnRequestsSigned is true", async () => {
		const signInResponse = await auth.api.signInSSO({
			body: {
				providerId: "signed-saml",
				callbackURL: "http://localhost:3000/dashboard",
			},
		});

		expect(signInResponse).toEqual({
			url: expect.stringContaining("http://localhost:8081"),
			redirect: true,
		});
		// When authnRequestsSigned is true and privateKey is provided,
		// samlify adds Signature and SigAlg parameters to the redirect URL
		expect(signInResponse.url).toContain("Signature=");
		expect(signInResponse.url).toContain("SigAlg=");
	});
});

describe("SAML SSO without signed AuthnRequests", async () => {
	const data = {
		user: [],
		session: [],
		verification: [],
		account: [],
		ssoProvider: [],
	};

	const memory = memoryAdapter(data);

	const ssoOptions = {
		defaultSSO: [
			{
				domain: "localhost:8082",
				providerId: "unsigned-saml",
				samlConfig: {
					issuer: "http://localhost:8082",
					entryPoint: "http://localhost:8081/api/sso/saml2/idp/post",
					cert: certificate,
					callbackUrl: "http://localhost:8082/dashboard",
					wantAssertionsSigned: false,
					authnRequestsSigned: false,
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
	};

	const auth = betterAuth({
		database: memory,
		baseURL: "http://localhost:3000",
		emailAndPassword: {
			enabled: true,
		},
		plugins: [sso(ssoOptions)],
	});

	it("should NOT include Signature in URL when authnRequestsSigned is false", async () => {
		const signInResponse = await auth.api.signInSSO({
			body: {
				providerId: "unsigned-saml",
				callbackURL: "http://localhost:3000/dashboard",
			},
		});

		expect(signInResponse).toEqual({
			url: expect.stringContaining("http://localhost:8081"),
			redirect: true,
		});
		// When authnRequestsSigned is false (default), no Signature should be in the URL
		expect(signInResponse.url).not.toContain("Signature=");
		expect(signInResponse.url).not.toContain("SigAlg=");
	});
});

describe("SAML SSO with idpMetadata but without metadata XML (fallback to top-level config)", async () => {
	const data = {
		user: [],
		session: [],
		verification: [],
		account: [],
		ssoProvider: [],
	};

	const memory = memoryAdapter(data);

	// This tests the fix for signInSSO where IdentityProvider was incorrectly constructed
	// when idpMetadata is provided but without a full metadata XML.
	// The bug was:
	// 1. Using encryptCert instead of signingCert (samlify expects signingCert)
	// 2. Not falling back to parsedSamlConfig.issuer when entityID is missing
	// 3. Not falling back to parsedSamlConfig.entryPoint when singleSignOnService is missing
	const ssoOptions = {
		defaultSSO: [
			{
				domain: "localhost:8083",
				providerId: "partial-idp-metadata-saml",
				samlConfig: {
					issuer: "http://localhost:8083/issuer",
					entryPoint: "http://localhost:8081/api/sso/saml2/idp/redirect",
					cert: certificate,
					callbackUrl: "http://localhost:8083/dashboard",
					wantAssertionsSigned: false,
					authnRequestsSigned: false,
					spMetadata: {},
					// idpMetadata is provided but WITHOUT metadata XML - this triggers the fallback path
					// The fix ensures signingCert is used (not encryptCert) and entryPoint/issuer fallbacks work
					idpMetadata: {
						// No metadata XML provided
						// cert could be provided here, but we test fallback to top-level cert
						entityID: "http://localhost:8081/custom-entity-id",
					},
					identifierFormat:
						"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
				},
			},
		],
	};

	const auth = betterAuth({
		database: memory,
		baseURL: "http://localhost:3000",
		emailAndPassword: {
			enabled: true,
		},
		plugins: [sso(ssoOptions)],
	});

	it("should initiate SAML login using fallback entryPoint when idpMetadata has no metadata XML", async () => {
		const signInResponse = await auth.api.signInSSO({
			body: {
				providerId: "partial-idp-metadata-saml",
				callbackURL: "http://localhost:3000/dashboard",
			},
		});

		// The URL should point to the entryPoint from top-level config (fallback)
		expect(signInResponse).toEqual({
			url: expect.stringContaining(
				"http://localhost:8081/api/sso/saml2/idp/redirect",
			),
			redirect: true,
		});
		// The URL should contain a SAMLRequest parameter, proving the IdP was constructed correctly
		// with signingCert (not encryptCert) - if encryptCert was used, samlify would fail
		expect(signInResponse.url).toContain("SAMLRequest=");
	});

	it("should use idpMetadata.entityID when provided (not fall back to issuer)", async () => {
		const signInResponse = await auth.api.signInSSO({
			body: {
				providerId: "partial-idp-metadata-saml",
				callbackURL: "http://localhost:3000/dashboard",
			},
		});

		// The fact that we get a valid SAMLRequest proves the IdentityProvider
		// was constructed correctly. The entityID from idpMetadata should be used.
		const url = new URL(signInResponse.url);
		const samlRequest = url.searchParams.get("SAMLRequest");
		expect(samlRequest).toBeTruthy();
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
		await authClient.signUp.email({
			email: testUser.email,
			password: testUser.password,
			name: testUser.name,
		});
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
		await authClient.signIn.email(testUser, {
			throw: true,
			onSuccess: setCookieToHeader(headers),
		});
		return headers;
	}

	it("should register a new SAML provider", async () => {
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
					entryPoint: sharedMockIdP.metadataUrl,
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
				entryPoint: sharedMockIdP.metadataUrl,
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
					entryPoint: sharedMockIdP.metadataUrl,
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
					entryPoint: sharedMockIdP.metadataUrl,
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
		await authClient.signIn.email(testUser, {
			throw: true,
			onSuccess: setCookieToHeader(headers),
		});
		await auth.api.registerSSOProvider({
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
						entryPoint: sharedMockIdP.metadataUrl,
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
					entryPoint: sharedMockIdP.metadataUrl,
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
						entryPoint: sharedMockIdP.metadataUrl,
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
					entryPoint: sharedMockIdP.metadataUrl,
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
						entryPoint: sharedMockIdP.metadataUrl,
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
					entryPoint: sharedMockIdP.metadataUrl,
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
						entryPoint: sharedMockIdP.metadataUrl,
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

	it("should initiate SAML login and validate RelayState", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();
		await auth.api.registerSSOProvider({
			body: {
				providerId: "saml-provider-1",
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

		const response = await auth.api.signInSSO({
			body: {
				providerId: "saml-provider-1",
				callbackURL: "http://localhost:3000/dashboard",
			},
			returnHeaders: true,
		});

		const signInResponse = response.response;
		expect(signInResponse).toEqual({
			url: expect.stringContaining("http://localhost:8081"),
			redirect: true,
		});

		let samlResponse: any;
		await betterFetch(signInResponse?.url, {
			onSuccess: async (context) => {
				samlResponse = await context.data;
			},
		});

		const samlRedirectUrl = new URL(signInResponse?.url);
		const callbackResponse = await auth.api.callbackSSOSAML({
			method: "POST",
			body: {
				SAMLResponse: samlResponse.samlResponse,
				RelayState: samlRedirectUrl.searchParams.get("RelayState") ?? "",
			},
			headers: {
				Cookie: response.headers.get("set-cookie") ?? "",
			},
			params: {
				providerId: "saml-provider-1",
			},
			asResponse: true,
		});

		expect(callbackResponse.headers.get("location")).toContain("dashboard");
	});

	it("should initiate SAML login and fallback to callbackUrl on invalid RelayState", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();
		await auth.api.registerSSOProvider({
			body: {
				providerId: "saml-provider-1",
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

		const response = await auth.api.signInSSO({
			body: {
				providerId: "saml-provider-1",
				callbackURL: "http://localhost:3000/dashboard",
			},
			returnHeaders: true,
		});

		const signInResponse = response.response;
		expect(signInResponse).toEqual({
			url: expect.stringContaining("http://localhost:8081"),
			redirect: true,
		});

		let samlResponse: any;
		await betterFetch(signInResponse?.url, {
			onSuccess: async (context) => {
				samlResponse = await context.data;
			},
		});

		const callbackResponse = await auth.api.callbackSSOSAML({
			method: "POST",
			body: {
				SAMLResponse: samlResponse.samlResponse,
				RelayState: "not-the-right-relay-state",
			},
			headers: {
				Cookie: response.headers.get("set-cookie") ?? "",
			},
			params: {
				providerId: "saml-provider-1",
			},
			asResponse: true,
		});

		expect(callbackResponse.status).toBe(302);
		expect(callbackResponse.headers.get("location")).toBe(
			"http://localhost:3000/dashboard",
		);
	});

	it("should initiate SAML login and signup user when disableImplicitSignUp is true but requestSignup is explicitly enabled", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso({ disableImplicitSignUp: true })],
		});

		const { headers } = await signInWithTestUser();
		await auth.api.registerSSOProvider({
			body: {
				providerId: "saml-provider-1",
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

		const response = await auth.api.signInSSO({
			body: {
				providerId: "saml-provider-1",
				callbackURL: "http://localhost:3000/dashboard",
				requestSignUp: true,
			},
			returnHeaders: true,
		});

		const signInResponse = response.response;
		expect(signInResponse).toEqual({
			url: expect.stringContaining("http://localhost:8081"),
			redirect: true,
		});

		let samlResponse: any;
		await betterFetch(signInResponse?.url, {
			onSuccess: async (context) => {
				samlResponse = await context.data;
			},
		});

		const samlRedirectUrl = new URL(signInResponse?.url);
		const callbackResponse = await auth.api.callbackSSOSAML({
			method: "POST",
			body: {
				SAMLResponse: samlResponse.samlResponse,
				RelayState: samlRedirectUrl.searchParams.get("RelayState") ?? "",
			},
			headers: {
				Cookie: response.headers.get("set-cookie") ?? "",
			},
			params: {
				providerId: "saml-provider-1",
			},
			asResponse: true,
		});

		expect(callbackResponse.headers.get("location")).toContain("dashboard");
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

		const response = await authWithDisabledSignUp.handler(
			new Request(
				"http://localhost:3000/api/auth/sso/saml2/callback/saml-test-provider",
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
		expect(redirectLocation).toContain("error=signup_disabled");
	});

	it("should reject SAML ACS (IdP-initiated) when disableImplicitSignUp is true and user doesn't exist", async () => {
		const { auth: authWithDisabledSignUp, signInWithTestUser } =
			await getTestInstance({
				plugins: [sso({ disableImplicitSignUp: true })],
			});

		const { headers } = await signInWithTestUser();

		await authWithDisabledSignUp.api.registerSSOProvider({
			body: {
				providerId: "saml-acs-test-provider",
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

		let samlResponse: any;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = await context.data;
			},
		});

		const response = await authWithDisabledSignUp.handler(
			new Request(
				"http://localhost:3000/api/auth/sso/saml2/sp/acs/saml-acs-test-provider",
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
		expect(redirectLocation).toContain("error=signup_disabled");
	});

	it("should deny account linking when provider is not trusted and domain is not verified", async () => {
		const { auth: authUntrusted, signInWithTestUser } = await getTestInstance({
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
					}),
				},
			),
		);

		expect(response.status).toBe(302);
		const redirectLocation = response.headers.get("location") || "";
		expect(redirectLocation).not.toContain("error");
		expect(redirectLocation).toContain("dashboard");
	});

	it("should reject unsolicited SAML response when allowIdpInitiated is false", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				sso({
					saml: {
						enableInResponseToValidation: true,
						allowIdpInitiated: false,
					},
				}),
			],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "strict-saml-provider",
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

		let samlResponse: any;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = await context.data;
			},
		});

		const response = await auth.handler(
			new Request(
				"http://localhost:3000/api/auth/sso/saml2/callback/strict-saml-provider",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						SAMLResponse: samlResponse.samlResponse,
					}),
				},
			),
		);

		expect(response.status).toBe(302);
		const redirectLocation = response.headers.get("location") || "";
		expect(redirectLocation).toContain("error=unsolicited_response");
	});

	it("should allow unsolicited SAML response when allowIdpInitiated is true (default)", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				sso({
					saml: {
						enableInResponseToValidation: true,
						allowIdpInitiated: true,
					},
				}),
			],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "permissive-saml-provider",
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

		let samlResponse: any;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = await context.data;
			},
		});

		const response = await auth.handler(
			new Request(
				"http://localhost:3000/api/auth/sso/saml2/callback/permissive-saml-provider",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						SAMLResponse: samlResponse.samlResponse,
					}),
				},
			),
		);

		expect(response.status).toBe(302);
		const redirectLocation = response.headers.get("location") || "";
		expect(redirectLocation).not.toContain("error=unsolicited_response");
	});

	it("should skip InResponseTo validation when not explicitly enabled (backward compatibility)", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "legacy-saml-provider",
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

		let samlResponse: any;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = await context.data;
			},
		});

		const response = await auth.handler(
			new Request(
				"http://localhost:3000/api/auth/sso/saml2/callback/legacy-saml-provider",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						SAMLResponse: samlResponse.samlResponse,
					}),
				},
			),
		);

		expect(response.status).toBe(302);
		const redirectLocation = response.headers.get("location") || "";
		expect(redirectLocation).not.toContain("error=");
	});

	it("should use verification table for InResponseTo validation", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				sso({
					saml: {
						enableInResponseToValidation: true,
						allowIdpInitiated: false,
					},
				}),
			],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "db-fallback-provider",
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

		// Try to use an unsolicited response - should be rejected since allowIdpInitiated is false
		// This proves the validation is working via the verification table fallback
		let samlResponse: any;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = await context.data;
			},
		});

		const response = await auth.handler(
			new Request(
				"http://localhost:3000/api/auth/sso/saml2/callback/db-fallback-provider",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						SAMLResponse: samlResponse.samlResponse,
					}),
				},
			),
		);

		// Should reject unsolicited response, proving validation is active
		expect(response.status).toBe(302);
		const redirectLocation = response.headers.get("location") || "";
		expect(redirectLocation).toContain("error=unsolicited_response");
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
		await authClient.signUp.email({
			email: testUser.email,
			password: testUser.password,
			name: testUser.name,
		});
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
					entryPoint: sharedMockIdP.metadataUrl,
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
				entryPoint: sharedMockIdP.metadataUrl,
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
		const { OAuth2Server } = await import("oauth2-mock-server");
		const oidcServer = new OAuth2Server();

		await oidcServer.issuer.keys.generate("RS256");
		await oidcServer.start(8082, "localhost");

		try {
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
				trustedOrigins: ["http://localhost:8082"],
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
					issuer: oidcServer.issuer.url!,
					domain: "example.com",
					oidcConfig: {
						clientId: "test-client",
						clientSecret: "test-secret",
						tokenEndpointAuthentication: "client_secret_basic",
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
		} finally {
			await oidcServer.stop().catch(() => {});
		}
	});
});

describe("SAML SSO - IdP Initiated Flow", () => {
	it("should handle IdP-initiated flow with GET after POST redirect", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "idp-initiated-provider",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: sharedMockIdP.metadataUrl.replace(
						"/idp/metadata",
						"/idp/post",
					),
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

		let samlResponse:
			| { samlResponse: string; entityEndpoint?: string }
			| undefined;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = context.data as {
					samlResponse: string;
					entityEndpoint?: string;
				};
			},
		});

		if (!samlResponse?.samlResponse) {
			throw new Error("Failed to get SAML response from mock IdP");
		}

		const postResponse = await auth.api.callbackSSOSAML({
			method: "POST",
			body: {
				SAMLResponse: samlResponse.samlResponse,
				RelayState: "http://localhost:3000/dashboard",
			},
			params: {
				providerId: "idp-initiated-provider",
			},
			asResponse: true,
		});

		expect(postResponse).toBeInstanceOf(Response);
		expect(postResponse.status).toBe(302);
		const redirectLocation = postResponse.headers.get("location");
		expect(redirectLocation).toBe("http://localhost:3000/dashboard");

		const cookieHeader = postResponse.headers.get("set-cookie");
		const getResponse = await auth.api.callbackSSOSAML({
			method: "GET",
			query: {
				RelayState: "http://localhost:3000/dashboard",
			},
			params: {
				providerId: "idp-initiated-provider",
			},
			headers: cookieHeader ? { cookie: cookieHeader } : undefined,
			asResponse: true,
		});

		expect(getResponse).toBeInstanceOf(Response);
		expect(getResponse.status).toBe(302);
		const getRedirectLocation = getResponse.headers.get("location");
		expect(getRedirectLocation).toBe("http://localhost:3000/dashboard");
	});

	it("should reject direct GET request without session", async () => {
		const { auth } = await getTestInstance({
			plugins: [sso()],
		});

		const getResponse = await auth.api
			.callbackSSOSAML({
				method: "GET",
				params: {
					providerId: "test-provider",
				},
				asResponse: true,
			})
			.catch((e) => {
				if (e instanceof APIError && e.status === "FOUND") {
					return new Response(null, {
						status: e.statusCode,
						headers: e.headers || new Headers(),
					});
				}
				throw e;
			});

		expect(getResponse).toBeInstanceOf(Response);
		expect(getResponse.status).toBe(302);
		const redirectLocation = getResponse.headers.get("location");
		expect(redirectLocation).toContain("/error");
		expect(redirectLocation).toContain("error=invalid_request");
	});

	it("should prevent redirect loop when callbackUrl points to callback route", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		const callbackRouteUrl =
			"http://localhost:3000/api/auth/sso/saml2/callback/loop-test-provider";

		await auth.api.registerSSOProvider({
			body: {
				providerId: "loop-test-provider",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: sharedMockIdP.metadataUrl.replace(
						"/idp/metadata",
						"/idp/post",
					),
					cert: certificate,
					callbackUrl: callbackRouteUrl,
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

		let samlResponse:
			| { samlResponse: string; entityEndpoint?: string }
			| undefined;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = context.data as {
					samlResponse: string;
					entityEndpoint?: string;
				};
			},
		});

		if (!samlResponse?.samlResponse) {
			throw new Error("Failed to get SAML response from mock IdP");
		}

		const postResponse = await auth.api.callbackSSOSAML({
			method: "POST",
			body: {
				SAMLResponse: samlResponse.samlResponse,
			},
			params: {
				providerId: "loop-test-provider",
			},
			asResponse: true,
		});

		expect(postResponse).toBeInstanceOf(Response);
		expect(postResponse.status).toBe(302);
		const redirectLocation = postResponse.headers.get("location");
		expect(redirectLocation).not.toBe(callbackRouteUrl);
		expect(redirectLocation).toBe("http://localhost:3000");
	});

	it("should handle GET request with RelayState in query", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "relaystate-provider",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: sharedMockIdP.metadataUrl.replace(
						"/idp/metadata",
						"/idp/post",
					),
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

		let samlResponse:
			| { samlResponse: string; entityEndpoint?: string }
			| undefined;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = context.data as {
					samlResponse: string;
					entityEndpoint?: string;
				};
			},
		});

		if (!samlResponse?.samlResponse) {
			throw new Error("Failed to get SAML response from mock IdP");
		}

		const postResponse = await auth.api.callbackSSOSAML({
			method: "POST",
			body: {
				SAMLResponse: samlResponse.samlResponse,
				RelayState: "http://localhost:3000/custom-path",
			},
			params: {
				providerId: "relaystate-provider",
			},
			asResponse: true,
		});

		const cookieHeader = postResponse.headers.get("set-cookie");
		const getResponse = await auth.api.callbackSSOSAML({
			method: "GET",
			query: {
				RelayState: "http://localhost:3000/custom-path",
			},
			params: {
				providerId: "relaystate-provider",
			},
			headers: cookieHeader ? { cookie: cookieHeader } : undefined,
			asResponse: true,
		});

		expect(getResponse).toBeInstanceOf(Response);
		expect(getResponse.status).toBe(302);
		const redirectLocation = getResponse.headers.get("location");
		expect(redirectLocation).toBe("http://localhost:3000/custom-path");
	});

	it("should handle GET request when POST redirects to callback URL (original issue scenario)", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		const callbackRouteUrl =
			"http://localhost:3000/api/auth/sso/saml2/callback/issue-6615-provider";

		await auth.api.registerSSOProvider({
			body: {
				providerId: "issue-6615-provider",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: sharedMockIdP.metadataUrl.replace(
						"/idp/metadata",
						"/idp/post",
					),
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

		let samlResponse:
			| { samlResponse: string; entityEndpoint?: string }
			| undefined;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = context.data as {
					samlResponse: string;
					entityEndpoint?: string;
				};
			},
		});

		if (!samlResponse?.samlResponse) {
			throw new Error("Failed to get SAML response from mock IdP");
		}

		const postResponse = await auth.api.callbackSSOSAML({
			method: "POST",
			body: {
				SAMLResponse: samlResponse.samlResponse,
				RelayState: callbackRouteUrl,
			},
			params: {
				providerId: "issue-6615-provider",
			},
			asResponse: true,
		});

		expect(postResponse).toBeInstanceOf(Response);
		expect(postResponse.status).toBe(302);
		const postRedirectLocation = postResponse.headers.get("location");
		expect(postRedirectLocation).not.toBe(callbackRouteUrl);
		expect(postRedirectLocation).toBe("http://localhost:3000/dashboard");

		const cookieHeader = postResponse.headers.get("set-cookie");
		const getResponse = await auth.api.callbackSSOSAML({
			method: "GET",
			params: {
				providerId: "issue-6615-provider",
			},
			headers: cookieHeader ? { cookie: cookieHeader } : undefined,
			asResponse: true,
		});

		expect(getResponse).toBeInstanceOf(Response);
		expect(getResponse.status).toBe(302);
		const getRedirectLocation = getResponse.headers.get("location");
		expect(getRedirectLocation).toBe("http://localhost:3000");
	});

	it("should prevent open redirect with malicious RelayState URL", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "open-redirect-test-provider",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: sharedMockIdP.metadataUrl.replace(
						"/idp/metadata",
						"/idp/post",
					),
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

		let samlResponse:
			| { samlResponse: string; entityEndpoint?: string }
			| undefined;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = context.data as {
					samlResponse: string;
					entityEndpoint?: string;
				};
			},
		});

		if (!samlResponse?.samlResponse) {
			throw new Error("Failed to get SAML response from mock IdP");
		}

		// Test POST with malicious RelayState - raw RelayState is not trusted
		// Falls back to parsedSamlConfig.callbackUrl
		const postResponse = await auth.api.callbackSSOSAML({
			method: "POST",
			body: {
				SAMLResponse: samlResponse.samlResponse,
				RelayState: "https://evil.com/phishing",
			},
			params: {
				providerId: "open-redirect-test-provider",
			},
			asResponse: true,
		});

		expect(postResponse).toBeInstanceOf(Response);
		expect(postResponse.status).toBe(302);
		const postRedirectLocation = postResponse.headers.get("location");
		// Should NOT redirect to evil.com - raw RelayState is ignored
		expect(postRedirectLocation).not.toContain("evil.com");
		// Falls back to samlConfig.callbackUrl
		expect(postRedirectLocation).toBe("http://localhost:3000/dashboard");
	});

	it("should prevent open redirect via GET with malicious RelayState", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "open-redirect-get-provider",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: sharedMockIdP.metadataUrl.replace(
						"/idp/metadata",
						"/idp/post",
					),
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

		let samlResponse:
			| { samlResponse: string; entityEndpoint?: string }
			| undefined;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = context.data as {
					samlResponse: string;
					entityEndpoint?: string;
				};
			},
		});

		if (!samlResponse?.samlResponse) {
			throw new Error("Failed to get SAML response from mock IdP");
		}

		// First do POST to establish session
		const postResponse = await auth.api.callbackSSOSAML({
			method: "POST",
			body: {
				SAMLResponse: samlResponse.samlResponse,
			},
			params: {
				providerId: "open-redirect-get-provider",
			},
			asResponse: true,
		});

		const cookieHeader = postResponse.headers.get("set-cookie");

		// Test GET with malicious RelayState in query params
		const getResponse = await auth.api.callbackSSOSAML({
			method: "GET",
			query: {
				RelayState: "https://evil.com/steal-cookies",
			},
			params: {
				providerId: "open-redirect-get-provider",
			},
			headers: cookieHeader ? { cookie: cookieHeader } : undefined,
			asResponse: true,
		});

		expect(getResponse).toBeInstanceOf(Response);
		expect(getResponse.status).toBe(302);
		const getRedirectLocation = getResponse.headers.get("location");
		// Should NOT redirect to evil.com
		expect(getRedirectLocation).not.toContain("evil.com");
		expect(getRedirectLocation).toBe("http://localhost:3000");
	});

	it("should allow relative path redirects", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "relative-path-provider",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: sharedMockIdP.metadataUrl.replace(
						"/idp/metadata",
						"/idp/post",
					),
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

		let samlResponse:
			| { samlResponse: string; entityEndpoint?: string }
			| undefined;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = context.data as {
					samlResponse: string;
					entityEndpoint?: string;
				};
			},
		});

		if (!samlResponse?.samlResponse) {
			throw new Error("Failed to get SAML response from mock IdP");
		}

		const postResponse = await auth.api.callbackSSOSAML({
			method: "POST",
			body: {
				SAMLResponse: samlResponse.samlResponse,
				RelayState: "/dashboard/settings",
			},
			params: {
				providerId: "relative-path-provider",
			},
			asResponse: true,
		});

		expect(postResponse).toBeInstanceOf(Response);
		expect(postResponse.status).toBe(302);
		const redirectLocation = postResponse.headers.get("location");
		expect(redirectLocation).toBe("http://localhost:3000/dashboard");
	});

	it("should block protocol-relative URL attacks (//evil.com)", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "protocol-relative-provider",
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: sharedMockIdP.metadataUrl.replace(
						"/idp/metadata",
						"/idp/post",
					),
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

		let samlResponse:
			| { samlResponse: string; entityEndpoint?: string }
			| undefined;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = context.data as {
					samlResponse: string;
					entityEndpoint?: string;
				};
			},
		});

		if (!samlResponse?.samlResponse) {
			throw new Error("Failed to get SAML response from mock IdP");
		}

		// Test POST with protocol-relative URL - raw RelayState is not trusted
		// Falls back to parsedSamlConfig.callbackUrl
		const postResponse = await auth.api.callbackSSOSAML({
			method: "POST",
			body: {
				SAMLResponse: samlResponse.samlResponse,
				RelayState: "//evil.com/phishing",
			},
			params: {
				providerId: "protocol-relative-provider",
			},
			asResponse: true,
		});

		expect(postResponse).toBeInstanceOf(Response);
		expect(postResponse.status).toBe(302);
		const redirectLocation = postResponse.headers.get("location");
		// Should NOT redirect to evil.com - raw RelayState is ignored
		expect(redirectLocation).not.toContain("evil.com");
		// Falls back to samlConfig.callbackUrl
		expect(redirectLocation).toBe("http://localhost:3000/dashboard");
	});
});

describe("SAML SSO - Timestamp Validation", () => {
	describe("Valid assertions within time window", () => {
		it("should accept assertion with current NotBefore and future NotOnOrAfter", () => {
			const now = new Date();
			const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
			expect(() =>
				validateSAMLTimestamp({
					notBefore: now.toISOString(),
					notOnOrAfter: fiveMinutesFromNow.toISOString(),
				}),
			).not.toThrow();
		});

		it("should accept assertion within clock skew tolerance (expired 2 min ago with 5 min skew)", () => {
			const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
			expect(() =>
				validateSAMLTimestamp({ notOnOrAfter: twoMinutesAgo }),
			).not.toThrow();
		});

		it("should accept assertion with NotBefore slightly in future (within clock skew)", () => {
			const twoMinutesFromNow = new Date(
				Date.now() + 2 * 60 * 1000,
			).toISOString();
			expect(() =>
				validateSAMLTimestamp({ notBefore: twoMinutesFromNow }),
			).not.toThrow();
		});
	});

	describe("NotBefore validation (future-dated assertions)", () => {
		it("should reject assertion with NotBefore too far in future (beyond clock skew)", () => {
			const tenMinutesFromNow = new Date(
				Date.now() + 10 * 60 * 1000,
			).toISOString();
			expect(() =>
				validateSAMLTimestamp({ notBefore: tenMinutesFromNow }),
			).toThrow("SAML assertion is not yet valid");
		});

		it("should reject with custom strict clock skew (1 second)", () => {
			const threeSecondsFromNow = new Date(Date.now() + 3 * 1000).toISOString();
			expect(() =>
				validateSAMLTimestamp(
					{ notBefore: threeSecondsFromNow },
					{ clockSkew: 1000 },
				),
			).toThrow("SAML assertion is not yet valid");
		});
	});

	describe("NotOnOrAfter validation (expired assertions)", () => {
		it("should reject expired assertion (NotOnOrAfter in past beyond clock skew)", () => {
			const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
			expect(() =>
				validateSAMLTimestamp({ notOnOrAfter: tenMinutesAgo }),
			).toThrow("SAML assertion has expired");
		});

		it("should reject with custom strict clock skew (1 second)", () => {
			const threeSecondsAgo = new Date(Date.now() - 3 * 1000).toISOString();
			expect(() =>
				validateSAMLTimestamp(
					{ notOnOrAfter: threeSecondsAgo },
					{ clockSkew: 1000 },
				),
			).toThrow("SAML assertion has expired");
		});
	});

	describe("Boundary conditions (exactly at window edges)", () => {
		const FIXED_TIME = new Date("2024-01-15T12:00:00.000Z").getTime();

		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(FIXED_TIME);
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("should accept assertion expiring exactly at clock skew boundary", () => {
			const exactlyAtBoundary = new Date(
				FIXED_TIME - DEFAULT_CLOCK_SKEW_MS,
			).toISOString();
			expect(() =>
				validateSAMLTimestamp({ notOnOrAfter: exactlyAtBoundary }),
			).not.toThrow();
		});

		it("should reject assertion expiring 1ms beyond clock skew boundary", () => {
			const justPastBoundary = new Date(
				FIXED_TIME - DEFAULT_CLOCK_SKEW_MS - 1,
			).toISOString();
			expect(() =>
				validateSAMLTimestamp({ notOnOrAfter: justPastBoundary }),
			).toThrow("SAML assertion has expired");
		});

		it("should accept assertion with NotBefore exactly at clock skew boundary", () => {
			const exactlyAtBoundary = new Date(
				FIXED_TIME + DEFAULT_CLOCK_SKEW_MS,
			).toISOString();
			expect(() =>
				validateSAMLTimestamp({ notBefore: exactlyAtBoundary }),
			).not.toThrow();
		});

		it("should reject assertion with NotBefore 1ms beyond clock skew boundary", () => {
			const justPastBoundary = new Date(
				FIXED_TIME + DEFAULT_CLOCK_SKEW_MS + 1,
			).toISOString();
			expect(() =>
				validateSAMLTimestamp({ notBefore: justPastBoundary }),
			).toThrow("SAML assertion is not yet valid");
		});
	});

	describe("Missing timestamps behavior", () => {
		it("should accept missing timestamps when requireTimestamps is false (default)", () => {
			expect(() =>
				validateSAMLTimestamp(undefined, { requireTimestamps: false }),
			).not.toThrow();
		});

		it("should accept empty conditions when requireTimestamps is false", () => {
			expect(() =>
				validateSAMLTimestamp({}, { requireTimestamps: false }),
			).not.toThrow();
		});

		it("should reject missing timestamps when requireTimestamps is true", () => {
			expect(() =>
				validateSAMLTimestamp(undefined, { requireTimestamps: true }),
			).toThrow("SAML assertion missing required timestamp conditions");
		});

		it("should reject empty conditions when requireTimestamps is true", () => {
			expect(() =>
				validateSAMLTimestamp({}, { requireTimestamps: true }),
			).toThrow("SAML assertion missing required timestamp conditions");
		});

		it("should accept assertions with only NotBefore (valid)", () => {
			const now = new Date().toISOString();
			expect(() => validateSAMLTimestamp({ notBefore: now })).not.toThrow();
		});

		it("should accept assertions with only NotOnOrAfter (valid, in future)", () => {
			const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
			expect(() =>
				validateSAMLTimestamp({ notOnOrAfter: future }),
			).not.toThrow();
		});
	});

	describe("Custom clock skew configuration", () => {
		it("should use custom clockSkew when provided", () => {
			const twoSecondsAgo = new Date(Date.now() - 2 * 1000).toISOString();

			expect(() =>
				validateSAMLTimestamp(
					{ notOnOrAfter: twoSecondsAgo },
					{ clockSkew: 1000 },
				),
			).toThrow("SAML assertion has expired");

			expect(() =>
				validateSAMLTimestamp(
					{ notOnOrAfter: twoSecondsAgo },
					{ clockSkew: 5 * 60 * 1000 },
				),
			).not.toThrow();
		});

		it("should use default 5 minute clock skew when not specified", () => {
			const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
			expect(() =>
				validateSAMLTimestamp({ notOnOrAfter: fourMinutesAgo }),
			).not.toThrow();

			const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
			expect(() =>
				validateSAMLTimestamp({ notOnOrAfter: sixMinutesAgo }),
			).toThrow("SAML assertion has expired");
		});
	});

	describe("Malformed timestamp handling", () => {
		it("should reject malformed NotBefore timestamp", () => {
			expect(() =>
				validateSAMLTimestamp({ notBefore: "not-a-valid-date" }),
			).toThrow("SAML assertion has invalid NotBefore timestamp");
		});

		it("should reject malformed NotOnOrAfter timestamp", () => {
			expect(() =>
				validateSAMLTimestamp({ notOnOrAfter: "invalid-timestamp" }),
			).toThrow("SAML assertion has invalid NotOnOrAfter timestamp");
		});

		it("should treat empty string timestamps as missing (falsy values)", () => {
			expect(() => validateSAMLTimestamp({ notBefore: "" })).not.toThrow();
			expect(() => validateSAMLTimestamp({ notOnOrAfter: "" })).not.toThrow();
		});

		it("should reject garbage data in timestamps", () => {
			expect(() =>
				validateSAMLTimestamp({
					notBefore: "abc123xyz",
					notOnOrAfter: "!@#$%^&*()",
				}),
			).toThrow("SAML assertion has invalid NotBefore timestamp");
		});

		it("should accept valid ISO 8601 timestamps", () => {
			const now = new Date();
			const future = new Date(Date.now() + 10 * 60 * 1000);
			expect(() =>
				validateSAMLTimestamp({
					notBefore: now.toISOString(),
					notOnOrAfter: future.toISOString(),
				}),
			).not.toThrow();
		});
	});
});

describe("SAML ACS Origin Check Bypass", () => {
	describe("Positive: SAML endpoints allow external IdP origins", () => {
		it("should allow SAML callback POST from external IdP origin", async () => {
			const { auth, signInWithTestUser } = await getTestInstance({
				plugins: [sso()],
			});
			const { headers } = await signInWithTestUser();

			// Register SAML provider with full config
			await auth.api.registerSSOProvider({
				body: {
					providerId: "origin-bypass-callback",
					issuer: "http://localhost:8081",
					domain: "origin-bypass.com",
					samlConfig: {
						entryPoint: sharedMockIdP.metadataUrl,
						cert: certificate,
						callbackUrl: "http://localhost:8081/api/auth/sso/saml2/callback",
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

			// POST to callback with external Origin header (simulating IdP POST)
			// Origin check should be bypassed for SAML callback endpoints
			const callbackRes = await auth.handler(
				new Request(
					"http://localhost:8081/api/auth/sso/saml2/callback/origin-bypass-callback",
					{
						method: "POST",
						headers: {
							"Content-Type": "application/x-www-form-urlencoded",
							Origin: "http://external-idp.example.com", // External IdP origin - would normally be blocked
							Cookie: headers.get("cookie") || "",
						},
						body: new URLSearchParams({
							SAMLResponse: Buffer.from("<fake-saml-response/>").toString(
								"base64",
							),
							RelayState: "",
						}).toString(),
					},
				),
			);

			// Should NOT return 403 Forbidden (origin check bypassed)
			// May return other errors (400, 500) due to invalid SAML response, but NOT origin rejection
			expect(callbackRes.status).not.toBe(403);
		});

		it("should allow ACS endpoint POST from external IdP origin", async () => {
			const { auth, signInWithTestUser } = await getTestInstance({
				plugins: [sso()],
			});
			const { headers } = await signInWithTestUser();

			// Register SAML provider with full config
			await auth.api.registerSSOProvider({
				body: {
					providerId: "origin-bypass-acs",
					issuer: "http://localhost:8081",
					domain: "origin-bypass-acs.com",
					samlConfig: {
						entryPoint: sharedMockIdP.metadataUrl,
						cert: certificate,
						callbackUrl: "http://localhost:8081/api/auth/sso/saml2/sp/acs",
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

			// POST to ACS with external Origin header
			const acsRes = await auth.handler(
				new Request(
					"http://localhost:8081/api/auth/sso/saml2/sp/acs/origin-bypass-acs",
					{
						method: "POST",
						headers: {
							"Content-Type": "application/x-www-form-urlencoded",
							Origin: "http://idp.external.com", // External IdP origin
							Cookie: headers.get("cookie") || "",
						},
						body: new URLSearchParams({
							SAMLResponse: Buffer.from("<fake-saml-response/>").toString(
								"base64",
							),
						}).toString(),
					},
				),
			);

			// Should NOT return 403 Forbidden
			expect(acsRes.status).not.toBe(403);
		});
	});

	describe("Negative: Non-SAML endpoints remain protected", () => {
		it("should block POST to sign-up with untrusted origin when origin check is enabled", async () => {
			const { auth } = await getTestInstance({
				plugins: [sso()],
				advanced: {
					disableCSRFCheck: false,
					disableOriginCheck: false,
				},
			});

			// Origin check applies when cookies are present and check is enabled
			const signUpRes = await auth.handler(
				new Request("http://localhost:8081/api/auth/sign-up/email", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Origin: "http://attacker.com",
						Cookie: "better-auth.session_token=fake-session",
					},
					body: JSON.stringify({
						email: "victim@example.com",
						password: "password123",
						name: "Victim",
					}),
				}),
			);

			expect(signUpRes.status).toBe(403);
		});
	});

	describe("Edge cases", () => {
		it("should allow GET requests to SAML metadata regardless of origin", async () => {
			const { auth } = await getTestInstance({
				plugins: [sso()],
			});

			// GET requests always bypass origin check
			const metadataRes = await auth.handler(
				new Request("http://localhost:8081/api/auth/sso/saml2/sp/metadata", {
					method: "GET",
					headers: {
						Origin: "http://any-origin.com",
					},
				}),
			);

			expect(metadataRes.status).not.toBe(403);
		});

		it("should not redirect to malicious RelayState URLs", async () => {
			const { auth, signInWithTestUser } = await getTestInstance({
				plugins: [sso()],
			});
			const { headers } = await signInWithTestUser();

			await auth.api.registerSSOProvider({
				body: {
					providerId: "relay-security-test",
					issuer: "http://localhost:8081",
					domain: "relay-security.com",
					samlConfig: {
						entryPoint: sharedMockIdP.metadataUrl,
						cert: certificate,
						callbackUrl: "http://localhost:8081/api/auth/sso/saml2/callback",
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

			// Even with origin bypass, malicious RelayState should be rejected
			const callbackRes = await auth.handler(
				new Request(
					"http://localhost:8081/api/auth/sso/saml2/callback/relay-security-test",
					{
						method: "POST",
						headers: {
							"Content-Type": "application/x-www-form-urlencoded",
							Origin: "http://idp.example.com",
						},
						body: new URLSearchParams({
							SAMLResponse: Buffer.from("<fake-saml-response/>").toString(
								"base64",
							),
							RelayState: "http://malicious-site.com/steal-token",
						}).toString(),
					},
				),
			);

			// Should NOT redirect to malicious URL
			if (callbackRes.status === 302) {
				const location = callbackRes.headers.get("Location");
				expect(location).not.toContain("malicious-site.com");
			}
		});
	});
});

describe("SAML Response Security", () => {
	it("should reject forged/unsigned SAML responses", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});
		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "security-test-provider",
				issuer: "http://localhost:8081",
				domain: "security-test.com",
				samlConfig: {
					entryPoint: sharedMockIdP.metadataUrl,
					cert: certificate,
					callbackUrl: "http://localhost:8081/api/auth/sso/saml2/callback",
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

		const forgedSAMLResponse = `
			<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
				<saml:Assertion>
					<saml:Subject>
						<saml2:NameID xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion">attacker@evil.com</saml2:NameID>
					</saml:Subject>
				</saml:Assertion>
			</samlp:Response>
		`;

		const callbackRes = await auth.handler(
			new Request(
				"http://localhost:8081/api/auth/sso/saml2/callback/security-test-provider",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						SAMLResponse: Buffer.from(forgedSAMLResponse).toString("base64"),
						RelayState: "",
					}).toString(),
				},
			),
		);

		expect(callbackRes.status).toBe(400);
		const body = await callbackRes.json();
		expect(body.message).toBe("Invalid SAML response");
	});

	it("should reject SAML response with tampered nameID", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});
		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "tamper-test-provider",
				issuer: "http://localhost:8081",
				domain: "tamper-test.com",
				samlConfig: {
					entryPoint: sharedMockIdP.metadataUrl,
					cert: certificate,
					callbackUrl: "http://localhost:8081/api/auth/sso/saml2/callback",
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

		const tamperedResponse = `<?xml version="1.0"?>
			<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
				<saml2:NameID xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion">admin@victim.com</saml2:NameID>
			</samlp:Response>`;

		const callbackRes = await auth.handler(
			new Request(
				"http://localhost:8081/api/auth/sso/saml2/callback/tamper-test-provider",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						SAMLResponse: Buffer.from(tamperedResponse).toString("base64"),
						RelayState: "",
					}).toString(),
				},
			),
		);

		expect(callbackRes.status).toBe(400);
	});
});

describe("SAML SSO - Size Limit Validation", () => {
	it("should export default size limit constants", async () => {
		const { DEFAULT_MAX_SAML_RESPONSE_SIZE, DEFAULT_MAX_SAML_METADATA_SIZE } =
			await import("./constants");

		expect(DEFAULT_MAX_SAML_RESPONSE_SIZE).toBe(256 * 1024);
		expect(DEFAULT_MAX_SAML_METADATA_SIZE).toBe(100 * 1024);
	});
});

describe("SAML SSO - Assertion Replay Protection", () => {
	it("should reject replayed SAML assertion (same assertion submitted twice)", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "replay-test-provider",
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

		let samlResponse: any;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = await context.data;
			},
		});

		const firstResponse = await auth.handler(
			new Request(
				"http://localhost:3000/api/auth/sso/saml2/callback/replay-test-provider",
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

		expect(firstResponse.status).toBe(302);
		const firstLocation = firstResponse.headers.get("location") || "";
		expect(firstLocation).not.toContain("error");

		const replayResponse = await auth.handler(
			new Request(
				"http://localhost:3000/api/auth/sso/saml2/callback/replay-test-provider",
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

		expect(replayResponse.status).toBe(302);
		const replayLocation = replayResponse.headers.get("location") || "";
		expect(replayLocation).toContain("error=replay_detected");
	});

	it("should reject replayed SAML assertion on ACS endpoint", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "acs-replay-test-provider",
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

		let samlResponse: any;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = await context.data;
			},
		});

		const firstResponse = await auth.handler(
			new Request(
				"http://localhost:3000/api/auth/sso/saml2/sp/acs/acs-replay-test-provider",
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

		expect(firstResponse.status).toBe(302);
		const firstLocation = firstResponse.headers.get("location") || "";
		expect(firstLocation).not.toContain("error");

		const replayResponse = await auth.handler(
			new Request(
				"http://localhost:3000/api/auth/sso/saml2/sp/acs/acs-replay-test-provider",
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

		expect(replayResponse.status).toBe(302);
		const replayLocation = replayResponse.headers.get("location") || "";
		expect(replayLocation).toContain("error=replay_detected");
	});

	it("should reject cross-endpoint replay (callback → ACS)", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "cross-endpoint-provider",
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

		let samlResponse: any;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = await context.data;
			},
		});

		const callbackResponse = await auth.handler(
			new Request(
				"http://localhost:3000/api/auth/sso/saml2/callback/cross-endpoint-provider",
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

		expect(callbackResponse.status).toBe(302);
		expect(callbackResponse.headers.get("location")).not.toContain("error");

		const acsReplayResponse = await auth.handler(
			new Request(
				"http://localhost:3000/api/auth/sso/saml2/sp/acs/cross-endpoint-provider",
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

		expect(acsReplayResponse.status).toBe(302);
		const acsLocation = acsReplayResponse.headers.get("location") || "";
		expect(acsLocation).toContain("error=replay_detected");
	});
});

describe("SAML SSO - Single Assertion Validation", () => {
	it("should reject SAML response with multiple assertions on callback endpoint", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "multi-assertion-callback-provider",
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

		const multiAssertionResponse = `
			<saml2p:Response xmlns:saml2p="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion">
				<saml2:Issuer>http://localhost:8081</saml2:Issuer>
				<saml2p:Status>
					<saml2p:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
				</saml2p:Status>
				<saml2:Assertion ID="assertion-1">
					<saml2:Issuer>http://localhost:8081</saml2:Issuer>
					<saml2:Subject>
						<saml2:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">legitimate@example.com</saml2:NameID>
					</saml2:Subject>
				</saml2:Assertion>
				<saml2:Assertion ID="assertion-2">
					<saml2:Issuer>http://localhost:8081</saml2:Issuer>
					<saml2:Subject>
						<saml2:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">attacker@evil.com</saml2:NameID>
					</saml2:Subject>
				</saml2:Assertion>
			</saml2p:Response>
		`;

		const encodedResponse = Buffer.from(multiAssertionResponse).toString(
			"base64",
		);

		await expect(
			auth.api.callbackSSOSAML({
				body: {
					SAMLResponse: encodedResponse,
					RelayState: "http://localhost:3000/dashboard",
				},
				params: {
					providerId: "multi-assertion-callback-provider",
				},
			}),
		).rejects.toMatchObject({
			body: {
				code: "SAML_MULTIPLE_ASSERTIONS",
			},
		});
	});

	it("should reject SAML response with multiple assertions on ACS endpoint", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "multi-assertion-acs-provider",
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

		const multiAssertionResponse = `
			<saml2p:Response xmlns:saml2p="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion">
				<saml2:Issuer>http://localhost:8081</saml2:Issuer>
				<saml2p:Status>
					<saml2p:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
				</saml2p:Status>
				<saml2:Assertion ID="assertion-1">
					<saml2:Issuer>http://localhost:8081</saml2:Issuer>
					<saml2:Subject>
						<saml2:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">legitimate@example.com</saml2:NameID>
					</saml2:Subject>
				</saml2:Assertion>
				<saml2:Assertion ID="assertion-2">
					<saml2:Issuer>http://localhost:8081</saml2:Issuer>
					<saml2:Subject>
						<saml2:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">attacker@evil.com</saml2:NameID>
					</saml2:Subject>
				</saml2:Assertion>
			</saml2p:Response>
		`;

		const encodedResponse = Buffer.from(multiAssertionResponse).toString(
			"base64",
		);

		const response = await auth.handler(
			new Request(
				"http://localhost:3000/api/auth/sso/saml2/sp/acs/multi-assertion-acs-provider",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						SAMLResponse: encodedResponse,
						RelayState: "http://localhost:3000/dashboard",
					}),
				},
			),
		);

		expect(response.status).toBe(302);
		const location = response.headers.get("location") || "";
		expect(location).toContain("error=multiple_assertions");
	});

	it("should reject SAML response with no assertions", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "no-assertion-provider",
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

		const noAssertionResponse = `
			<saml2p:Response xmlns:saml2p="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion">
				<saml2:Issuer>http://localhost:8081</saml2:Issuer>
				<saml2p:Status>
					<saml2p:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
				</saml2p:Status>
			</saml2p:Response>
		`;

		const encodedResponse = Buffer.from(noAssertionResponse).toString("base64");

		await expect(
			auth.api.callbackSSOSAML({
				body: {
					SAMLResponse: encodedResponse,
					RelayState: "http://localhost:3000/dashboard",
				},
				params: {
					providerId: "no-assertion-provider",
				},
			}),
		).rejects.toMatchObject({
			body: {
				code: "SAML_NO_ASSERTION",
			},
		});
	});

	it("should reject SAML response with XSW-style assertion injection in Extensions", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "xsw-injection-provider",
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

		const xswInjectionResponse = `
			<saml2p:Response xmlns:saml2p="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion">
				<saml2:Issuer>http://localhost:8081</saml2:Issuer>
				<saml2p:Status>
					<saml2p:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
				</saml2p:Status>
				<saml2p:Extensions>
					<saml2:Assertion ID="injected-assertion">
						<saml2:Issuer>http://localhost:8081</saml2:Issuer>
						<saml2:Subject>
							<saml2:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">attacker@evil.com</saml2:NameID>
						</saml2:Subject>
					</saml2:Assertion>
				</saml2p:Extensions>
				<saml2:Assertion ID="legitimate-assertion">
					<saml2:Issuer>http://localhost:8081</saml2:Issuer>
					<saml2:Subject>
						<saml2:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">user@example.com</saml2:NameID>
					</saml2:Subject>
				</saml2:Assertion>
			</saml2p:Response>
		`;

		const encodedResponse =
			Buffer.from(xswInjectionResponse).toString("base64");

		await expect(
			auth.api.callbackSSOSAML({
				body: {
					SAMLResponse: encodedResponse,
					RelayState: "http://localhost:3000/dashboard",
				},
				params: {
					providerId: "xsw-injection-provider",
				},
			}),
		).rejects.toMatchObject({
			body: {
				code: "SAML_MULTIPLE_ASSERTIONS",
			},
		});
	});

	it("should accept valid SAML response with exactly one assertion", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [sso()],
		});

		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId: "single-assertion-provider",
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

		let samlResponse: any;
		await betterFetch("http://localhost:8081/api/sso/saml2/idp/post", {
			onSuccess: async (context) => {
				samlResponse = await context.data;
			},
		});

		const response = await auth.handler(
			new Request(
				"http://localhost:3000/api/auth/sso/saml2/callback/single-assertion-provider",
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
		expect(response.headers.get("location")).not.toContain("error");
	});
});
