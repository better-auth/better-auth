# Actors, Users & Agents

- A USER in the system represents an authenticated entity in Better Auth
- A USER = ACTOR (they are the same concept)
- Throughout the system, ACTORs are referenced using `actor_id` and `actor_type` fields on the USER record
- The `actor_type` field on USER indicates whether this user represents a person or an agent
- The `actor_id` field on USER references either the `person.id` or `agent.id` table to get detailed information
- This allows the system to treat users and agents uniformly for:
  - Audit logging
  - Usage tracking
  - Rate limiting
  - Quotas
  - Notifications
  - Permissions

## Users & Persons

- A USER is an authenticated entity in Better Auth (email/password, OAuth, etc.)
- A USER has `actor_type` field that can be 'person' or 'agent' (defaults to 'person')
- A USER has `actor_id` field that references either `person.id` or `agent.id`
- When `actor_type = 'person'`, the USER represents a real life person
- A USER has: id, name, email (unique), emailVerified (defaults to false), image, createdAt, updatedAt
- A USER has a `role` field (text, nullable) for platform-level roles
- A USER can be banned with `banned` (defaults to false), `banReason`, and `banExpires` fields
- A USER can have two-factor authentication enabled via `twoFactorEnabled` (defaults to false)
- The PERSON table stores minimal information: id and name
- A USER (with actor_type='person') can be part of multiple ORGANIZATIONs
- An ORGANIZATION can have multiple USERS
- A USER must be part of at least one ORGANIZATION
- A USER can have multiple roles in an ORGANIZATION (via the MEMBERS table)
- A USER can invite other USERS to an ORGANIZATION
- An authorized USER can remove other USERS from an ORGANIZATION
- An authorized USER can change the role of other USERS in the ORGANIZATION
- A USER can request to join an ORGANIZATION and an authorized USER can accept or reject the request
- A USER can leave an ORGANIZATION

## Agents

- When `actor_type = 'agent'`, the USER represents a programmatic entity (AI assistant, service account, bot, workflow, integration, etc.)
- The AGENT table stores additional information about the agent
- An AGENT has: id, name (required), type (defaults to 'custom'), status (defaults to 'active'), configuration (text/JSON), ownerId, ownerType (defaults to 'user'), organizationId (nullable), metadata, createdAt, updatedAt
- An AGENT can be owned by a USER (person) or an ORGANIZATION (via `ownerId` and `ownerType` fields)
- An AGENT can optionally belong to an ORGANIZATION (via `organizationId`, which can be null)
- An AGENT can be part of TEAMs (similar to users)
- An AGENT can have its own API keys for authentication
- An AGENT can have direct access to specific PRODUCTs
- An AGENT can generate usage that is tracked and billed to its owner
- An AGENT can perform actions that are logged in the audit trail
- An AGENT has a type field (text, defaults to 'custom')
- An AGENT has a status field (text, defaults to 'active')
- An AGENT has configuration stored as text (typically JSON)

## Organizations

- An ORGANIZATION has: id, name (required), slug (required, unique), logo, createdAt, metadata
- An ORGANIZATION has a slug (URL-friendly identifier, required and unique)
- An ORGANIZATION can have a logo
- An ORGANIZATION can have metadata (extra fields) associated with it

# Products & Prices (Stripe Terminology)

- A PRODUCT is a feature or capability in the platform (e.g., "Geocoding", "Routing", "POI Search", "Analytics", "Risk Analysis")
- PRODUCTs can have dependencies on other PRODUCTs
- PRODUCTs can have versions
- PRODUCTs can be grouped into categories
- A PRODUCT can be active or inactive
- A PRICE defines the cost and billing model for a PRODUCT
- A PRICE can have different billing schemes: per_unit, tiered, or metered
- A PRICE can have billing intervals: day, week, month, or year
- A PRICE can have trial periods
- Access to PRODUCTs determines what features a USER can use in the platform

# Subscriptions & Licenses

