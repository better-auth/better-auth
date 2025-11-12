import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { setCookieToHeader } from "better-auth/cookies";
import { bearer, organization } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { scim } from ".";

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

describe("SCIM", () => {
	const testUser = {
		email: "test@email.com",
		password: "password",
		name: "Test User",
	};

	const createTestInstance = () => {
		const data = {
			user: [],
			session: [],
			verification: [],
			account: [],
			ssoProvider: [],
			scimProvider: [],
			organization: [],
			member: [],
		};
		const memory = memoryAdapter(data);

		const auth = betterAuth({
			database: memory,
			baseURL: "http://localhost:3000",
			emailAndPassword: {
				enabled: true,
			},
			plugins: [sso({ enableSCIMProvisioning: true }), scim(), organization()],
		});

		const authClient = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [bearer()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return auth.handler(new Request(url, init));
				},
			},
		});

		return { auth, authClient };
	};

	async function getAuthCookieHeaders(authClient: any) {
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

	async function registerOrganization(auth: any, authClient: any, org: string) {
		const headers = await getAuthCookieHeaders(authClient);

		return await auth.api.createOrganization({
			body: {
				slug: `the-${org}`,
				name: `the organization ${org}`,
			},
			headers,
		});
	}

	async function registerSSOProvider(
		auth: any,
		authClient: any,
		providerId: string = "saml-provider-1",
		organizationId?: string,
	) {
		const headers = await getAuthCookieHeaders(authClient);

		const provider = await auth.api.registerSSOProvider({
			body: {
				organizationId,
				providerId: providerId,
				issuer: "http://localhost:8081",
				domain: "http://localhost:8081",
				samlConfig: {
					entryPoint: "http://your-idp.com/api/sso/metadata",
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

		return provider;
	}

	describe("GET /scim/v2/ServiceProviderConfig", () => {
		it("should fetch the service provider config", async () => {
			const { auth } = createTestInstance();
			const serviceProviderInfo = await auth.api.getSCIMServiceProviderConfig();

			expect(serviceProviderInfo).toMatchInlineSnapshot(`
				{
				  "authenticationSchemes": [
				    {
				      "description": "Authentication scheme using the Authorization header with a bearer token tied to an organization.",
				      "name": "OAuth Bearer Token",
				      "primary": true,
				      "specUri": "http://www.rfc-editor.org/info/rfc6750",
				      "type": "oauthbearertoken",
				    },
				  ],
				  "bulk": {
				    "supported": false,
				  },
				  "changePassword": {
				    "supported": false,
				  },
				  "etag": {
				    "supported": false,
				  },
				  "filter": {
				    "supported": true,
				  },
				  "meta": {
				    "resourceType": "ServiceProviderConfig",
				  },
				  "patch": {
				    "supported": true,
				  },
				  "schemas": [
				    "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig",
				  ],
				  "sort": {
				    "supported": false,
				  },
				}
			`);
		});
	});

	describe("GET /scim/v2/Schemas", () => {
		it("should fetch the list of supported schemas", async () => {
			const { auth } = createTestInstance();
			const schemas = await auth.api.getSCIMSchemas();

			expect(schemas).toMatchInlineSnapshot(`
				{
				  "Resources": [
				    {
				      "attributes": [
				        {
				          "caseExact": true,
				          "description": "Unique opaque identifier for the User",
				          "multiValued": false,
				          "mutability": "readOnly",
				          "name": "id",
				          "required": false,
				          "returned": "default",
				          "type": "string",
				          "uniqueness": "server",
				        },
				        {
				          "caseExact": true,
				          "description": "Unique identifier for the User, typically used by the user to directly authenticate to the service provider",
				          "multiValued": false,
				          "mutability": "readWrite",
				          "name": "userName",
				          "required": true,
				          "returned": "default",
				          "type": "string",
				          "uniqueness": "server",
				        },
				        {
				          "caseExact": true,
				          "description": "The name of the User, suitable for display to end-users.  The name SHOULD be the full name of the User being described, if known.",
				          "multiValued": false,
				          "mutability": "readOnly",
				          "name": "displayName",
				          "required": false,
				          "returned": "default",
				          "type": "string",
				          "uniqueness": "none",
				        },
				        {
				          "description": "A Boolean value indicating the User's administrative status.",
				          "multiValued": false,
				          "mutability": "readOnly",
				          "name": "active",
				          "required": false,
				          "returned": "default",
				          "type": "boolean",
				        },
				        {
				          "description": "The components of the user's real name.",
				          "multiValued": false,
				          "name": "name",
				          "required": false,
				          "subAttributes": [
				            {
				              "caseExact": false,
				              "description": "The full name, including all middlenames, titles, and suffixes as appropriate, formatted for display(e.g., 'Ms. Barbara J Jensen, III').",
				              "multiValued": false,
				              "mutability": "readWrite",
				              "name": "formatted",
				              "required": false,
				              "returned": "default",
				              "type": "string",
				              "uniqueness": "none",
				            },
				            {
				              "caseExact": false,
				              "description": "The family name of the User, or last name in most Western languages (e.g., 'Jensen' given the fullname 'Ms. Barbara J Jensen, III').",
				              "multiValued": false,
				              "mutability": "readWrite",
				              "name": "familyName",
				              "required": false,
				              "returned": "default",
				              "type": "string",
				              "uniqueness": "none",
				            },
				            {
				              "caseExact": false,
				              "description": "The given name of the User, or first name in most Western languages (e.g., 'Barbara' given the full name 'Ms. Barbara J Jensen, III').",
				              "multiValued": false,
				              "mutability": "readWrite",
				              "name": "givenName",
				              "required": false,
				              "returned": "default",
				              "type": "string",
				              "uniqueness": "none",
				            },
				          ],
				          "type": "complex",
				        },
				        {
				          "description": "Email addresses for the user.  The value SHOULD be canonicalized by the service provider, e.g., 'bjensen@example.com' instead of 'bjensen@EXAMPLE.COM'. Canonical type values of 'work', 'home', and 'other'.",
				          "multiValued": true,
				          "mutability": "readWrite",
				          "name": "emails",
				          "required": false,
				          "returned": "default",
				          "subAttributes": [
				            {
				              "caseExact": false,
				              "description": "Email addresses for the user.  The value SHOULD be canonicalized by the service provider, e.g., 'bjensen@example.com' instead of 'bjensen@EXAMPLE.COM'. Canonical type values of 'work', 'home', and 'other'.",
				              "multiValued": false,
				              "mutability": "readWrite",
				              "name": "value",
				              "required": false,
				              "returned": "default",
				              "type": "string",
				              "uniqueness": "server",
				            },
				            {
				              "description": "A Boolean value indicating the 'primary' or preferred attribute value for this attribute, e.g., the preferred mailing address or primary email address.  The primary attribute value 'true' MUST appear no more than once.",
				              "multiValued": false,
				              "mutability": "readWrite",
				              "name": "primary",
				              "required": false,
				              "returned": "default",
				              "type": "boolean",
				            },
				          ],
				          "type": "complex",
				          "uniqueness": "none",
				        },
				      ],
				      "description": "User Account",
				      "id": "urn:ietf:params:scim:schemas:core:2.0:User",
				      "meta": {
				        "location": "http://localhost:3000/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:User",
				        "resourceType": "Schema",
				      },
				      "name": "User",
				      "schemas": [
				        "urn:ietf:params:scim:schemas:core:2.0:Schema",
				      ],
				    },
				  ],
				  "itemsPerPage": 1,
				  "schemas": [
				    "urn:ietf:params:scim:api:messages:2.0:ListResponse",
				  ],
				  "startIndex": 1,
				  "totalResults": 1,
				}
			`);
		});

		it("should fetch a single resource schema", async () => {
			const { auth } = createTestInstance();
			const schemas = await auth.api.getSCIMSchema({
				params: {
					schemaId: "urn:ietf:params:scim:schemas:core:2.0:User",
				},
			});

			expect(schemas).toMatchInlineSnapshot(`
				{
				  "attributes": [
				    {
				      "caseExact": true,
				      "description": "Unique opaque identifier for the User",
				      "multiValued": false,
				      "mutability": "readOnly",
				      "name": "id",
				      "required": false,
				      "returned": "default",
				      "type": "string",
				      "uniqueness": "server",
				    },
				    {
				      "caseExact": true,
				      "description": "Unique identifier for the User, typically used by the user to directly authenticate to the service provider",
				      "multiValued": false,
				      "mutability": "readWrite",
				      "name": "userName",
				      "required": true,
				      "returned": "default",
				      "type": "string",
				      "uniqueness": "server",
				    },
				    {
				      "caseExact": true,
				      "description": "The name of the User, suitable for display to end-users.  The name SHOULD be the full name of the User being described, if known.",
				      "multiValued": false,
				      "mutability": "readOnly",
				      "name": "displayName",
				      "required": false,
				      "returned": "default",
				      "type": "string",
				      "uniqueness": "none",
				    },
				    {
				      "description": "A Boolean value indicating the User's administrative status.",
				      "multiValued": false,
				      "mutability": "readOnly",
				      "name": "active",
				      "required": false,
				      "returned": "default",
				      "type": "boolean",
				    },
				    {
				      "description": "The components of the user's real name.",
				      "multiValued": false,
				      "name": "name",
				      "required": false,
				      "subAttributes": [
				        {
				          "caseExact": false,
				          "description": "The full name, including all middlenames, titles, and suffixes as appropriate, formatted for display(e.g., 'Ms. Barbara J Jensen, III').",
				          "multiValued": false,
				          "mutability": "readWrite",
				          "name": "formatted",
				          "required": false,
				          "returned": "default",
				          "type": "string",
				          "uniqueness": "none",
				        },
				        {
				          "caseExact": false,
				          "description": "The family name of the User, or last name in most Western languages (e.g., 'Jensen' given the fullname 'Ms. Barbara J Jensen, III').",
				          "multiValued": false,
				          "mutability": "readWrite",
				          "name": "familyName",
				          "required": false,
				          "returned": "default",
				          "type": "string",
				          "uniqueness": "none",
				        },
				        {
				          "caseExact": false,
				          "description": "The given name of the User, or first name in most Western languages (e.g., 'Barbara' given the full name 'Ms. Barbara J Jensen, III').",
				          "multiValued": false,
				          "mutability": "readWrite",
				          "name": "givenName",
				          "required": false,
				          "returned": "default",
				          "type": "string",
				          "uniqueness": "none",
				        },
				      ],
				      "type": "complex",
				    },
				    {
				      "description": "Email addresses for the user.  The value SHOULD be canonicalized by the service provider, e.g., 'bjensen@example.com' instead of 'bjensen@EXAMPLE.COM'. Canonical type values of 'work', 'home', and 'other'.",
				      "multiValued": true,
				      "mutability": "readWrite",
				      "name": "emails",
				      "required": false,
				      "returned": "default",
				      "subAttributes": [
				        {
				          "caseExact": false,
				          "description": "Email addresses for the user.  The value SHOULD be canonicalized by the service provider, e.g., 'bjensen@example.com' instead of 'bjensen@EXAMPLE.COM'. Canonical type values of 'work', 'home', and 'other'.",
				          "multiValued": false,
				          "mutability": "readWrite",
				          "name": "value",
				          "required": false,
				          "returned": "default",
				          "type": "string",
				          "uniqueness": "server",
				        },
				        {
				          "description": "A Boolean value indicating the 'primary' or preferred attribute value for this attribute, e.g., the preferred mailing address or primary email address.  The primary attribute value 'true' MUST appear no more than once.",
				          "multiValued": false,
				          "mutability": "readWrite",
				          "name": "primary",
				          "required": false,
				          "returned": "default",
				          "type": "boolean",
				        },
				      ],
				      "type": "complex",
				      "uniqueness": "none",
				    },
				  ],
				  "description": "User Account",
				  "id": "urn:ietf:params:scim:schemas:core:2.0:User",
				  "meta": {
				    "location": "http://localhost:3000/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:User",
				    "resourceType": "Schema",
				  },
				  "name": "User",
				  "schemas": [
				    "urn:ietf:params:scim:schemas:core:2.0:Schema",
				  ],
				}
			`);
		});

		it("should return not found for unsupported schemas", async () => {
			const { auth } = createTestInstance();

			const getSchema = () =>
				auth.api.getSCIMSchema({
					params: {
						schemaId: "unknown",
					},
				});

			await expect(getSchema()).rejects.toThrowError(
				expect.objectContaining({
					message: "Schema not found",
					body: {
						detail: "Schema not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: 404,
					},
				}),
			);
		});
	});

	describe("GET /scim/v2/ResourceTypes", () => {
		it("should fetch the list of supported resource types", async () => {
			const { auth } = createTestInstance();
			const resourceTypes = await auth.api.getSCIMResourceTypes();

			expect(resourceTypes).toMatchInlineSnapshot(`
				{
				  "Resources": [
				    {
				      "description": "User Account",
				      "endpoint": "/Users",
				      "id": "User",
				      "meta": {
				        "location": "http://localhost:3000/scim/v2/ResourceTypes/User",
				        "resourceType": "ResourceType",
				      },
				      "name": "User",
				      "schema": "urn:ietf:params:scim:schemas:core:2.0:User",
				      "schemas": [
				        "urn:ietf:params:scim:schemas:core:2.0:ResourceType",
				      ],
				    },
				  ],
				  "itemsPerPage": 1,
				  "schemas": [
				    "urn:ietf:params:scim:api:messages:2.0:ListResponse",
				  ],
				  "startIndex": 1,
				  "totalResults": 1,
				}
			`);
		});

		it("should fetch a single resource type", async () => {
			const { auth } = createTestInstance();
			const resourceType = await auth.api.getSCIMResourceType({
				params: {
					resourceTypeId: "User",
				},
			});

			expect(resourceType).toMatchInlineSnapshot(`
				{
				  "description": "User Account",
				  "endpoint": "/Users",
				  "id": "User",
				  "meta": {
				    "location": "http://localhost:3000/scim/v2/ResourceTypes/User",
				    "resourceType": "ResourceType",
				  },
				  "name": "User",
				  "schema": "urn:ietf:params:scim:schemas:core:2.0:User",
				  "schemas": [
				    "urn:ietf:params:scim:schemas:core:2.0:ResourceType",
				  ],
				}
			`);
		});

		it("should return not found for unsupported resource types", async () => {
			const { auth } = createTestInstance();
			const getResourceType = () =>
				auth.api.getSCIMResourceType({
					params: {
						resourceTypeId: "unknown",
					},
				});

			await expect(getResourceType()).rejects.toThrowError(
				expect.objectContaining({
					message: "Resource type not found",
					body: {
						detail: "Resource type not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: 404,
					},
				}),
			);
		});
	});

	describe("POST /scim/v2/Users", () => {
		it.fails("should create a new user", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const response = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
				asResponse: true,
			});

			expect(response.status).toBe(201);
			expect(response.headers.get("location")).toBe(
				expect.stringContaining("/scim/v2/Users/"),
			);

			const user = await response.json();
			expect(user).toMatchObject({
				active: true,
				displayName: "the-username",
				emails: [
					{
						primary: true,
						value: "the-username",
					},
				],
				externalId: "the-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(Date),
					lastModified: expect.any(Date),
					location: expect.stringContaining("/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "the-username",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "the-username",
			});
		});

		it("should create a new user with external id", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const user = await auth.api.createSCIMUser({
				body: {
					externalId: "external-username",
					userName: "the-username",
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(user).toMatchObject({
				active: true,
				displayName: "the-username",
				emails: [
					{
						primary: true,
						value: "the-username",
					},
				],
				externalId: "external-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(Date),
					lastModified: expect.any(Date),
					location: expect.stringContaining("/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "the-username",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "the-username",
			});
		});

		it("should create a new user with name parts", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
					name: {
						givenName: "Juan",
						familyName: "Perez",
					},
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(user).toMatchObject({
				active: true,
				displayName: "Juan Perez",
				emails: [
					{
						primary: true,
						value: "the-username",
					},
				],
				externalId: "the-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(Date),
					lastModified: expect.any(Date),
					location: expect.stringContaining("/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "Juan Perez",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "the-username",
			});
		});

		it("should create a new user with formatted name", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
					name: {
						formatted: "Juan Perez",
					},
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(user).toMatchObject({
				active: true,
				displayName: "Juan Perez",
				emails: [
					{
						primary: true,
						value: "the-username",
					},
				],
				externalId: "the-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(Date),
					lastModified: expect.any(Date),
					location: expect.stringContaining("/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "Juan Perez",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "the-username",
			});
		});

		it("should create a new user with a primary email", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
					name: {
						formatted: "Juan Perez",
					},
					emails: [
						{ value: "secondary-email@test.com" },
						{ value: "primary-email@test.com", primary: true },
					],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(user).toMatchObject({
				active: true,
				displayName: "Juan Perez",
				emails: [
					{
						primary: true,
						value: "primary-email@test.com",
					},
				],
				externalId: "the-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(Date),
					lastModified: expect.any(Date),
					location: expect.stringContaining("/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "Juan Perez",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "primary-email@test.com",
			});
		});

		it("should create a new user with the first non-primary email", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
					name: {
						formatted: "Juan Perez",
					},
					emails: [
						{ value: "secondary-email@test.com" },
						{ value: "primary-email@test.com" },
					],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(user).toMatchObject({
				active: true,
				displayName: "Juan Perez",
				emails: [
					{
						primary: true,
						value: "secondary-email@test.com",
					},
				],
				externalId: "the-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(Date),
					lastModified: expect.any(Date),
					location: expect.stringContaining("/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "Juan Perez",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "secondary-email@test.com",
			});
		});

		it("should not allow users with the same computed username", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const createUser = async () => {
				await auth.api.createSCIMUser({
					body: {
						userName: "the-username",
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			await createUser();
			await expect(createUser()).rejects.toThrow(/User already exists/);
		});

		it("should not allow anonymous access", async () => {
			const { auth } = createTestInstance();

			const createUser = async () => {
				await auth.api.createSCIMUser({
					body: {
						userName: "the-username",
					},
				});
			};

			await expect(createUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "SCIM token is required",
					body: {
						detail: "SCIM token is required",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: 401,
					},
				}),
			);
		});
	});

	describe("PUT /scim/v2/Users", () => {
		it("should update an existing resource", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
					name: {
						formatted: "Juan Perez",
					},
					emails: [{ value: "primary-email@test.com", primary: true }],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(user).toBeTruthy();
			expect(user.externalId).toBe("the-username");
			expect(user.userName).toBe("primary-email@test.com");
			expect(user.name.formatted).toBe("Juan Perez");
			expect(user.emails[0]?.value).toBe("primary-email@test.com");

			const updatedUser = await auth.api.updateSCIMUser({
				params: {
					userId: user.id,
				},
				body: {
					userName: "other-username",
					externalId: "external-username",
					name: {
						formatted: "Daniel Lopez",
					},
					emails: [{ value: "other-email@test.com" }],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(updatedUser).toMatchObject({
				active: true,
				displayName: "Daniel Lopez",
				emails: [
					{
						primary: true,
						value: "other-email@test.com",
					},
				],
				externalId: "external-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(Date),
					lastModified: expect.any(Date),
					location: expect.stringContaining("/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "Daniel Lopez",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "other-email@test.com",
			});
		});

		it("should not allow anonymous access", async () => {
			const { auth } = createTestInstance();

			const updateUser = async () => {
				await auth.api.updateSCIMUser({
					params: {
						userId: "whatever",
					},
					body: {
						userName: "the-username",
					},
				});
			};

			await expect(updateUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "SCIM token is required",
					body: {
						detail: "SCIM token is required",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: 401,
					},
				}),
			);
		});

		it("should return not found for missing resources", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const updateUser = () =>
				auth.api.updateSCIMUser({
					params: {
						userId: "missing",
					},
					body: {
						userName: "other-username",
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});

			await expect(updateUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "User not found",
					body: {
						detail: "User not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: 404,
					},
				}),
			);
		});
	});

	describe("PATCH /scim/v2/users", () => {
		it("should partially update a user resource", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
					name: {
						formatted: "Juan Perez",
					},
					emails: [{ value: "primary-email@test.com", primary: true }],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(user).toBeTruthy();
			expect(user.externalId).toBe("the-username");
			expect(user.userName).toBe("primary-email@test.com");
			expect(user.name.formatted).toBe("Juan Perez");
			expect(user.emails[0]?.value).toBe("primary-email@test.com");

			const patchResult = await auth.api.patchSCIMUser({
				params: {
					userId: user.id,
				},
				body: {
					schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
					Operations: [
						{ op: "replace", path: "/externalId", value: "external-username" },
						{ op: "replace", path: "/userName", value: "other-username" },
						{ op: "replace", path: "/name/formatted", value: "Daniel Lopez" },
					],
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(patchResult).toBe(null);

			const updatedUser = await auth.api.getSCIMUser({
				params: {
					userId: user.id,
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(updatedUser).toMatchObject({
				active: true,
				displayName: "Daniel Lopez",
				emails: [
					{
						primary: true,
						value: "other-username",
					},
				],
				externalId: "external-username",
				id: expect.any(String),
				meta: expect.objectContaining({
					created: expect.any(Date),
					lastModified: expect.any(Date),
					location: expect.stringContaining("/scim/v2/Users/"),
					resourceType: "User",
				}),
				name: {
					formatted: "Daniel Lopez",
				},
				schemas: expect.arrayContaining([
					"urn:ietf:params:scim:schemas:core:2.0:User",
				]),
				userName: "other-username",
			});
		});

		it("should return not found for missing users", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const patchUser = () =>
				auth.api.patchSCIMUser({
					params: {
						userId: "missing",
					},
					body: {
						schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
						Operations: [
							{
								op: "replace",
								path: "/externalId",
								value: "external-username",
							},
						],
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});

			await expect(patchUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "User not found",
					body: {
						detail: "User not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: 404,
					},
				}),
			);
		});

		it("should fail on invalid updates", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const user = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			const patchUser = () =>
				auth.api.patchSCIMUser({
					params: {
						userId: user.id,
					},
					body: {
						schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
						Operations: [],
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});

			await expect(patchUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "No valid fields to update",
					body: {
						detail: "No valid fields to update",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: 400,
					},
				}),
			);
		});

		it("should not allow anonymous access", async () => {
			const { auth } = createTestInstance();

			const patchUser = async () => {
				await auth.api.patchSCIMUser({
					params: {
						userId: "missing",
					},
					body: {
						schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
						Operations: [
							{
								op: "replace",
								path: "/externalId",
								value: "external-username",
							},
						],
					},
				});
			};

			await expect(patchUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "SCIM token is required",
					body: {
						detail: "SCIM token is required",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: 401,
					},
				}),
			);
		});
	});

	describe("GET /scim/v2/Users", () => {
		it("should return the list of users", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const createUser = (userName: string) => {
				return auth.api.createSCIMUser({
					body: {
						userName,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const [userA, userB] = await Promise.all([
				createUser("user-a"),
				createUser("user-b"),
			]);

			const users = await auth.api.listSCIMUsers({
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(users).toMatchObject({
				itemsPerPage: 2,
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				startIndex: 1,
				totalResults: 2,
				Resources: [userA, userB],
			});
		});

		it("should only allow access to users that belong to the same provider", async () => {
			const { auth, authClient } = createTestInstance();
			const [
				{ scimToken: scimTokenProviderA },
				{ scimToken: scimTokenProviderB },
			] = await Promise.all([
				registerSSOProvider(auth, authClient, "provider-a"),
				registerSSOProvider(auth, authClient, "provider-b"),
			]);

			const createUser = (userName: string, scimToken: string) => {
				return auth.api.createSCIMUser({
					body: {
						userName,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const listUsers = (scimToken: string) => {
				return auth.api.listSCIMUsers({
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const [userA, userB, userC] = await Promise.all([
				createUser("user-a", scimTokenProviderB),
				createUser("user-b", scimTokenProviderA),
				createUser("user-c", scimTokenProviderB),
			]);

			const [usersProviderA, usersProviderB] = await Promise.all([
				listUsers(scimTokenProviderA),
				listUsers(scimTokenProviderB),
			]);

			expect(usersProviderA).toMatchObject({
				itemsPerPage: 1,
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				startIndex: 1,
				totalResults: 1,
				Resources: [userB],
			});

			expect(usersProviderB).toMatchObject({
				itemsPerPage: 2,
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				startIndex: 1,
				totalResults: 2,
				Resources: [userA, userC],
			});
		});

		it("should only allow access to users that belong to the same provider and organization", async () => {
			const { auth, authClient } = createTestInstance();
			const [organizationA, organizationB] = await Promise.all([
				registerOrganization(auth, authClient, "org-a"),
				registerOrganization(auth, authClient, "org-b"),
			]);

			const [
				{ scimToken: scimTokenProviderA },
				{ scimToken: scimTokenProviderB },
			] = await Promise.all([
				registerSSOProvider(auth, authClient, "provider-a", organizationA.id),
				registerSSOProvider(auth, authClient, "provider-b", organizationB.id),
			]);

			const createUser = (userName: string, scimToken: string) => {
				return auth.api.createSCIMUser({
					body: {
						userName,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const listUsers = (scimToken: string) => {
				return auth.api.listSCIMUsers({
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const [userA, userB, userC] = await Promise.all([
				createUser("user-a", scimTokenProviderB),
				createUser("user-b", scimTokenProviderA),
				createUser("user-c", scimTokenProviderB),
			]);

			const [usersProviderA, usersProviderB] = await Promise.all([
				listUsers(scimTokenProviderA),
				listUsers(scimTokenProviderB),
			]);

			expect(usersProviderA).toMatchObject({
				itemsPerPage: 1,
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				startIndex: 1,
				totalResults: 1,
				Resources: [userB],
			});

			expect(usersProviderB).toMatchObject({
				itemsPerPage: 2,
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				startIndex: 1,
				totalResults: 2,
				Resources: [userA, userC],
			});
		});

		it("should filter the list of users", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const createUser = (userName: string) => {
				return auth.api.createSCIMUser({
					body: {
						userName,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const [userA] = await Promise.all([
				createUser("user-a"),
				createUser("user-b"),
				createUser("user-c"),
			]);

			const users = await auth.api.listSCIMUsers({
				query: {
					filter: 'userName eq "user-a"',
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(users).toMatchObject({
				itemsPerPage: 1,
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				startIndex: 1,
				totalResults: 1,
				Resources: [userA],
			});
		});

		it("should not allow anonymous access", async () => {
			const { auth } = createTestInstance();

			const getUsers = async () => {
				await auth.api.listSCIMUsers();
			};

			await expect(getUsers()).rejects.toThrowError(
				expect.objectContaining({
					message: "SCIM token is required",
					body: {
						detail: "SCIM token is required",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: 401,
					},
				}),
			);
		});
	});

	describe("GET /scim/v2/Users/:userId", () => {
		it("should return a single user resource", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const newUser = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			const retrievedUser = await auth.api.getSCIMUser({
				params: {
					userId: newUser.id,
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(newUser).toEqual(retrievedUser);
		});

		it("should only allow access to users that belong to the same provider", async () => {
			const { auth, authClient } = createTestInstance();
			const [
				{ scimToken: scimTokenProviderA },
				{ scimToken: scimTokenProviderB },
			] = await Promise.all([
				registerSSOProvider(auth, authClient, "provider-a"),
				registerSSOProvider(auth, authClient, "provider-b"),
			]);

			const createUser = (userName: string, scimToken: string) => {
				return auth.api.createSCIMUser({
					body: {
						userName,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const getUser = (userId: string, scimToken: string) => {
				return auth.api.getSCIMUser({
					params: {
						userId,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const [userA, userB] = await Promise.all([
				createUser("user-a", scimTokenProviderB),
				createUser("user-b", scimTokenProviderA),
			]);

			const retrievedUserB = await getUser(userB.id, scimTokenProviderA);
			expect(retrievedUserB).toEqual(userB);

			await expect(getUser(userB.id, scimTokenProviderB)).rejects.toThrowError(
				expect.objectContaining({
					message: "User not found",
					body: {
						detail: "User not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: 404,
					},
				}),
			);

			const retrievedUserA = await getUser(userA.id, scimTokenProviderB);
			expect(retrievedUserA).toEqual(userA);

			await expect(getUser(userA.id, scimTokenProviderA)).rejects.toThrowError(
				expect.objectContaining({
					message: "User not found",
					body: {
						detail: "User not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: 404,
					},
				}),
			);
		});

		it("should only allow access to users that belong to the same provider and organization", async () => {
			const { auth, authClient } = createTestInstance();
			const [organizationA, organizationB] = await Promise.all([
				registerOrganization(auth, authClient, "org-a"),
				registerOrganization(auth, authClient, "org-b"),
			]);

			const [
				{ scimToken: scimTokenProviderA },
				{ scimToken: scimTokenProviderB },
			] = await Promise.all([
				registerSSOProvider(auth, authClient, "provider-a", organizationA.id),
				registerSSOProvider(auth, authClient, "provider-b", organizationB.id),
			]);

			const createUser = (userName: string, scimToken: string) => {
				return auth.api.createSCIMUser({
					body: {
						userName,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const getUser = (userId: string, scimToken: string) => {
				return auth.api.getSCIMUser({
					params: {
						userId,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});
			};

			const [userA, userB] = await Promise.all([
				createUser("user-a", scimTokenProviderB),
				createUser("user-b", scimTokenProviderA),
			]);

			const retrievedUserB = await getUser(userB.id, scimTokenProviderA);
			expect(retrievedUserB).toEqual(userB);

			await expect(getUser(userB.id, scimTokenProviderB)).rejects.toThrowError(
				expect.objectContaining({
					message: "User not found",
					body: {
						detail: "User not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: 404,
					},
				}),
			);

			const retrievedUserA = await getUser(userA.id, scimTokenProviderB);
			expect(retrievedUserA).toEqual(userA);

			await expect(getUser(userA.id, scimTokenProviderA)).rejects.toThrowError(
				expect.objectContaining({
					message: "User not found",
					body: {
						detail: "User not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: 404,
					},
				}),
			);
		});

		it("should return not found for missing users", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const getUser = () =>
				auth.api.getSCIMUser({
					params: {
						userId: "missing",
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});

			await expect(getUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "User not found",
					body: {
						detail: "User not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: 404,
					},
				}),
			);
		});

		it("should not allow anonymous access", async () => {
			const { auth } = createTestInstance();

			const getUser = async () => {
				await auth.api.getSCIMUser();
			};

			await expect(getUser()).rejects.toThrow(/SCIM token is required/);
		});
	});

	describe("DELETE /scim/v2/Users/:userId", () => {
		it("should delete an existing user", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const newUser = await auth.api.createSCIMUser({
				body: {
					userName: "the-username",
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			const result = await auth.api.deleteSCIMUser({
				params: {
					userId: newUser.id,
				},
				headers: {
					authorization: `Bearer ${scimToken}`,
				},
			});

			expect(result).toBe(null);

			const getUser = () =>
				auth.api.getSCIMUser({
					params: {
						userId: newUser.id,
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});

			await expect(getUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "User not found",
					body: {
						detail: "User not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: 404,
					},
				}),
			);
		});

		it("should not allow anonymous access", async () => {
			const { auth } = createTestInstance();

			const deleteUser = async () => {
				await auth.api.deleteSCIMUser({
					params: {
						userId: "whatever",
					},
				});
			};

			await expect(deleteUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "SCIM token is required",
					body: {
						detail: "SCIM token is required",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: 401,
					},
				}),
			);
		});

		it("should not delete a missing user", async () => {
			const { auth, authClient } = createTestInstance();
			const { scimToken } = await registerSSOProvider(auth, authClient);

			const deleteUser = () =>
				auth.api.deleteSCIMUser({
					params: {
						userId: "missing",
					},
					headers: {
						authorization: `Bearer ${scimToken}`,
					},
				});

			await expect(deleteUser()).rejects.toThrowError(
				expect.objectContaining({
					message: "User not found",
					body: {
						detail: "User not found",
						schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
						status: 404,
					},
				}),
			);
		});
	});
});
