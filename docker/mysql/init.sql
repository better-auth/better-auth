-- Create databases
CREATE DATABASE IF NOT EXISTS drizzle_better_auth;
CREATE DATABASE IF NOT EXISTS better_auth;

-- Ensure user exists (adjust host as needed)
CREATE USER IF NOT EXISTS 'user'@'%' IDENTIFIED BY 'password';

-- Grant privileges (match the same host as above)
GRANT ALL PRIVILEGES ON drizzle_better_auth.* TO 'user'@'%';
GRANT ALL PRIVILEGES ON better_auth.* TO 'user'@'%';
FLUSH PRIVILEGES;