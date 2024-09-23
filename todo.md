## TODO
[x] handle migration when the config removes existing schema
[x] refresh oauth tokens
[x] remember me functionality
[x] add all oauth providers
[x] providers should only be oauth
[x] add tests
[x] implement the ac check on the client to for organization
[x] add delete organization endpoint
[ ] add callback url on otp and backup code verification
[ ] fix bun problem
[x] fix the issue with the client triggers not working fot 2 consecutive calls
[ ] add a way to specify on the client to use the base path as the whole path
[x] implement magic links


## Docs
[x] specify everywhere `auth` should be exported
[-] add a note about better-sqlite3 requiring to be added to webpack externals or find alternative that doesn't require it
[x] add a section about updating user and changing password
[ ] mention how users can get user and session types
[ ] add a doc about account linking
[ ] remove the section about using useSession in next with initialValue
[ ] rate limiting docs