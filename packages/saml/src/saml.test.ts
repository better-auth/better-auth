import {
  afterAll,
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { parseSetCookieHeader, setCookieToHeader } from "better-auth/cookies";
import { bearer } from "better-auth/plugins";
import { IdentityProvider, ServiceProvider } from "samlify";
import { ssoSAML } from ".";
import { ssoSAMLClient } from "./client";
import { OAuth2Server } from "oauth2-mock-server";

let idp: ReturnType<typeof IdentityProvider>;
let server = new OAuth2Server();
// Inline metadata XML for the IdP
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
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="http://localhost:3000/api/sso/saml2/idp/metadata">
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
    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="http://localhost:3000/api/sso/saml2/idp/slo"/>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="http://localhost:3000/api/sso/saml2/idp/redirect"/>
  </md:IDPSSODescriptor>
  <md:Organization>
    <md:OrganizationName xml:lang="en-US">Your Organization Name</md:OrganizationName>
    <md:OrganizationDisplayName xml:lang="en-US">Your Organization DisplayName</md:OrganizationDisplayName>
    <md:OrganizationURL xml:lang="en-US">http://localhost:3000</md:OrganizationURL>
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
const privateKey = `
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
-----END RSA PRIVATE KEY-----
`;

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
        // Custom provisioning logic
      }),
  };

  const auth = betterAuth({
    database: memory,
    baseURL: "http://localhost:3000",
    emailAndPassword: {
      enabled: true,
    },
    plugins: [ssoSAML(ssoOptions)],
  });

  const ctx = await auth.$context;

  const authClient = createAuthClient({
    baseURL: "http://localhost:3000",
    plugins: [bearer(), ssoSAMLClient()],
    fetchOptions: {
      customFetchImpl: async (url, init) => {
        return auth.handler(new Request(url, init));
      },
    },
  });

  // Test user
  const testUser = {
    email: "test@email.com",
    password: "password",
    name: "Test User",
  };

  beforeAll(async () => {
    await server.issuer.keys.generate("RS256");
    server.issuer.on;
    await server.start(8080, "localhost");
    
    
    const res = await authClient.signUp.email({
      email: testUser.email,
      password: testUser.password,
      name: testUser.name,
    });
    idp = IdentityProvider({
      metadata: idpMetadata,
      privateKey: privateKey,
      isAssertionEncrypted: true,
      encPrivateKey: privateKey,
      encPrivateKeyPass: "g7hGcRmp8PxT5QeP2q9Ehf1bWe9zTALN",
      privateKeyPass: "q9ALNhGT5EhfcRmp8Pg7e9zTQeP2x1bW",
    });
  });

  afterAll(async () => {
		await server.stop().catch(() => {});
  });
  server.service.on("beforeTokenSigning", (token, req) => {
    token.payload.email = "sso-user@localhost:8000.com";
		token.payload.email_verified = true;
		token.payload.name = "Test User";
		token.payload.picture = "https://test.com/picture.png";
	});

  beforeEach(() => {
    // Reset test data and mocks
    data.user = [];
    data.session = [];
    data.verification = [];
    data.account = [];
    data.ssoProvider = [];

    vi.clearAllMocks();
  });

  async function getHeader() {
    const headers = new Headers();
    const userRes = await authClient.signIn.email(testUser, {
      throw: true,
      onSuccess: setCookieToHeader(headers),
    });
    return {
      headers,
      response: userRes,
    };
  }
  it("should register a new SAML provider", async () => {
    const userRes = await authClient.signUp.email(testUser, {
      throw: true,
    });

    const headers = new Headers();
    await authClient.signIn.email(testUser, {
      throw: true,
      onSuccess: setCookieToHeader(headers),
    });

    const provider = await auth.api.createSAMLProvider({
      body: {
        providerId: "saml-provider-1",
        entryPoint: "https://idp.example.com/sso",
        issuer: "http://localhost:3000",
        cert: certificate,
        callbackUrl: "https://your-app.com/sso/callback",
        wantAssertionsSigned: true,
        signatureAlgorithm: "sha256",
        digestAlgorithm: "sha256",
        idpMetadata: idpMetadata,
        spMetadata: spMetadata,
        identifierFormat:
          "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      },
      headers,
    });
    expect(provider).toMatchObject({
      id: expect.any(String),
      issuer: "http://localhost:3000",
      samlConfig: {
        entryPoint: "https://idp.example.com/sso",
        issuer: "http://localhost:3000",
        cert: expect.any(String),
        callbackUrl: "https://your-app.com/sso/callback",
        wantAssertionsSigned: true,
        signatureAlgorithm: "sha256",
        digestAlgorithm: "sha256",
        identifierFormat:
          "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      },
      userId: expect.any(String),
    });
  });
  it("should sign in with SAML provider", async () => {
    const userRes = await authClient.signUp.email(testUser, {
      throw: true,
    });

    const headers = new Headers();
    await authClient.signIn.email(testUser, {
      throw: true,
      onSuccess: setCookieToHeader(headers),
    });

    await auth.api.createSAMLProvider({
      body: {
        providerId: "saml-provider-1",
        entryPoint: "https://idp.example.com/sso",
        issuer: "https://your-app.com",
        cert: certificate,
        callbackUrl: "https://your-app.com/sso/callback",
        wantAssertionsSigned: true,
        signatureAlgorithm: "sha256",
        digestAlgorithm: "sha256",
        idpMetadata: idpMetadata,
        spMetadata: spMetadata,
        identifierFormat:
          "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      },
      headers,
    });

    // Step 1: Initiate SAML login
    const signInResponse = await auth.api.signInSSOSAML({
      body: {
        providerId: "saml-provider-1",
        callbackURL: "https://localhost:3000/dashboard",
      },
    });
    expect(signInResponse.url).toContain("http://localhost:3000");
    expect(signInResponse.redirect).toBe(true);

    // simulate the callback url
    const sp = ServiceProvider({
      metadata: spMetadata,
    });
    const parsedLogin = await sp.parseLoginResponse(idp, "redirect");
    console.log({ parsedLogin });

  });
});
