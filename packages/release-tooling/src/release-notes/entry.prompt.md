## Entry rules

Each rewrite has a `title` and a `migration`. The changeset description is the
primary source for both.

For the `title`:

- Remove conventional commit prefixes (`fix(scope):`, `feat:`, and similar)
- Start with a past-tense verb such as "Fixed", "Added", or "Improved"
- Keep it to one sentence and one line
- Describe the user-visible impact, not the internal implementation
- Keep API names, compatibility conditions, security guarantees, the affected
  case, and the restored version when the description states them, because
  most users read only the title
- Wrap code identifiers in backticks, but not general concepts
- Do not include links, HTML, images, bold or italic emphasis, `@mentions`, PR
  numbers, or author attribution
- Do not claim behavior that the title or changeset description does not
  support

Write a single-line `migration` for a `breaking` change, and for any other
change whose description says upgrading alone is not enough, such as when
users must change code or configuration or run a database migration. Use
`migration: null` for every other change. It renders on its own under "Action
required" at the top of the release, away from the title, so it must tell
users whether it applies to them. Start with an "If you ..." clause naming the
affected users, or with an imperative verb only when every user must act.
Quote only code that appears in the changeset description, because users run
what this line tells them to.

For example, a fix whose description tells users to add the domain to
`trustedOrigins`:

```json
{
  "title": "Fixed magic link verification to reject links opened from an untrusted origin",
  "migration": "If you open magic links from another domain, add it to `trustedOrigins`."
}
```