- Every ORGANIZATION has a SUBSCRIPTION
- A SUBSCRIPTION has a number of LICENSES of different ROLES
- A LICENSE can be used by a USER to get a ROLE in an ORGANIZATION
- A SUBSCRIPTION can involve billing and payment
- There are different classes of SUBSCRIPTIONs:
  - Free
  - Pro
  - Enterprise
  - Custom
- A SUBSCRIPTION has a status: active, canceled, past_due, unpaid, trialing, incomplete, incomplete_expired, or paused
- A SUBSCRIPTION has subscription items, which link PRODUCTs (via PRICEs) to the subscription
- A SUBSCRIPTION class includes certain PRODUCTs by default (via subscription items)
- Additional PRODUCTs can be purchased and added to a SUBSCRIPTION as subscription items
- A SUBSCRIPTION can have subscription items enabled or disabled
- A LICENSE can grant access to specific PRODUCTs (optional - products can also come from the SUBSCRIPTION)

# Credits

- Every ORGANIZATION has a number of CREDITS with their SUBSCRIPTION
- CREDITs are used to do actions in the platform, Applications decide how many CREDITs are used for each action
- CREDITs are deducted from the ORGANIZATION's SUBSCRIPTION, whenever used.
- USERs can have a number of CREDITS assigned to them, which can be used to do actions in the platform
- Some USERs can also have no limits
- TEAMs can have a number of CREDITS assigned to them
- Based on the terms of the SUBSCRIPTION, CREDITs can be renewed
- CREDITs can represent any anything, money, number of projects, number of analysis, it only matters how they are consumed by the services.

# Teams

- An ORGANIZATION can have multiple TEAMS
- A TEAM has: id, name (required), organizationId (required), createdAt, updatedAt
- A TEAM can have multiple USERS (via the TEAM_MEMBERS join table)
- A USER can be part of multiple TEAMS
- TEAM_MEMBERS table tracks: id, teamId, userId, createdAt
- A TEAM can have access to specific PRODUCTs (optional - for restricting team access to certain features)

# Objects, Relationships & Permissions

- An OBJECT is a data entity in the platform
- An OBJECT has: id, type (required), externalId, externalType, attributes (text/JSON), metadata
- An OBJECT can have multiple RELATIONSHIPs with other OBJECTs, including USERs, TEAMs, and ORGANIZATIONs (which are also OBJECTs)
- OBJECT_TYPES table defines object type schemas: id, name (required), description, externalType, metadata
- A RELATIONSHIP connects two OBJECTs: id, subjectId (source_object_id, required), subjectType (source_object_type, required), objectId (target_object_id, required), objectType (target_object_type, required), relationshipType (required), attributes (text/JSON), metadata
- RELATIONSHIP_TYPES table defines relationship schemas: id, name (required), description, isTransitive (defaults to false), inverseType, externalRelation, metadata
- A RELATIONSHIP can have attributes stored as text (typically JSON)

# Permissions

- Permissions are resolved based on the RELATIONSHIPs and attributes of the OBJECTs
- PERMISSIONS table stores permission definitions: id, name (required), description, category, authzedPermission, metadata
- GRANTS table stores permission grants: id, actorObjectId (required), targetObjectId (required), permissionId (required), relationshipId (nullable), relationshipPath, conditions (text/JSON), expiresAt, metadata
- A GRANT links an actor OBJECT to a target OBJECT with a specific PERMISSION
- A GRANT can optionally reference a RELATIONSHIP that grants the permission
- A GRANT can have conditions and an expiration date
- Permission is checked by asking has_permission(OBJECT, SUBJECT, ACTION)
- AUTH_SCHEMAS table stores authorization schema definitions: id, version (required), definition (required), metadata
- A USER's access to PRODUCTs is determined by:
  - Their ORGANIZATION's SUBSCRIPTION (which includes certain PRODUCTs via subscription items)
  - Additional PRODUCTs purchased for the ORGANIZATION (via subscription items)
  - Their LICENSE (if the LICENSE grants access to specific PRODUCTs)
  - Their ROLE in the ORGANIZATION (if roles have product access restrictions)
  - Their TEAM's access (if teams have restricted product access)
