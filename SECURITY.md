# Security

## Reporting a vulnerability

Please do not open a public issue. Use
[Report a vulnerability](https://github.com/laterna-project/laterna-web/security/advisories/new)
on GitHub: the report stays private until a fix is released. A problem in the server itself goes
to the [server repository](https://github.com/laterna-project/laterna/security/advisories/new).

Say which version you run, in which browser, how the problem can be reproduced and what an
attacker gains.

## Supported versions

Fixes go into the latest release.

## What to expect from the client

- The session token is kept in the browser's local storage and sent as a `Bearer` header; the
  server only stores a hash of it. Anyone with access to the browser profile can use the session.
- Imported theme files are CSS only, never JavaScript, and are refused if they load anything from
  elsewhere (`@import`, any address that is not `data:`), so a style sheet cannot send what the
  page shows to another server. See [docs/design/themes.md](docs/design/themes.md).
- After signing in, the client only returns to paths of the app (`?next=`), never to another
  address.
