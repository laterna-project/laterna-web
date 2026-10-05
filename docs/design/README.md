# Design notes

These notes explain why the web client is built the way it is: the choices that shape the code,
what was tried and dropped, and the limits we know about. They describe the current state of the
client, not its history. When a change contradicts a note, update the note in the same change.

The server has its own notes, in the
[server repository](https://github.com/laterna-project/laterna/tree/main/docs/design); the code
refers to them as "server: docs/design/...".

| Note | What it covers |
|---|---|
| [Architecture](architecture.md) | The stack, the generated client, data loading, routes, the event stream, deployment |
| [Themes](themes.md) | Design tokens, built-in and imported styles, server themes, `data-ui` hooks |
| [Internationalization](i18n.md) | Interface languages, catalogs, texts and errors composed by the server |
| [Accessibility](accessibility.md) | WCAG 2.2 AA, the audit, focus, titles, panels, contrast |
| [Readers](readers.md) | foliate-js for EPUB, pdf.js for PDF, the page reader |
| [Sample media](sample-media.md) | The free sample libraries and the seed scripts used in development |