- A USER must have access to a PRODUCT to use features within that PRODUCT
- Product access can be checked by asking has_product_access(USER, PRODUCT) or has_product_access(ORGANIZATION, PRODUCT)

# Admin Operations

- An authorized USER (admin) can create other USERS
- An authorized USER (admin) can list USERS with filtering, pagination, and sorting
- An authorized USER (admin) can set or reset passwords for other USERS
- An authorized USER (admin) can ban a USER from the platform
- A banned USER cannot access the platform
- A ban can have a reason and an expiration date
- An authorized USER (admin) can unban a USER
- An authorized USER (admin) can impersonate another USER
- When impersonating, the admin's session is marked as impersonated
- An authorized USER (admin) can stop impersonating and return to their own session
- An authorized USER (admin) can view all sessions for a USER
- An authorized USER (admin) can revoke specific sessions for a USER
- An authorized USER (admin) can revoke all sessions for a USER

# Sessions

- A USER can have multiple active SESSIONs
- A SESSION represents an authenticated connection to the platform
- A SESSION has: id, expiresAt (required), token (required, unique), createdAt, updatedAt, ipAddress, userAgent, userId (required), impersonatedBy, activeOrganizationId, activeTeamId
- A SESSION has a token (unique), expiration date, and metadata (IP address, user agent, etc.)
- A SESSION can track the active ORGANIZATION and TEAM context for the user
- A SESSION can be impersonated by an admin (via `impersonatedBy` field)
- A SESSION can be revoked, which invalidates the token

# API Keys

- A USER can create API KEYS for programmatic access
- An API KEY has: id, name, start, prefix, key (required), userId (required), refillInterval, refillAmount, lastRefillAt, enabled (defaults to true), rateLimitEnabled (defaults to true), rateLimitTimeWindow (defaults to 86400000ms), rateLimitMax (defaults to 10), requestCount (defaults to 0), remaining, lastRequest, expiresAt, createdAt, updatedAt, permissions, metadata
- An API KEY has a name, prefix, start, and key value
- An API KEY can have an optional expiration date
- An API KEY can have permissions associated with it (stored as text)
- An API KEY can have metadata (extra fields) associated with it
- An API KEY can be enabled or disabled
- An API KEY tracks when it was last used (`lastRequest`)
- An API KEY has rate limiting with configurable time window and max requests
- An API KEY can have a refill mechanism (refillInterval, refillAmount, lastRefillAt) for quota management
- An API KEY tracks request count and remaining quota
- An API KEY can be verified to check its validity and permissions
- An API KEY can be revoked/deleted

# Billing & Payments (Stripe Terminology)

- An ORGANIZATION can have multiple PAYMENT METHODS
- A PAYMENT METHOD can be a card, bank account, or other payment type
- A SUBSCRIPTION can have a default PAYMENT METHOD
- INVOICEs are generated for SUBSCRIPTIONs based on billing cycles
- An INVOICE has a status: draft, open, paid, uncollectible, or void
- An INVOICE has line items that correspond to subscription items
- PAYMENTs are recorded when invoices are paid
- A PAYMENT has a status: pending, processing, succeeded, failed, canceled, refunded, or partially_refunded

# Auditing & Compliance

- All actions in the platform are logged in an AUDIT LOG
- An AUDIT LOG entry records: who (USER), what (ACTION), when (TIMESTAMP), where (IP_ADDRESS), and why (REASON)
- AUDIT LOGs are immutable and cannot be deleted
- AUDIT LOGs can be queried for compliance and security purposes
- Data access is logged for compliance (GDPR, SOC2, etc.)
- Changes to critical data (users, organizations, subscriptions) are tracked

# Rate Limiting & Quotas

- ORGANIZATIONs can have rate limits based on their SUBSCRIPTION
- API KEYS can have individual rate limits
- Rate limits can be per endpoint, per time window, or global
- Quotas can be set for resource usage (e.g., API calls per day, storage per month)
- Quota usage is tracked and can trigger alerts or throttling

