# FootballerStats

[English documentation](docs/en.md)

FootballerStats is a MediaWiki gadget for editing footballers' infoboxes and club career statistics on Wikipedia. Separate scripts target Turkish Wikipedia and English Wikipedia, with source-editor and VisualEditor integration. Changes are reviewed and published by the editor through Wikipedia's normal editing workflow.

| Edition | Status | Script |
| --- | --- | --- |
| Turkish Wikipedia (trwiki) | Initial release: 1.0.0 | [FootballerStats.tr.js](FootballerStats.tr.js) |
| English Wikipedia (enwiki) | Initial release: 1.0.0 | [FootballerStats.en.js](FootballerStats.en.js) |

## Features

- Import supported infobox and career table data into a season-based form.
- Edit club names and links, loans, seasons, infobox years and competition statistics.
- Handle league, local league, national cup, league cup, continental and other competition columns.
- Resolve club redirects and edit competition notes.
- Preview source changes or apply them to the current VisualEditor document before publication.

## Installation

Use the [Turkish installation instructions](docs/tr.md#kurulum) or [English installation instructions](docs/en.md#installation). The gadget definition loads both JavaScript and the [CSS stylesheet](FootballerStats.css). Uploading a release to GitHub does not update copies installed on Wikipedia.

## Development

Use Node.js 22 or newer and npm. From the repository root:

```sh
npm ci
npm run check
```

| Command | Purpose |
| --- | --- |
| `npm test` | Run all current regression tests |
| `npm run test:guides` | Run help-dialog tests |
| `npm run test:visual-editor` | Run VisualEditor tests |
| `npm run lint` | Check JavaScript with ESLint and CSS with Stylelint |
| `npm run lint:js` | Check JavaScript only |
| `npm run lint:css` | Check CSS only |
| `npm run check` | Check syntax, lint and run all tests |

Tests use local fixtures and simulated MediaWiki/browser APIs. They do not replace testing the interface, generated wikitext and VisualEditor conversion on Wikipedia.

## Repository layout

- `FootballerStats.tr.js`: Turkish Wikipedia implementation.
- `FootballerStats.en.js`: English Wikipedia infobox and career table implementation.
- `FootballerStats.css`: Turkish Wikipedia interface stylesheet.`n- `FootballerStats.en.css`: English Wikipedia interface stylesheet.
- `docs/tr.md`: Turkish installation and usage.
- `docs/en.md`: English installation, usage and validation scope.
- `tests/`: regression tests and local fixtures.
- `CONTRIBUTING.md`: development, testing and release procedure.
- `.editorconfig`: shared editor settings, preserving fixture whitespace.
- `.stylelintrc.json`: CSS lint settings based on Wikimedia conventions.
- `SECURITY.md`: security reporting instructions.
- `gadget.txt` and `docs/gadget.md`: optional trwiki gadget installation reference.

Source files currently live at the repository root. 

## Feedback and license

Report issues at [GitHub Issues](https://github.com/nanahuatl/Wikipedia-FootballerStats-tool/issues), including the wiki, article, editor, browser, reproduction steps and expected result.

For security-sensitive reports, follow [SECURITY.md](SECURITY.md).

Licensed under [Creative Commons Attribution-ShareAlike 3.0 Unported](LICENSE).
