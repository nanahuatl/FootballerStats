# FootballerStats

FootballerStats is a MediaWiki gadget for editing footballers' infoboxes and club career statistics on Wikipedia. Separate scripts target Turkish Wikipedia and English Wikipedia, with source-editor and VisualEditor integration. Changes are reviewed and published by the editor through Wikipedia's normal editing workflow.

| Edition | Status | Script |
| --- | --- | --- |
| Turkish Wikipedia (trwiki) | Initial release: 1.0.0 | [src/FootballerStats.tr.js](src/FootballerStats.tr.js) |
| English Wikipedia (enwiki) | Initial release: 1.0.0 | [src/FootballerStats.en.js](src/FootballerStats.en.js) |

## Features

- Import supported infobox and career table data into a season-based form.
- Edit club names and links, loans, seasons, infobox years and competition statistics.
- Handle league, local league, national cup, league cup, continental and other competition columns.
- Resolve club redirects and edit competition notes.
- Preview source changes or apply them to the current VisualEditor document before publication.

## Test directly from GitHub

For personal testing on Turkish Wikipedia, load the current `main` branch from your `common.js` after the required ResourceLoader modules are ready:

```js
mw.loader.using( [
	'mediawiki.util',
	'mediawiki.api',
	'mediawiki.storage',
	'jquery.textSelection',
	'jquery.ui',
	'oojs-ui-core',
	'oojs-ui-windows',
	'oojs-ui.styles.icons-interactions'
] ).then( function () {
	mw.loader.load( 'https://raw.githubusercontent.com/nanahuatl/FootballerStats/main/src/FootballerStats.tr.js' );
	mw.loader.load(
		'https://raw.githubusercontent.com/nanahuatl/FootballerStats/main/src/FootballerStats.css',
		'text/css'
	);
} );
```

This is intended for development/testing. A production gadget should be installed on-wiki through MediaWiki's gadget system rather than loading mutable code directly from GitHub.

## Installation

The Turkish implementation is [src/FootballerStats.tr.js](src/FootballerStats.tr.js) with [src/FootballerStats.css](src/FootballerStats.css). The English implementation is [src/FootballerStats.en.js](src/FootballerStats.en.js) with [src/FootballerStats.en.css](src/FootballerStats.en.css).

The sample gadget definition in [gadget.txt](gadget.txt) lists the required ResourceLoader dependencies. Uploading a release to GitHub does not update copies installed on Wikipedia.

## Development

Use Node.js 22 or newer and npm. From the repository root:

```sh
npm ci
npm run check
```

`npm run check` performs JavaScript syntax checks, ESLint checks and Stylelint checks. See [package.json](package.json) for the available development commands.

These static checks do not replace testing the interface, generated wikitext and VisualEditor conversion on Wikipedia.

## Repository layout

- `src/FootballerStats.tr.js`: Turkish Wikipedia implementation.
- `src/FootballerStats.en.js`: English Wikipedia implementation.
- `src/FootballerStats.css`: Turkish Wikipedia interface stylesheet.
- `src/FootballerStats.en.css`: English Wikipedia interface stylesheet.
- `gadget.txt`: sample ResourceLoader gadget definition.
- `package.json` and `package-lock.json`: Node.js development tooling and dependencies.
- `.editorconfig`, `.eslintrc.json` and `.stylelintrc.json`: editor and lint configuration.
- `SECURITY.md`: security reporting instructions.
- `LICENSE`: project license.

Source files live in the `src/` directory.

## Feedback and license

Report issues at [GitHub Issues](https://github.com/nanahuatl/FootballerStats/issues), including the wiki, article, editor, browser, reproduction steps and expected result.

For security-sensitive reports, follow [SECURITY.md](SECURITY.md).

Licensed under [Creative Commons Attribution-ShareAlike 3.0 Unported](LICENSE).
