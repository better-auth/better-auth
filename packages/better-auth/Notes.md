

- Auth endpoint paths should always consist small letters without hyphens or underscores. eg. `/signin/oauth` instead of `/sign-in/oauth` or `/sign_in_oauth` etc. This is to make it easier to use the generated client. Unless you follow this convention, the client will not work correctly.

- Auth endpoints should only have 2 methods: `GET` and `POST`. If a request requires a body, it should be sent as a `POST` request. If it does not require a body, it should be sent as a `GET` request.