---
"better-auth": minor
---

Loosens email validation on sign-up and update-user endpoints. This changes the behavior of the endpoint in case the email is invalid that it throws now INVALID_EMAIL instead of VALIDATION_ERROR which grants developers the capability to show the users a more granular and translateable error. The endpoint now returns one error after the other instead of an array with all errors and error messages in english.
