create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);

create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete restrict);

create table "identity" ("id" text not null primary key, "issuer" text not null, "providerAccountId" text not null, "userId" text not null references "user" ("id") on delete restrict, "createdAt" date not null, "updatedAt" date not null);

create table "account" ("id" text not null primary key, "identityId" text not null references "identity" ("id") on delete restrict, "providerId" text not null, "providerInstanceId" text not null, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);

create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);

create index "session_userId_idx" on "session" ("userId");

create index "identity_userId_idx" on "identity" ("userId");

create index "verification_identifier_idx" on "verification" ("identifier");

create unique index "identity_issuer_providerAccountId_uidx" on "identity" ("issuer", "providerAccountId");

create unique index "account_identityId_providerInstanceId_uidx" on "account" ("identityId", "providerInstanceId");