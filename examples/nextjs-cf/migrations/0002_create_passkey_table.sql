-- Create passkey table
CREATE TABLE IF NOT EXISTS passkey (
    id TEXT PRIMARY KEY,
    name TEXT,
    publicKey TEXT NOT NULL,
    userId TEXT NOT NULL REFERENCES "user" (id),
    webauthnUserID TEXT NOT NULL,
    counter INTEGER NOT NULL,
    deviceType TEXT NOT NULL,
    backedUp BOOLEAN NOT NULL,
    transports TEXT,
    createdAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_passkey_userId ON passkey (userId);