# Webhooks & Events

- The platform can send WEBHOOKs to external systems for events
- WEBHOOKS table stores webhook configurations: id, url, events, secret, active (defaults to true), headers, createdAt, updatedAt
- WEBHOOK_DELIVERYS table tracks webhook delivery attempts: id, webhookId, event, payload, status, statusCode, response, attempts (defaults to 0), lastAttemptAt, nextRetryAt, createdAt
- Events include: subscription.created, subscription.updated, payment.succeeded, user.created, etc.
- WEBHOOKs can be configured per ORGANIZATION
- WEBHOOK delivery is retried on failure (tracked via attempts, lastAttemptAt, nextRetryAt)
- WEBHOOK signatures verify authenticity (via secret field)
- WEBHOOK delivery status and responses are tracked for debugging and compliance

# Feature Flags

- FEATURE FLAGs can enable/disable features for specific ORGANIZATIONs, USERS, or globally
- FEATURE FLAGs can be percentage-based (gradual rollouts)
- FEATURE FLAGs can be time-based (scheduled enable/disable)

# IP Whitelisting & Security

- ORGANIZATIONs can have IP whitelists for enhanced security
- API KEYS can be restricted to specific IP addresses
- Failed authentication attempts are tracked and can trigger security measures
- Suspicious activity can trigger alerts or automatic bans

# Usage Metering & Telemetry

- Usage is tracked for metered billing PRODUCTs
- Usage records are created for each action that consumes credits or resources
- Usage can be aggregated by time period (hourly, daily, monthly)
- Usage data is used for billing, analytics, and quota enforcement

# Members & Invitations

- MEMBERS table tracks USER membership in ORGANIZATIONs: id, organizationId (required), userId (required), role (defaults to 'member'), createdAt
- A USER's role in an ORGANIZATION is stored in the MEMBERS table (defaults to 'member')
- INVITATIONS table tracks invitations to join ORGANIZATIONs: id, organizationId (required), email (required), role, teamId, status (defaults to 'pending'), expiresAt (required), createdAt, inviterId (required)
- An INVITATION can optionally include a TEAM assignment
- An INVITATION has a status (defaults to 'pending') and expiration date
- An INVITATION tracks who sent it (inviterId)

# OAuth

- OAUTH_APPLICATIONS table stores OAuth client applications: id, name, icon, metadata, clientId (unique), clientSecret, redirectUrls, type, disabled (defaults to false), userId, createdAt, updatedAt
- An OAUTH_APPLICATION can be owned by a USER
- An OAUTH_APPLICATION can be disabled
- OAUTH_ACCESS_TOKENS table stores access tokens: id, accessToken (unique), refreshToken (unique), accessTokenExpiresAt, refreshTokenExpiresAt, clientId, userId, scopes, createdAt, updatedAt
- OAUTH_CONSENTS table tracks user consent: id, clientId, userId, scopes, createdAt, updatedAt, consentGiven

# Two-Factor Authentication

- TWO_FACTORS table stores 2FA secrets: id, secret (required), backupCodes (required), userId (required)
- A USER can enable two-factor authentication (tracked via `twoFactorEnabled` field on USER)
- Backup codes are stored for account recovery

# Accounts & Verifications

- ACCOUNTS table stores authentication provider accounts: id, accountId (required), providerId (required), userId (required), accessToken, refreshToken, idToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope, password, createdAt, updatedAt
- A USER can have multiple ACCOUNTS (for different OAuth providers or password)
- VERIFICATIONS table stores verification codes/tokens: id, identifier (required), value (required), expiresAt (required), createdAt, updatedAt
- Used for email verification, password reset, etc.

# Notifications

- USERS can receive notifications for important events
- Notifications can be sent via email, in-app, or webhook
- Notification preferences can be configured per USER or ORGANIZATION
- Notification templates can be customized
