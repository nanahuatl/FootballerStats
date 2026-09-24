// FootballerStats | CC BY-SA 3.0
// Version: 1.0.0
// English Wikipedia edition for Infobox football biography and career statistics.

// <nowiki>
( function () {
	'use strict';

	const TOOL_NAME = 'FootballerStats';
	const EDIT_LINK_ID = 'ca-footballerstats-editor';
	const VIEW_LINK_ID = 'ca-footballerstats-editor-view';
	const PREVIEW_SCROLL_KEY_PREFIX = 'footballerstats-preview-scroll';
	const STORAGE_KEY_PREFIX = 'enwiki-football-stats-helper-data';
	const OTHER_NOTE_KEY_PREFIX = 'enwiki-football-stats-helper-other-note';
	const OTHER_COLUMN_KEY_PREFIX = 'enwiki-football-stats-helper-other-column';
	const COLUMN_STATE_KEY_PREFIX = 'enwiki-football-stats-helper-column-state';
	const FIELD_KEYS = [
		'team',
		'teamLink',
		'disableTeamLink',
		'isLoan',
		'infoboxOnly',
		'season',
		'seasonLink',
		'disableSeasonLink',
		'leagueName',
		'leagueApps',
		'leagueGoals',
		'localLeagueName',
		'localLeagueApps',
		'localLeagueGoals',
		'cupApps',
		'cupGoals',
		'leagueCupApps',
		'leagueCupGoals',
		'continentalApps',
		'continentalGoals',
		'otherApps',
		'otherGoals'
	];
	const STAT_PAIRS = [
		[ 'leagueApps', 'leagueGoals' ],
		[ 'localLeagueApps', 'localLeagueGoals' ],
		[ 'cupApps', 'cupGoals' ],
		[ 'leagueCupApps', 'leagueCupGoals' ],
		[ 'continentalApps', 'continentalGoals' ],
		[ 'otherApps', 'otherGoals' ]
	];
	const UPDATE_MONTHS = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];

	let textarea;
	let launchButton;
	let buttonRow;
	let launchTab;
	let quickAccessLink;
	let quickAccessTab;
	let backdrop;
	let tbody;
	let leagueCupEnabled = false;
	let localLeagueEnabled = false;
	let infoboxYearEnabled = true;
	let nationalCupEnabled = true;
	let continentalEnabled = true;
	let otherEnabled = true;
	let otherNote = '';
	let activeNoteEditor = null;
	const COMPETITION_NOTE_LABELS = {
		cupApps: 'National cup',
		leagueCupApps: 'League cup',
		continentalApps: 'Continental',
		otherApps: 'Other'
	};
	let updateDate = '';
	let updateDateInput;
	let updateDateTodayInput;
	let updateDateDraft = null;
	let updateDateAutomatic = true;
	let updateDateUseToday = false;
	let updateDateCareerActive = false;
	let updateDateLoadId = 0;
	let nationalTeamCareerEnabled = false;
	let managerCareerEnabled = false;
	let codeMirrorInstance = null;
	let pageInfoboxCheckPromise = null;
	let pageInfoboxCheckResult = null;
	let articleSourcePromise = null;
	let articleSourceResult = null;
	let visualEditorSession = null;
	let visualEditorOpening = false;
	let visualEditorApplying = false;
	let visualEditorButton;
	const boundVisualTargets = new WeakSet();

	function getVisualEditorSurface() {
		const target = window.ve && window.ve.init && window.ve.init.target;
		const surface = target && target.active && target.getSurface();
		return surface && surface.getMode() === 'visual' ? surface : null;
	}

	function assertVisualEditorSession( session ) {
		if ( !session || getVisualEditorSurface() !== session.surface ||
			session.doc.getCompleteHistoryLength() !== session.revision ) {
			throw new Error( 'The editing session has changed. Reopen FootballerStats.' );
		}
	}

	async function readVisualEditorSession() {
		const surface = getVisualEditorSurface();
		if ( !surface ) {
			throw new Error( 'VisualEditor is not ready yet.' );
		}
		const target = window.ve.init.target;
		const doc = surface.getModel().getDocument();
		const session = { surface, target, doc, revision: doc.getCompleteHistoryLength() };
		session.source = await target.getWikitextFragment( doc );
		assertVisualEditorSession( session );
		if ( !cleanValue( session.source ) ) {
			throw new Error( 'The current document could not be read.' );
		}
		return session;
	}

	async function openVisualEditorTool() {
		if ( visualEditorOpening || visualEditorApplying ) {
			return;
		}
		visualEditorOpening = true;
		try {
			const session = await readVisualEditorSession();
			if ( !hasSupportedFootballerInfobox( session.source ) ) {
				throw new Error( 'No supported footballer infobox was found in the current document.' );
			}
			ensureUi();
			visualEditorSession = session;
			await loadSavedRows( session.source );
			assertVisualEditorSession( session );
			backdrop.querySelector( '.tfsh-apply' ).textContent = 'Apply';
			refreshUpdateDate();
			backdrop.classList.add( 'is-open' );
			window.requestAnimationFrame( updateOptionalCompetitionColumns );
		} catch ( error ) {
			mw.notify( error.message || 'Could not retrieve data from VisualEditor.', { type: 'error' } );
		} finally {
			visualEditorOpening = false;
		}
	}

	function initVisualEditorShortcut() {
		if ( !getVisualEditorSurface() ) {
			if ( visualEditorButton ) {
				visualEditorButton.remove();
				visualEditorButton = null;
			}
			return;
		}
		if ( !visualEditorButton ) {
			visualEditorButton = document.createElement( 'button' );
			visualEditorButton.type = 'button';
			visualEditorButton.className = 'tfsh-launch tfsh-visual-launch';
			visualEditorButton.textContent = TOOL_NAME;
			visualEditorButton.addEventListener( 'click', openVisualEditorTool );
			document.body.appendChild( visualEditorButton );
		}
	}

	function bindVisualEditorTarget( target ) {
		if ( boundVisualTargets.has( target ) ) {
			return;
		}
		boundVisualTargets.add( target );
		target.on( 'surfaceReady', initVisualEditorShortcut );
		target.on( 'teardown', () => {
			if ( visualEditorButton ) {
				visualEditorButton.remove();
				visualEditorButton = null;
			}
			if ( visualEditorSession && backdrop ) {
				backdrop.classList.remove( 'is-open' );
			}
			visualEditorSession = null;
		} );
		initVisualEditorShortcut();
	}
	function hasSupportedFootballerInfobox( source ) {
		return /\{\{\s*Infobox[ _]+football[ _]+biography\b/i.test( source || '' );
	}

	function isSupportedSkin() {
		// Allow the tool to run in current and future MediaWiki skins.
		return Boolean( document.documentElement );
	}

	function getActionPortletId() {
		return [ 'p-cactions', 'p-views', 'p-tb', 'p-personal' ].find(
			( id ) => document.getElementById( id )
		) || null;
	}

	function getCurrentPageTitle() {
		if ( window.mw && window.mw.config && window.mw.config.get( 'wgPageName' ) ) {
			return window.mw.config.get( 'wgPageName' );
		}

		const search = new URLSearchParams( window.location.search );
		if ( search.get( 'title' ) ) {
			return search.get( 'title' );
		}

		const wikiPrefix = '/wiki/';
		if ( window.location.pathname.startsWith( wikiPrefix ) ) {
			return decodeURIComponent( window.location.pathname.slice( wikiPrefix.length ) );
		}

		return '';
	}

	function buildToolEditUrl() {
		const url = new URL( window.location.origin + '/w/index.php' );
		url.searchParams.set( 'title', getCurrentPageTitle() );
		url.searchParams.set( 'action', 'edit' );
		url.searchParams.set( 'tfsh', '1' );
		return url.toString();
	}

	function getPageStorageSuffix() {
		return cleanValue( getCurrentPageTitle() ) || '__unknown__';
	}

	function getRowsStorageKey() {
		return `${ STORAGE_KEY_PREFIX }:${ getPageStorageSuffix() }`;
	}

	function getOtherNoteStorageKey() {
		return `${ OTHER_NOTE_KEY_PREFIX }:${ getPageStorageSuffix() }`;
	}

	function infoboxOnlySelectionKey( row ) {
		return JSON.stringify( [ rowTeamIdentityKey( row ), cleanValue( row.season ) ] );
	}

	function readInfoboxOnlySelections() {
		try {
			const saved = JSON.parse( mw.storage.get( `${ getRowsStorageKey() }:infobox-only` ) || '{}' );
			return saved && typeof saved === 'object' && !Array.isArray( saved ) ? saved : {};
		} catch ( error ) {
			return {};
		}
	}

	function saveInfoboxOnlySelection( row, checked ) {
		const saved = readInfoboxOnlySelections();
		saved[ infoboxOnlySelectionKey( row ) ] = checked;
		mw.storage.set( `${ getRowsStorageKey() }:infobox-only`, JSON.stringify( saved ) );
	}

	function getOtherColumnStorageKey() {
		return `${ OTHER_COLUMN_KEY_PREFIX }:${ getPageStorageSuffix() }`;
	}

	function getSavedOtherColumnState() {
		const saved = mw.storage.get( getOtherColumnStorageKey() );
		return saved === '0' ? false : saved === '1' ? true : null;
	}

	function getColumnStateStorageKey() {
		return `${ COLUMN_STATE_KEY_PREFIX }:${ getPageStorageSuffix() }`;
	}

	function getSavedColumnStates() {
		try {
			const saved = JSON.parse( mw.storage.get( getColumnStateStorageKey() ) || '{}' );
			return saved && typeof saved === 'object' ? saved : {};
		} catch ( error ) {
			return {};
		}
	}

	function saveColumnStates() {
		mw.storage.set( getColumnStateStorageKey(), JSON.stringify( {
			infoboxYear: infoboxYearEnabled,
			nationalCup: nationalCupEnabled,
			localLeague: localLeagueEnabled,
			leagueCup: leagueCupEnabled,
			continental: continentalEnabled,
			other: otherEnabled
		} ) );
	}

	function applySavedColumnStates() {
		const saved = getSavedColumnStates();
		Object.keys( saved ).forEach( ( key ) => {
			if ( typeof saved[ key ] !== 'boolean' || !( key + 'Enabled' in {
				infoboxYearEnabled, nationalCupEnabled, localLeagueEnabled,
				leagueCupEnabled, continentalEnabled, otherEnabled
			} ) ) {
				return;
			}
			if ( key === 'infoboxYear' ) {
				infoboxYearEnabled = saved[ key ];
			}
			if ( key === 'nationalCup' ) {
				nationalCupEnabled = saved[ key ];
			}
			if ( key === 'localLeague' ) {
				localLeagueEnabled = saved[ key ];
			}
			if ( key === 'leagueCup' ) {
				leagueCupEnabled = saved[ key ];
			}
			if ( key === 'continental' ) {
				continentalEnabled = saved[ key ];
			}
			if ( key === 'other' ) {
				otherEnabled = saved[ key ];
			}
		} );
		if ( typeof saved.other !== 'boolean' ) {
			const legacyOther = getSavedOtherColumnState();
			if ( legacyOther !== null ) {
				otherEnabled = legacyOther;
			}
		}
	}

	function getPreviewScrollKey() {
		return `${ PREVIEW_SCROLL_KEY_PREFIX }:${ getPageStorageSuffix() }`;
	}

	async function getArticleSource() {
		if ( articleSourceResult !== null ) {
			return articleSourceResult;
		}

		if ( articleSourcePromise ) {
			return articleSourcePromise;
		}

		const title = getCurrentPageTitle();
		if ( !title ) {
			articleSourceResult = '';
			return articleSourceResult;
		}

		const apiUrl = new URL( window.location.origin + '/w/api.php' );
		apiUrl.searchParams.set( 'action', 'query' );
		apiUrl.searchParams.set( 'prop', 'revisions' );
		apiUrl.searchParams.set( 'titles', title );
		apiUrl.searchParams.set( 'rvprop', 'content' );
		apiUrl.searchParams.set( 'rvslots', 'main' );
		apiUrl.searchParams.set( 'format', 'json' );
		apiUrl.searchParams.set( 'formatversion', '2' );

		articleSourcePromise = fetch( apiUrl.toString(), {
			credentials: 'same-origin'
		} )
			.then( ( response ) => {
				if ( !response.ok ) {
					throw new Error( `HTTP ${ response.status }` );
				}
				return response.json();
			} )
			.then( ( data ) => {
				const pages = data && data.query && data.query.pages;
				const revisions = pages && pages[ 0 ] && pages[ 0 ].revisions;
				const slots = revisions && revisions[ 0 ] && revisions[ 0 ].slots;
				articleSourceResult = ( slots && slots.main && slots.main.content ) || '';
				return articleSourceResult;
			} )
			.catch( () => {
				articleSourceResult = '';
				return '';
			} )
			.finally( () => {
				articleSourcePromise = null;
			} );

		return articleSourcePromise;
	}

	async function articleUsesSupportedFootballerInfobox() {
		if ( pageInfoboxCheckResult !== null ) {
			return pageInfoboxCheckResult;
		}

		if ( pageInfoboxCheckPromise ) {
			return pageInfoboxCheckPromise;
		}

		const title = getCurrentPageTitle();
		if ( !title ) {
			pageInfoboxCheckResult = false;
			return pageInfoboxCheckResult;
		}

		pageInfoboxCheckPromise = getArticleSource()
			.then( ( content ) => {
				pageInfoboxCheckResult = hasSupportedFootballerInfobox( content );
				return pageInfoboxCheckResult;
			} )
			.catch( () => {
				pageInfoboxCheckResult = false;
				return false;
			} )
			.finally( () => {
				pageInfoboxCheckPromise = null;
			} );

		return pageInfoboxCheckPromise;
	}

	function ensureQuickAccessLink() {
		if ( quickAccessLink ) {
			return quickAccessLink;
		}

		if ( !window.mw || !window.mw.util || !window.mw.util.addPortletLink ) {
			return null;
		}

		const portletId = getActionPortletId();
		if ( portletId ) {
			quickAccessLink = window.mw.util.addPortletLink(
				portletId,
				buildToolEditUrl(),
				TOOL_NAME,
				VIEW_LINK_ID,
				`Open ${ TOOL_NAME }`
			);
		} else {
			quickAccessLink = document.createElement( 'a' );
			quickAccessLink.href = buildToolEditUrl();
			quickAccessLink.textContent = TOOL_NAME;
			quickAccessLink.className = 'tfsh-view-launch';
			( document.querySelector( '#contentSub, .mw-body-header' ) || document.body )
				.appendChild( quickAccessLink );
		}
		quickAccessTab = quickAccessLink ? quickAccessLink.closest( 'li' ) : null;
		return quickAccessLink;
	}

	function cleanValue( value ) {
		return String( value === null || value === undefined ? '' : value ).trim();
	}

	function stripHtmlComments( value ) {
		return cleanValue(
			String( value === null || value === undefined ? '' : value )
				.replace( /<!--[\s\S]*?-->/g, '' )
		);
	}

	function splitInfoboxReferences( value ) {
		const references = [];
		const withoutReferences = cleanValue( value ).replace(
			/<ref\b[^>]*\/\s*>|<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi,
			( reference ) => {
				references.push( reference );
				return '';
			}
		);
		return { value: stripHtmlComments( withoutReferences ), references };
	}

	function escapeCell( value ) {
		return cleanValue( value ).split( /(<ref\b[^>]*\/\s*>|<ref\b[^>]*>[\s\S]*?<\/ref\s*>)/gi )
			.map( ( part, index ) => index % 2 ? part : part.replace( /\|/g, '{{!}}' ) ).join( '' );
	}

	function normalizeBoolean( value ) {
		return value === true || value === 'true' || value === '1';
	}

	function isUnknown( value ) {
		return cleanValue( value ) === '?';
	}

	function isBlank( value ) {
		return cleanValue( value ) === '';
	}

	function numericValue( value ) {
		const cleaned = stripHtmlComments( value );
		if ( !cleaned || cleaned === '?' || /^[-–—−]$/.test( cleaned ) ) {
			return 0;
		}
		const digits = cleaned.replace( /[^\d-]/g, '' );
		return digits && digits !== '-' ? Number( digits ) : 0;
	}

	function buildWikiLink( target, label ) {
		const cleanTarget = cleanValue( target );
		const cleanLabel = cleanValue( label );
		if ( !cleanTarget && !cleanLabel ) {
			return '';
		}
		if ( !cleanTarget || cleanTarget === cleanLabel ) {
			return `[[${ escapeCell( cleanLabel || cleanTarget ) }]]`;
		}
		return `[[${ escapeCell( cleanTarget ) }|${ escapeCell( cleanLabel ) }]]`;
	}

	function clubAnnotationText( row, infobox = false ) {
		let annotation = row.clubAnnotation;
		if ( annotation === undefined ) {
			annotation = [ cleanValue( row.reserveAnnotation ),
				normalizeBoolean( row.isGuest ) ? '(guest)' : '' ].filter( Boolean ).join( ' ' );
		}
		return infobox ? cleanValue( annotation ) : cleanValue( annotation ).replace(
			/\[\[[^\]]+\]\]|\(\s*(?:res\.|reserve)\s*\)/gi,
			( part ) => part.startsWith( '[[' ) ? part : '(reserve)'
		);
	}

	function formatTeamCell( row, options = {} ) {
		const team = cleanValue( row.team );
		let renderedTeam;
		if ( normalizeBoolean( row.disableTeamLink ) ) {
			renderedTeam = escapeCell( team );
		} else {
			const teamLink = cleanValue( row.teamLink );
			renderedTeam = buildWikiLink( teamLink || team, team );
		}
		if ( options.infobox ) {
			renderedTeam += ( row.teamRefs || [] ).join( '' );
		}
		const annotation = clubAnnotationText( row, options.infobox );
		if ( annotation ) {
			renderedTeam += ' ' + annotation;
		}
		if ( normalizeBoolean( row.isLoan ) ) {
			return options.withArrow ? `→ ${ renderedTeam } (loan)` : `${ renderedTeam } (loan)`;
		}
		return options.withArrow && row.clubPrefix ? `${ row.clubPrefix } ${ renderedTeam }` : renderedTeam;
	}

	function normalizeYearDashes( value ) {
		return cleanValue( value )
			.replace( /(\d{4})\s*[-\u2013\u2014\u2212]\s*(?=\d{2,4}\b|$)/g, '$1\u2013' )
			.replace( /^[-\u2013\u2014\u2212]\s*(?=\d{4}\b|$)/, '\u2013' );
	}

	function normalizeSeasonText( value ) {
		return normalizeYearDashes( value ).replace( /(\d{4})\u2013(\d{4})\b/g,
			( full, start, end ) => formatSeasonRange( start, end ) );
	}

	function normalizeSeasonTarget( value ) {
		const target = normalizeSeasonText( value );
		return target.replace( /^(.+?) (\d{4}(?:\u2013\d{2,4})?) seasonu$/, '$2 $1 season' );
	}

	function defaultSeasonTarget( row ) {
		const team = cleanValue( row.team );
		const teamLink = cleanValue( row.teamLink );
		const targetTeam = teamLink || team;
		return [ normalizeSeasonText( row.season ), targetTeam, 'season' ].filter( Boolean ).join( ' ' );
	}

	function formatSeasonCell( row ) {
		const season = normalizeSeasonText( row.season );
		const references = tableCellReferences( row, 'season' );
		if ( normalizeBoolean( row.disableSeasonLink ) ) {
			return escapeCell( season ) + references;
		}
		const seasonLink = normalizeSeasonTarget( row.seasonLink );
		return buildWikiLink( seasonLink || defaultSeasonTarget( row ), season ) + references;
	}

	function formatLeagueCell( row ) {
		return formatNamedLeagueCell( row, 'leagueName' );
	}

	function formatLocalLeagueCell( row ) {
		return formatNamedLeagueCell( row, 'localLeagueName' );
	}

	function formatNamedLeagueCell( row, key ) {
		const leagueName = normalizeSeasonText( row[ key ] );
		if ( !leagueName || /^[-–—−]$/.test( leagueName ) ) {
			return '—';
		}
		const yearNamedLeague = leagueName.match( /^(\d{4}(?:\u2013\d{2,4})?)\s+(.+)$/ );
		const season = yearNamedLeague ? yearNamedLeague[ 1 ] : normalizeSeasonText( row.season );
		const labelSource = yearNamedLeague ? yearNamedLeague[ 2 ] : leagueName;
		const englishLeague = englishLeagueNames( labelSource, season );
		const linkTarget = `${ season } ${ englishLeague.target }`.trim();
		const displayName = englishLeague.label.replace( /\s*\([^()]+\)\s*$/, '' ).trim() || englishLeague.label;
		return buildWikiLink( linkTarget, displayName );
	}

	function englishLeagueNames( name, season ) {
		const startYear = Number( ( season.match( /^\d{4}/ ) || [] )[ 0 ] );
		if ( name === 'FA Premier League' ) {
			return { target: name, label: 'Premier League' };
		}
		if ( name === 'Premier League' && startYear >= 1992 && startYear < 2007 ) {
			return { target: 'FA Premier League', label: name };
		}
		const division = name.match( /^(?:Football League )?((?:First|Second|Third|Fourth) Division(?: (?:North|South))?)$/ );
		if ( division ) {
			return { target: `Football League ${ division[ 1 ] }`, label: division[ 1 ] };
		}
		const footballLeague = name.match( /^(?:(EFL|Football(?: League(?= Championship))?) )?(Championship|League One|League Two)$/ );
		if ( footballLeague ) {
			const label = footballLeague[ 2 ];
			const historicalPrefix = label === 'Championship' ? 'Football League' : 'Football';
			const prefix = footballLeague[ 1 ] || ( startYear < 2016 ? historicalPrefix : 'EFL' );
			return { target: `${ prefix } ${ label }`, label };
		}
		return { target: name, label: name };
	}

	function activeStatPairs() {
		const pairs = [ [ 'leagueApps', 'leagueGoals' ] ];
		if ( localLeagueEnabled ) {
			pairs.push( [ 'localLeagueApps', 'localLeagueGoals' ] );
		}
		if ( nationalCupEnabled ) {
			pairs.push( [ 'cupApps', 'cupGoals' ] );
		}
		if ( leagueCupEnabled ) {
			pairs.push( [ 'leagueCupApps', 'leagueCupGoals' ] );
		}
		if ( continentalEnabled ) {
			pairs.push( [ 'continentalApps', 'continentalGoals' ] );
		}
		if ( otherEnabled ) {
			pairs.push( [ 'otherApps', 'otherGoals' ] );
		}
		return pairs;
	}

	function rowHasUnknown( row ) {
		return activeStatPairs().some( ( [ appsKey, goalsKey ] ) => {
			const appsUnknown = isUnknown( row[ appsKey ] );
			return appsUnknown || isUnknown( row[ goalsKey ] );
		} );
	}

	function rowsHaveUnknown( rows ) {
		return rows.some( ( row ) => rowHasUnknown( row ) );
	}

	function computeRowTotals( row ) {
		if ( rowHasUnknown( row ) ) {
			return { apps: null, goals: null, unknown: true };
		}

		let apps = 0;
		let goals = 0;
		activeStatPairs().forEach( ( [ appsKey, goalsKey ] ) => {
			apps += numericValue( row[ appsKey ] );
			goals += numericValue( row[ goalsKey ] );
		} );
		return { apps, goals, unknown: false };
	}

	function sumColumnWithUnknown( rows, key ) {
		let total = 0;
		let unknown = false;
		rows.forEach( ( row ) => {
			if ( isUnknown( row[ key ] ) ) {
				unknown = true;
				return;
			}
			total += numericValue( row[ key ] );
		} );
		return { total, unknown };
	}

	function pairDisplay( appsValue, goalsValue ) {
		if ( isUnknown( appsValue ) && isBlank( goalsValue ) ) {
			goalsValue = '?';
		}
		if ( isBlank( appsValue ) && isBlank( goalsValue ) ) {
			return { merged: true, text: '—' };
		}
		return {
			merged: false,
			apps: escapeCell( cleanValue( appsValue ).replace( /^[-–—−]$/, '—' ) ),
			goals: escapeCell( cleanValue( goalsValue ).replace( /^[-–—−]$/, '—' ) ),
			missingGoals: Boolean( cleanValue( appsValue ) &&
				!isUnknown( appsValue ) && isBlank( goalsValue ) )
		};
	}

	function updateGoalInputState( appsInput, goalsInput, autoFill ) {
		const apps = cleanValue( appsInput.value );
		if ( apps === '?' && !cleanValue( goalsInput.value ) ) {
			goalsInput.value = '?';
		} else if ( autoFill && /^\d+$/.test( apps ) && !cleanValue( goalsInput.value ) ) {
			goalsInput.value = '0';
		}
		goalsInput.classList.toggle(
			'tfsh-missing-goal',
			Boolean( apps ) && apps !== '?' && !cleanValue( goalsInput.value )
		);
	}

	function joinedRow( marker, cells ) {
		const separator = `${ marker }${ marker }`;
		return `${ marker }${ cells.join( separator ) }`;
	}

	function groupRowsByTeam( rows ) {
		const groups = [];
		rows.forEach( ( row ) => {
			const team = cleanValue( row.team );
			if ( !team ) {
				return;
			}

			const key = JSON.stringify( [
				team,
				cleanValue( row.teamLink ),
				normalizeBoolean( row.isLoan ),
				normalizeBoolean( row.disableTeamLink ),
				normalizeBoolean( row.isGuest ),
				Boolean( cleanValue( row.reserveAnnotation ) ),
				clubAnnotationText( row ),
				row.clubSpellId ?? row.infoboxSourceIndex
			] );
			const previous = groups[ groups.length - 1 ];

			if ( previous && previous.key === key ) {
				previous.rows.push( row );
				return;
			}

			groups.push( {
				key,
				rows: [ row ]
			} );
		} );
		return groups;
	}

	function rowTeamIdentityKey( row ) {
		return JSON.stringify( [
			cleanValue( row.team ),
			cleanValue( row.teamLink ),
			normalizeBoolean( row.isLoan ),
			normalizeBoolean( row.disableTeamLink ),
			Boolean( cleanValue( row.reserveAnnotation ) ),
			clubAnnotationText( row )
		] );
	}

	function sortRowsForCareerTable( rows ) {
		return rows.map( ( row, index ) => ( { row, index } ) )
			.sort( ( first, second ) => {
				const firstBounds = seasonBounds( first.row.season );
				const secondBounds = seasonBounds( second.row.season );
				const firstStart = Number( firstBounds.start );
				const secondStart = Number( secondBounds.start );
				if ( Number.isFinite( firstStart ) && Number.isFinite( secondStart ) &&
					firstStart !== secondStart ) {
					return firstStart - secondStart;
				}
				const firstEnd = Number( firstBounds.end );
				const secondEnd = Number( secondBounds.end );
				if ( Number.isFinite( firstEnd ) && Number.isFinite( secondEnd ) &&
					firstEnd !== secondEnd ) {
					return firstEnd - secondEnd;
				}
				return first.index - second.index;
			} )
			.map( ( item ) => item.row );
	}

	function buildGroupRowLines( group, totalRows = group.rows, noteNames = new Map() ) {
		const lines = [];
		const representative = group.rows[ 0 ];
		const rowSpan = totalRows.length > 1 ? group.rows.length + 1 : group.rows.length;
		let groupTotalApps = 0;
		let groupTotalGoals = 0;
		const groupHasUnknown = rowsHaveUnknown( totalRows );

		totalRows.forEach( ( row ) => {
			const rowTotal = computeRowTotals( row );
			if ( !rowTotal.unknown ) {
				groupTotalApps += rowTotal.apps;
				groupTotalGoals += rowTotal.goals;
			}
		} );

		group.rows.forEach( ( row, index ) => {
			const rowTotal = computeRowTotals( row );
			const cells = [];
			lines.push( '|-' );
			if ( index === 0 ) {
				lines.push( '|' + ( rowSpan > 1 ?
					`rowspan="${ rowSpan }"|${ formatTeamCell( representative ) }` :
					formatTeamCell( representative ) ) );
			}
			lines.push( '|' + formatSeasonCell( row ) );
			const leaguePair = tableStatPair( row, 'leagueApps', 'leagueGoals' );
			if ( !cleanValue( row.leagueName ) && leaguePair.merged ) {
				lines.push( '|colspan="3"|' + leaguePair.text + tableCellReferences( row, 'leagueName' ) );
			} else {
				lines.push( '|' + formatLeagueCell( row ) + tableCellReferences( row, 'leagueName' ) );
				cells.push( ...( leaguePair.merged ?
					[ `colspan="2"|${ leaguePair.text }` ] :
					[ leaguePair.apps, leaguePair.missingGoals ?
						`style="background:#fdd; color:#900"|${ leaguePair.goals }` : leaguePair.goals ] ) );
			}
			const competitionPairs = [];
			if ( localLeagueEnabled ) {
				const localLeaguePair = tableStatPair( row, 'localLeagueApps', 'localLeagueGoals' );
				if ( !cleanValue( row.localLeagueName ) && localLeaguePair.merged ) {
					cells.push( 'colspan="3"|' + localLeaguePair.text + tableCellReferences( row, 'localLeagueName' ) );
				} else {
					cells.push( formatLocalLeagueCell( row ) + tableCellReferences( row, 'localLeagueName' ) );
					cells.push( ...( localLeaguePair.merged ?
						[ `colspan="2"|${ localLeaguePair.text }` ] :
						[ localLeaguePair.apps, localLeaguePair.missingGoals ?
							`style="background:#fdd; color:#900"|${ localLeaguePair.goals }` : localLeaguePair.goals ] ) );
				}
			}
			if ( nationalCupEnabled ) {
				competitionPairs.push( competitionPair( row, 'cupApps', 'cupGoals', noteNames ) );
			}
			if ( leagueCupEnabled ) {
				competitionPairs.push( competitionPair( row, 'leagueCupApps', 'leagueCupGoals', noteNames ) );
			}
			if ( continentalEnabled ) {
				competitionPairs.push( competitionPair( row, 'continentalApps', 'continentalGoals', noteNames ) );
			}
			if ( otherEnabled ) {
				competitionPairs.push( competitionPair( row, 'otherApps', 'otherGoals', noteNames ) );
			}
			competitionPairs.forEach( ( pair ) => {
				if ( pair.merged ) {
					cells.push( `colspan="2"|${ pair.text }${ pair.note }` );
				} else {
					cells.push( pair.apps + pair.note );
					cells.push( pair.missingGoals ?
						`style="background:#fdd; color:#900"|${ pair.goals }` : pair.goals );
				}
			} );
			if ( rowTotal.unknown ) {
				cells.push( '?' );
				cells.push( '?' );
			} else {
				cells.push( String( rowTotal.apps ) );
				cells.push( String( rowTotal.goals ) );
			}
			cells[ cells.length - 2 ] += tableCellReferences( row, 'totalApps' );
			cells[ cells.length - 1 ] += tableCellReferences( row, 'totalGoals' );
			lines.push( joinedRow( '|', cells ) );
		} );

		if ( totalRows.length > 1 ) {
			lines.push( '|-' );
			const totalCells = [ 'colspan="2"|Total' ];
			activeStatPairs().forEach( ( [ appsKey, goalsKey ] ) => {
				if ( appsKey === 'localLeagueApps' ) {
					totalCells.push( '\u2014' );
				}
				const allDashes = totalRows.every( ( row ) => (
					[ appsKey, goalsKey ].every( ( key ) => /^[-\u2013\u2014\u2212]?$/.test( cleanValue( row[ key ] ) ) )
				) );
				if ( allDashes ) {
					totalCells.push( 'colspan="2"|\u2014' );
				} else {
					[ appsKey, goalsKey ].forEach( ( key ) => {
						const sum = sumColumnWithUnknown( totalRows, key );
						totalCells.push( sum.unknown ? '?' : String( sum.total ) );
					} );
				}
			} );
			if ( groupHasUnknown ) {
				totalCells.push( '?' );
				totalCells.push( '?' );
			} else {
				totalCells.push( String( groupTotalApps ) );
				totalCells.push( String( groupTotalGoals ) );
			}
			lines.push( '!' + totalCells[ 0 ], joinedRow( '!', totalCells.slice( 1 ) ) );
		}

		const ownTotals = group.rows.map( ( row ) => computeRowTotals( row ) );
		return {
			lines,
			totalApps: ownTotals.reduce( ( sum, row ) => sum + ( row.unknown ? 0 : row.apps ), 0 ),
			totalGoals: ownTotals.reduce( ( sum, row ) => sum + ( row.unknown ? 0 : row.goals ), 0 ),
			unknown: groupHasUnknown
		};
	}

	function orderCareerTableLoans( rows ) {
		const result = [];
		let parentKey = null;
		let parentRows = [];
		let loanRows = [];

		function flush() {
			result.push( ...parentRows, ...loanRows );
			parentRows = [];
			loanRows = [];
		}

		rows.forEach( ( row ) => {
			if ( normalizeBoolean( row.isLoan ) ) {
				loanRows.push( row );
				return;
			}

			const key = JSON.stringify( [ rowTeamIdentityKey( row ),
				row.clubSpellId ?? row.infoboxSourceIndex ] );
			if ( key !== parentKey ) {
				flush();
				parentKey = key;
			}
			parentRows.push( row );
		} );

		flush();
		return result;
	}

	function buildTableWikitext( rows ) {
		const noteNames = new Map();
		const tableRows = rows.filter( ( row ) => !normalizeBoolean( row.infoboxOnly ) );
		const sortedRows = sortRowsForCareerTable( tableRows );
		const groups = groupRowsByTeam( orderCareerTableLoans( sortedRows ) );
		const topHeaders = [
			'rowspan="2"|Club',
			'rowspan="2"|Season',
			'colspan="3"|League'
		];
		const subHeaders = [ 'Division', 'Apps', 'Goals' ];
		if ( localLeagueEnabled ) {
			topHeaders.push( 'colspan="3"|Local league' );
			subHeaders.push( 'Division', 'Apps', 'Goals' );
		}
		if ( nationalCupEnabled ) {
			topHeaders.push( 'colspan="2"|National cup' );
			subHeaders.push( 'Apps', 'Goals' );
		}
		if ( leagueCupEnabled ) {
			topHeaders.push( 'colspan="2"|League cup' );
			subHeaders.push( 'Apps', 'Goals' );
		}
		if ( continentalEnabled ) {
			topHeaders.push( 'colspan="2"|Continental' );
			subHeaders.push( 'Apps', 'Goals' );
		}
		if ( otherEnabled ) {
			topHeaders.push( `colspan="2"|${ buildOtherHeaderText() }` );
			subHeaders.push( 'Apps', 'Goals' );
		}
		topHeaders.push( 'colspan="2"|Total' );
		subHeaders.push( 'Apps', 'Goals' );
		const lines = [
			'{| class="wikitable" style="text-align:center"',
			'|+ Appearances and goals by club, season and competition',
			'|-',
			...topHeaders.map( ( header ) => '!' + header ),
			'|-',
			'!' + subHeaders.join( '!!' )
		];

		let grandApps = 0;
		let grandGoals = 0;
		const grandHasUnknown = rowsHaveUnknown( tableRows );
		const grandLeagueApps = sumColumnWithUnknown( tableRows, 'leagueApps' );
		const grandLeagueGoals = sumColumnWithUnknown( tableRows, 'leagueGoals' );
		const grandLocalLeagueApps = sumColumnWithUnknown( tableRows, 'localLeagueApps' );
		const grandLocalLeagueGoals = sumColumnWithUnknown( tableRows, 'localLeagueGoals' );
		const grandCupApps = sumColumnWithUnknown( tableRows, 'cupApps' );
		const grandCupGoals = sumColumnWithUnknown( tableRows, 'cupGoals' );
		const grandLeagueCupApps = sumColumnWithUnknown( tableRows, 'leagueCupApps' );
		const grandLeagueCupGoals = sumColumnWithUnknown( tableRows, 'leagueCupGoals' );
		const grandContinentalApps = sumColumnWithUnknown( tableRows, 'continentalApps' );
		const grandContinentalGoals = sumColumnWithUnknown( tableRows, 'continentalGoals' );
		const grandOtherApps = sumColumnWithUnknown( tableRows, 'otherApps' );
		const grandOtherGoals = sumColumnWithUnknown( tableRows, 'otherGoals' );

		groups.forEach( ( group, index ) => {
			const previous = groups[ index - 1 ];
			const currentRow = group.rows[ 0 ];
			if ( previous ) {
				const previousRow = previous.rows[ previous.rows.length - 1 ];
				const previousBounds = seasonBounds( previousRow.season );
				const currentBounds = seasonBounds( currentRow.season );
				const calendarOffset = /^\d{4}$/.test( cleanValue( previousRow.season ) ) ? 1 : 0;
				const consecutive = Number( currentBounds.start ) >= Number( previousBounds.start ) &&
					Number( currentBounds.start ) <= Number( previousBounds.end ) + calendarOffset;
				if ( consecutive && normalizeBoolean( previousRow.isLoan ) !== normalizeBoolean( currentRow.isLoan ) &&
					rowTeamIdentityKey( { ...previousRow, isLoan: false } ) ===
					rowTeamIdentityKey( { ...currentRow, isLoan: false } ) ) {
					group.totalRows = [ ...( previous.totalRows || previous.rows ), ...group.rows ];
				}
			}
			const groupRow = buildGroupRowLines( group, group.totalRows, noteNames );
			lines.push( ...groupRow.lines );
			grandApps += groupRow.totalApps;
			grandGoals += groupRow.totalGoals;
		} );

		if ( groups.length > 1 ) {
			lines.push( '|-' );
			const grandCells = [
				'colspan="3"|Career total',
				grandLeagueApps.unknown ? '?' : String( grandLeagueApps.total ),
				grandLeagueGoals.unknown ? '?' : String( grandLeagueGoals.total )
			];
			if ( localLeagueEnabled ) {
				grandCells.push(
					'—',
					grandLocalLeagueApps.unknown ? '?' : String( grandLocalLeagueApps.total ),
					grandLocalLeagueGoals.unknown ? '?' : String( grandLocalLeagueGoals.total )
				);
			}
			if ( nationalCupEnabled ) {
				grandCells.push(
					grandCupApps.unknown ? '?' : String( grandCupApps.total ),
					grandCupGoals.unknown ? '?' : String( grandCupGoals.total )
				);
			}
			if ( leagueCupEnabled ) {
				grandCells.push(
					grandLeagueCupApps.unknown ? '?' : String( grandLeagueCupApps.total ),
					grandLeagueCupGoals.unknown ? '?' : String( grandLeagueCupGoals.total )
				);
			}
			if ( continentalEnabled ) {
				grandCells.push( grandContinentalApps.unknown ? '?' : String( grandContinentalApps.total ) );
				grandCells.push( grandContinentalGoals.unknown ? '?' : String( grandContinentalGoals.total ) );
			}
			if ( otherEnabled ) {
				grandCells.push( grandOtherApps.unknown ? '?' : String( grandOtherApps.total ) );
				grandCells.push( grandOtherGoals.unknown ? '?' : String( grandOtherGoals.total ) );
			}
			if ( grandHasUnknown ) {
				grandCells.push( '?' );
				grandCells.push( '?' );
			} else {
				grandCells.push( String( grandApps ) );
				grandCells.push( String( grandGoals ) );
			}
			lines.push( '!' + grandCells[ 0 ], joinedRow( '!', grandCells.slice( 1 ) ) );
		}

		lines.push( '|}' );
		return lines.join( '\n' );
	}

	function buildOtherHeaderText() {
		return 'Other';
	}

	function joinCompetitionItems( items ) {
		if ( items.length < 2 ) {
			return items[ 0 ] || '';
		}
		return items.slice( 0, -1 ).join( ', ' ) + ' and ' + items[ items.length - 1 ];
	}

	function competitionLink( name ) {
		const value = cleanValue( name );
		const linked = value.match( /^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/ );
		if ( !linked && /\[\[|\{\{|<ref\b/i.test( value ) ) {
			return value;
		}
		const target = linked ? linked[ 1 ] : value;
		const label = ( linked && linked[ 2 ] ) ||
			target.replace( /\s*\([^()]+\)\s*$/, '' ).trim();
		return buildWikiLink( target, label );
	}

	const NOTE_NUMBER_WORDS = [ 'zero', 'one', 'two', 'three', 'four', 'five', 'six',
		'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
		'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen' ];
	const NOTE_NUMBER_TENS = [ '', '', 'twenty', 'thirty', 'forty', 'fifty',
		'sixty', 'seventy', 'eighty', 'ninety' ];
	const NOTE_NUMBER_SCALES = [ [ 1e15, 'quadrillion' ], [ 1e12, 'trillion' ],
		[ 1e9, 'billion' ], [ 1e6, 'million' ], [ 1000, 'thousand' ], [ 100, 'hundred' ] ];
	const NOTE_NUMBER_PATTERN = '(?:\\d+|(?:' + [ ...NOTE_NUMBER_WORDS,
		...NOTE_NUMBER_TENS.filter( Boolean ), ...NOTE_NUMBER_SCALES.map( ( scale ) => scale[ 1 ] ) ]
		.join( '|' ) + ')(?:[ -](?:' + [ ...NOTE_NUMBER_WORDS,
		...NOTE_NUMBER_TENS.filter( Boolean ), ...NOTE_NUMBER_SCALES.map( ( scale ) => scale[ 1 ] ) ]
		.join( '|' ) + '))*)';

	function formatNoteNumber( number ) {
		if ( !Number.isSafeInteger( number ) || number < 0 ) {
			return String( number );
		}
		if ( number < 20 ) {
			return NOTE_NUMBER_WORDS[ number ];
		}
		if ( number < 100 ) {
			return NOTE_NUMBER_TENS[ Math.floor( number / 10 ) ] +
				( number % 10 ? '-' + NOTE_NUMBER_WORDS[ number % 10 ] : '' );
		}
		const [ scale, word ] = NOTE_NUMBER_SCALES.find( ( item ) => number >= item[ 0 ] );
		return formatNoteNumber( Math.floor( number / scale ) ) + ' ' + word +
			( number % scale ? ' ' + formatNoteNumber( number % scale ) : '' );
	}

	function parseNoteNumber( text ) {
		if ( /^\d+$/.test( text ) ) {
			return text;
		}
		let total = 0;
		let group = 0;
		text.toLowerCase().split( /[ -]/ ).forEach( ( word ) => {
			const small = NOTE_NUMBER_WORDS.indexOf( word );
			const tens = NOTE_NUMBER_TENS.indexOf( word );
			if ( small >= 0 ) {
				group += small;
			} else if ( tens >= 2 ) {
				group += tens * 10;
			} else if ( word === 'hundred' ) {
				group *= 100;
			} else {
				const scale = NOTE_NUMBER_SCALES.find( ( item ) => item[ 1 ] === word );
				total += group * scale[ 0 ];
				group = 0;
			}
		} );
		return String( total + group );
	}

	function competitionNoteSentence( note ) {
		const value = cleanValue( note );
		if ( !value ) {
			return '';
		}
		return new RegExp( '^' + NOTE_NUMBER_PATTERN + ' appearances?\\b', 'i' ).test( value ) ?
			value : 'Appearances in ' + value + '.';
	}

	function formatCompetitionEntries( entries ) {
		const filled = entries.filter( ( entry ) => cleanValue( entry.name ) );
		const detailed = filled.length > 1 && filled.every( ( entry ) => (
			/^\d+$/.test( cleanValue( entry.apps ) )
		) );
		if ( !detailed ) {
			return joinCompetitionItems( filled.map( ( entry ) => competitionLink( entry.name ) ) );
		}
		const parts = filled.map( ( entry ) => {
			const apps = Number( entry.apps );
			const goals = Number( entry.goals || 0 );
			return formatNoteNumber( apps ) + ( apps === 1 ? ' appearance' : ' appearances' ) +
				( goals ? ' and ' + formatNoteNumber( goals ) + ( goals === 1 ? ' goal' : ' goals' ) : '' ) +
				' in ' + competitionLink( entry.name );
		} );
		const sentence = joinCompetitionItems( parts ) + '.';
		return sentence.charAt( 0 ).toUpperCase() + sentence.slice( 1 );
	}

	function parseCompetitionEntries( note ) {
		const value = cleanValue( note );
		if ( !value ) {
			return [ { name: '', apps: '', goals: '' } ];
		}
		const detailed = [];
		let remainder = value.replace(
			new RegExp( '(' + NOTE_NUMBER_PATTERN + ') appearances?(?: and (' +
				NOTE_NUMBER_PATTERN + ') goals?)? in (\\[\\[[^\\]]+\\]\\])', 'gi' ),
			( full, apps, goals, link ) => {
				const target = link.match( /^\[\[([^|\]]+)/ )[ 1 ];
				detailed.push( { name: target, apps: parseNoteNumber( apps ),
					goals: goals ? parseNoteNumber( goals ) : '0' } );
				return '';
			}
		);
		if ( detailed.length > 1 && !remainder.replace( /[\s,.]|\band\b|(?!)/g, '' ) ) {
			return detailed;
		}
		const entries = [];
		const plain = value.replace( /^Appearances in |\.$/g, '' );
		remainder = plain.replace( /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, ( full, target ) => {
			entries.push( { name: target, apps: '', goals: '' } );
			return '';
		} );
		if ( entries.length && !remainder.replace( /[\s,]|\band\b/g, '' ) ) {
			return entries;
		}
		return [ { name: value, apps: '', goals: '' } ];
	}

	function readCompetitionEntries() {
		return activeNoteEditor.entries.map( ( entry ) => ( {
			name: cleanValue( entry.name.value ),
			apps: cleanValue( entry.apps.value ),
			goals: cleanValue( entry.goals.value )
		} ) );
	}

	function updateCompetitionEntryState() {
		const entries = activeNoteEditor.entries;
		const enabled = entries.length > 1;
		entries.forEach( ( entry ) => {
			entry.apps.disabled = !enabled;
			entry.goals.disabled = !enabled;
			entry.apps.setCustomValidity( '' );
			entry.goals.setCustomValidity( '' );
		} );
		const preview = backdrop.querySelector( '.tfsh-note-preview' );
		preview.textContent = competitionNoteSentence( formatCompetitionEntries( readCompetitionEntries() ) )
			.replace( /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, ( full, target, label ) => label || target );
	}

	function addCompetitionEntry( initial = {} ) {
		const list = backdrop.querySelector( '.tfsh-note-entries' );
		const element = document.createElement( 'tr' );
		element.className = 'tfsh-note-entry';
		const name = document.createElement( 'input' );
		name.type = 'text';
		name.className = 'tfsh-note-dialog-input';
		name.placeholder = 'Competition';
		name.setAttribute( 'aria-label', 'Competition' );
		name.value = initial.name || '';
		const nameCell = document.createElement( 'td' );
		nameCell.appendChild( name );
		element.appendChild( nameCell );
		const controls = {};
		[ [ 'apps', 'Apps' ], [ 'goals', 'Goals' ] ].forEach( ( [ key, label ] ) => {
			const input = document.createElement( 'input' );
			input.type = 'text';
			input.inputMode = 'numeric';
			input.pattern = '[0-9]*';
			input.className = 'tfsh-stat';
			input.setAttribute( 'aria-label', label );
			input.title = label;
			input.value = initial[ key ] || '';
			const cell = document.createElement( 'td' );
			cell.className = 'tfsh-stat-cell';
			cell.appendChild( input );
			element.appendChild( cell );
			controls[ key ] = input;
		} );
		const removeCell = document.createElement( 'td' );
		removeCell.className = 'tfsh-remove-cell';
		const remove = document.createElement( 'button' );
		remove.type = 'button';
		remove.className = 'tfsh-remove';
		remove.textContent = '\u2212';
		remove.title = 'Remove competition';
		remove.setAttribute( 'aria-label', remove.title );
		removeCell.appendChild( remove );
		element.appendChild( removeCell );
		const entry = { element, name, ...controls };
		activeNoteEditor.entries.push( entry );
		list.appendChild( element );
		[ name, controls.apps, controls.goals ].forEach( ( input ) => {
			input.addEventListener( 'input', () => {
				if ( input === controls.apps ) {
					updateGoalInputState( controls.apps, controls.goals, true );
				}
				updateCompetitionEntryState();
			} );
		} );
		remove.addEventListener( 'click', () => {
			activeNoteEditor.entries = activeNoteEditor.entries.filter( ( item ) => item !== entry );
			element.remove();
			if ( !activeNoteEditor.entries.length ) {
				addCompetitionEntry().name.focus();
			}
			updateCompetitionEntryState();
		} );
		updateCompetitionEntryState();
		return entry;
	}

	function validateCompetitionEntries() {
		const entries = activeNoteEditor.entries.filter( ( entry ) => cleanValue( entry.name.value ) );
		const detailed = entries.length > 1 && entries.some( ( entry ) => (
			cleanValue( entry.apps.value ) || cleanValue( entry.goals.value )
		) );
		if ( !detailed ) {
			return true;
		}
		for ( const entry of entries ) {
			for ( const key of [ 'apps', 'goals' ] ) {
				const value = cleanValue( entry[ key ].value );
				if ( ( key === 'apps' || value ) && !/^\d+$/.test( value ) ) {
					entry[ key ].setCustomValidity( 'Enter a whole number of zero or more for each competition.' );
					entry[ key ].reportValidity();
					return false;
				}
			}
		}
		return true;
	}

	function tableCellReferences( row, key ) {
		return ( row.tableCellRefs && row.tableCellRefs[ key ] || [] ).join( '' );
	}

	function tableStatPair( row, appsKey, goalsKey ) {
		const pair = pairDisplay( row[ appsKey ], row[ goalsKey ] );
		const appsRefs = tableCellReferences( row, appsKey );
		const goalsRefs = tableCellReferences( row, goalsKey );
		return pair.merged ? { ...pair, text: pair.text + appsRefs + goalsRefs } :
			{ ...pair, apps: pair.apps + appsRefs, goals: pair.goals + goalsRefs };
	}

	function competitionPair( row, appsKey, goalsKey, noteNames ) {
		const pair = tableStatPair( row, appsKey, goalsKey );
		if ( pair.merged ) {
			return { ...pair, note: '' };
		}
		const note = cleanValue( row.competitionNotes && row.competitionNotes[ appsKey ] );
		if ( note && noteNames.has( note ) ) {
			return { ...pair, note: `{{efn|name=${ noteNames.get( note ) }}}` };
		}
		if ( note && !noteNames.has( note ) ) {
			noteNames.set( note, 'note' + ( noteNames.size + 1 ) );
		}
		return { ...pair, note: note ? `{{efn|name=${ noteNames.get( note ) }|1=${ competitionNoteSentence( note ) }}}` : '' };
	}

	function splitCompetitionNote( value, namedNotes = new Map() ) {
		const match = /\{\{\s*efn\s*\|/i.exec( value );
		if ( !match ) {
			return { value, note: '' };
		}
		let depth = 0;
		for ( let i = match.index; i < value.length - 1; i++ ) {
			const pair = value.slice( i, i + 2 );
			if ( pair === '{{' ) {
				depth++;
				i++;
			} else if ( pair === '}}' ) {
				depth--;
				i++;
				if ( depth === 0 ) {
					const raw = value.slice( match.index, i + 1 );
					const parameters = topLevelTemplateParameters( raw );
					const nameParameter = parameters.find( ( item ) => item.name === 'name' );
					const noteName = nameParameter ? cleanValue( nameParameter.value ) : '';
					const parameter = parameters.find(
						( item ) => item.name === '1' || !item.name
					);
					if ( !parameter ) {
						return namedNotes.has( noteName ) ? {
							value: value.slice( 0, match.index ) + value.slice( i + 1 ),
							note: namedNotes.get( noteName )
						} : { value, note: '' };
					}
					const content = parameter.name ? parameter.value : raw.slice( parameter.start + 1, parameter.end );
					const note = cleanValue( content ).replace( /^Appearances in ([\s\S]*)\.$/, '$1' );
					if ( noteName && note ) {
						namedNotes.set( noteName, note );
					}
					return {
						value: value.slice( 0, match.index ) + value.slice( i + 1 ),
						note
					};
				}
			}
		}
		return { value, note: '' };
	}

	function collectCompetitionNotes( source ) {
		const namedNotes = new Map();
		const pattern = /\{\{\s*efn\s*\|/gi;
		let match;
		while ( ( match = pattern.exec( source ) ) ) {
			splitCompetitionNote( source.slice( match.index ), namedNotes );
		}
		return namedNotes;
	}

	function buildOtherNoteText() {
		return '';
	}

	function buildCareerSection( rows ) {
		const updated = updateDate ? `{{Updated|${ updateDate }}}\n` : '';
		const clubHeading = nationalTeamCareerEnabled ? '=== Club ===\n' : '';
		const sectionHeading = managerCareerEnabled ?
			'Career statistics' : 'Career statistics';
		return `== ${ sectionHeading } ==\n${ clubHeading }${ updated }${ buildTableWikitext( rows ) }${ buildOtherNoteText() }\n`;
	}

	function extractCellContent( cellText ) {
		const cell = cleanValue( cellText ).replace( /\{\{!\}\}/g, '|' );
		const attrIndex = cell.indexOf( '|' );
		if ( attrIndex !== -1 && /^(?:rowspan|colspan|style|class|id|align|valign|width|height|scope|data-[\w-]+)\s*=/i.test( cell ) ) {
			return cleanValue( cell.slice( attrIndex + 1 ) );
		}
		return cell;
	}

	function tableCellSpan( cellText, name ) {
		const cell = stripHtmlComments( cellText );
		if ( extractCellContent( cell ) === cell ) {
			return 1;
		}
		const attributes = cell.slice( 0, cell.indexOf( '|' ) );
		const pattern = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
		let match;
		while ( ( match = pattern.exec( attributes ) ) ) {
			if ( match[ 1 ].toLowerCase() === name ) {
				const value = cleanValue( match[ 2 ] ?? match[ 3 ] ?? match[ 4 ] );
				return /^\d+$/.test( value ) ? Number( value ) : 1;
			}
		}
		return 1;
	}

	function careerTableHeaders( section ) {
		return careerTableRows( section ).filter( ( row ) => row.header )
			.flatMap( ( row ) => row.cells ).map( ( cell ) => ( {
				span: tableCellSpan( cell, 'colspan' ),
				text: extractCellContent( stripHtmlComments( cell ) )
					.replace( /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, ( match, target, label ) => label || target )
					.replace( /\s+/g, ' ' ).trim()
			} ) );
	}

	function parseWikiLinkValue( value ) {
		const cleaned = cleanValue( value );
		const match = cleaned.match( /^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/ );
		if ( !match ) {
			return {
				label: cleaned,
				target: '',
				disableLink: cleaned !== ''
			};
		}

		return {
			target: cleanValue( match[ 1 ] ),
			label: cleanValue( match[ 2 ] || match[ 1 ] ),
			disableLink: false
		};
	}

	function splitInfoboxClubAnnotations( value ) {
		const text = cleanValue( value );
		const references = [];
		let plain = '';
		let linkDepth = 0;
		for ( let i = 0; i < text.length; ) {
			const opaque = text.slice( i ).match(
				/^(?:<ref\b[^>]*\/\s*>|<ref\b[^>]*>[\s\S]*?<\/ref\s*>|<!--[\s\S]*?-->)/i
			);
			if ( opaque ) {
				references.push( opaque[ 0 ] );
				i += opaque[ 0 ].length;
				continue;
			}
			const pair = text.slice( i, i + 2 );
			if ( pair === '{{' && linkDepth === 0 && cleanValue( plain ) ) {
				// Keep the entire template opaque, including nested templates and references.
				const tokens = /<!--[\s\S]*?-->|<ref\b[^>]*\/\s*>|<ref\b[^>]*>[\s\S]*?<\/ref\s*>|\x3cnowiki\b[^>]*\/\s*>|\x3cnowiki\b[^>]*>[\s\S]*?<\/nowiki\s*>|\{+|\}+/gi;
				tokens.lastIndex = i;
				let depth = 0;
				let end = text.length;
				let token;
				while ( ( token = tokens.exec( text ) ) ) {
					if ( token[ 0 ][ 0 ] === '{' ) {
						depth += token[ 0 ].length;
					} else if ( token[ 0 ][ 0 ] === '}' ) {
						depth -= token[ 0 ].length;
						if ( depth <= 0 ) {
							end = tokens.lastIndex;
							break;
						}
					}
				}
				const spacing = plain.match( /\s*$/ )[ 0 ];
				plain = plain.slice( 0, plain.length - spacing.length );
				const template = text.slice( i, end );
				// Formatting wrappers are readable; note templates remain opaque.
				const formattedLoan = template.match( /^\{\{\s*(?:small|smaller|nowrap|nobr|italic|italics)\s*\|\s*(?:1\s*=\s*)?([^{}|]*)\}\}$/i );
				if ( formattedLoan && /^\(?\s*(?:on\s+)?loan\s*\)?$/i.test(
					formattedLoan[ 1 ].replace( /<[^>]*>|'{2,5}/g, '' ).trim()
				) ) {
					plain += spacing + ' (loan)';
				} else {
					references.push( spacing + template );
				}
				i = end;
				continue;
			}
			if ( pair === '[[' || pair === ']]' ) {
				linkDepth += pair === '[[' ? 1 : -1;
				plain += pair;
				i += 2;
			} else {
				plain += text[ i ];
				i += 1;
			}
		}
		return { value: cleanValue( plain ), references };
	}

	function parseTeamValue( value ) {
		value = splitInfoboxClubAnnotations( value ).value;
		const loanPrefixMatch = value.match( /^(?:→|â†’)\s*(.*)$/ );
		const withoutArrow = cleanValue( loanPrefixMatch ? loanPrefixMatch[ 1 ] : value );
		const teamLink = withoutArrow.match( /\[\[[^\]]+\]\]/ );
		const suffixStart = teamLink ? teamLink.index + teamLink[ 0 ].length :
			withoutArrow.search( /\s+(?=\(|<(?:small|span|i|em|b|strong)\b|'{2}|(?:on\s+)?loan\s*$|guest\s*$)/i );
		const club = teamLink ? teamLink[ 0 ] :
			suffixStart === -1 ? withoutArrow : withoutArrow.slice( 0, suffixStart );
		let annotation = suffixStart === -1 ? '' : cleanValue( withoutArrow.slice( suffixStart ) );
		const visibleAnnotation = annotation.replace( /<[^>]*>|'{2,5}/g, '' )
			.replace( /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, ( full, target, label ) => label || target );
		const hasLoanText = /\bloan\b/i.test( visibleAnnotation );
		const reserveMatch = visibleAnnotation.match( /\(\s*(?:res\.|reserve)\s*\)/i );
		const hasGuestText = /\bguest\b/i.test( visibleAnnotation );
		if ( hasLoanText ) {
			annotation = annotation.replace( /<[^>]*>|\[\[[^\]]+\]\]|\b(?:on\s+)?loan\b/gi,
				( part ) => {
					if ( part.startsWith( '<' ) ) {
						return part;
					}
					if ( part.startsWith( '[[' ) ) {
						const annotationLink = parseWikiLinkValue( part );
						return /^(?:on\s+)?loan$/i.test( annotationLink.label ) ? '' : part;
					}
					return '';
				} );
			let previous;
			do {
				previous = annotation;
				annotation = annotation.replace( /\(\s*\)|'{2,5}\s*'{2,5}|<(small|span|i|em|b|strong)\b[^>]*>\s*<\/\1\s*>/gi, '' );
			} while ( annotation !== previous );
		}
		const link = parseWikiLinkValue( club );
		return {
			team: link.label,
			teamLink: link.target,
			disableTeamLink: link.disableLink,
			isLoan: hasLoanText || ( !!loanPrefixMatch && !cleanValue( visibleAnnotation ) ),
			clubPrefix: loanPrefixMatch ? '→' : '',
			isGuest: hasGuestText,
			reserveAnnotation: reserveMatch ? reserveMatch[ 0 ] : '',
			clubAnnotation: cleanValue( annotation )
		};
	}

	function parseSeasonValue( value ) {
		const link = parseWikiLinkValue( value );
		return {
			season: normalizeSeasonText( link.label ),
			seasonLink: normalizeSeasonTarget( link.target ),
			disableSeasonLink: link.disableLink || !cleanValue( link.label )
		};
	}

	function parseStatPairs( cells, startIndex, hasLeagueName = false, hasLocalLeague = false, hasNationalCup = true, hasLeagueCup = false, hasContinental = true, hasOther = true, season = '', namedNotes = new Map() ) {
		const values = {
			leagueName: '',
			leagueApps: '',
			leagueGoals: '',
			localLeagueName: '',
			localLeagueApps: '',
			localLeagueGoals: '',
			cupApps: '',
			cupGoals: '',
			leagueCupApps: '',
			leagueCupGoals: '',
			continentalApps: '',
			continentalGoals: '',
			otherApps: '',
			otherGoals: ''
		};
		values.tableCellRefs = {};
		const readCell = ( key, index ) => {
			const parsed = splitInfoboxReferences( cells[ index ] || '' );
			if ( parsed.references.length ) {
				values.tableCellRefs[ key ] = parsed.references;
			}
			return parsed.value;
		};
		let cursor = startIndex;
		const readLeagueName = ( key ) => {
			const rawLeagueCell = readCell( key, cursor );
			const spansStatistics = tableCellSpan( rawLeagueCell, 'colspan' ) === 3;
			const leagueCell = extractCellContent( rawLeagueCell );
			if ( leagueCell && !/^[-–—−]$/.test( leagueCell ) ) {
				const parsedLeague = parseWikiLinkValue( leagueCell );
				const seasonPrefix = `${ cleanValue( season ) } `;
				if ( season && parsedLeague.target.startsWith( seasonPrefix ) ) {
					values[ key ] = cleanValue( parsedLeague.target.slice( seasonPrefix.length ) );
				} else {
					values[ key ] = parsedLeague.target || parsedLeague.label;
				}
			}
			cursor += 1;
			return spansStatistics;
		};
		values.competitionNotes = {};
		const readPair = ( appsKey, goalsKey ) => {
			const rawValue = readCell( appsKey, cursor );
			const parsed = COMPETITION_NOTE_LABELS[ appsKey ] ?
				splitCompetitionNote( rawValue, namedNotes ) :
				{ value: rawValue, note: '' };
			const current = cleanValue( parsed.value );
			if ( parsed.note ) {
				values.competitionNotes[ appsKey ] = parsed.note;
			}
			if ( !current || tableCellSpan( current, 'colspan' ) === 2 || /^[-–—−]$/.test( current ) ) {
				cursor += 1;
				return;
			}
			values[ appsKey ] = extractCellContent( current );
			values[ goalsKey ] = extractCellContent( readCell( goalsKey, cursor + 1 ) );
			cursor += 2;
		};

		if ( hasLeagueName ) {
			if ( !readLeagueName( 'leagueName' ) ) {
				readPair( 'leagueApps', 'leagueGoals' );
			}
		} else {
			readPair( 'leagueApps', 'leagueGoals' );
		}
		if ( hasLocalLeague ) {
			if ( !readLeagueName( 'localLeagueName' ) ) {
				readPair( 'localLeagueApps', 'localLeagueGoals' );
			}
		}
		if ( hasNationalCup ) {
			readPair( 'cupApps', 'cupGoals' );
		}
		if ( hasLeagueCup ) {
			readPair( 'leagueCupApps', 'leagueCupGoals' );
		}
		if ( hasContinental ) {
			readPair( 'continentalApps', 'continentalGoals' );
		}
		if ( hasOther ) {
			readPair( 'otherApps', 'otherGoals' );
		}

		readCell( 'totalApps', cursor );
		readCell( 'totalGoals', cursor + 1 );
		return values;
	}

	function isFootballerStatsTable( tableText ) {
		const headers = careerTableHeaders( tableText );
		const headerText = headers.map( ( header ) => header.text ).join( ' ' )
			.toLocaleLowerCase( 'en-GB' );
		return /\bclub\b/.test( headerText ) &&
			/\bseason\b/.test( headerText ) &&
			headers.length >= 3 &&
			/^Club\b/i.test( headers[ 0 ].text ) &&
			/^Season\b/i.test( headers[ 1 ].text ) &&
			[ 2, 3 ].includes( headers[ 2 ].span ) &&
			/apps|appearances/.test( headerText ) &&
			/goals/.test( headerText );
	}

	function careerTableRows( section ) {
		const protectedValues = [];
		const protect = ( value ) => {
			protectedValues.push( value );
			return '\uE000' + ( protectedValues.length - 1 ) + '\uE001';
		};
		let masked = section.replace( /<ref\b[^>]*\/\s*>|<ref\b[^>]*>[\s\S]*?<\/ref\s*>|<!--[\s\S]*?-->|<nowik[i]\b[^>]*>[\s\S]*?<\/nowik[i]\s*>/gi, protect );
		let depth = 0;
		let start = 0;
		let result = '';
		let last = 0;
		for ( let i = 0; i < masked.length - 1; i += 1 ) {
			const pair = masked.slice( i, i + 2 );
			if ( pair === '{{' ) {
				if ( depth === 0 ) {
					start = i;
				}
				depth += 1;
				i += 1;
			} else if ( pair === '}}' && depth ) {
				depth -= 1;
				i += 1;
				if ( depth === 0 ) {
					result += masked.slice( last, start ) + protect( masked.slice( start, i + 1 ) );
					last = i + 1;
				}
			}
		}
		masked = result + masked.slice( last );
		const restore = ( value ) => value.replace( /\uE000(\d+)\uE001/g,
			( match, index ) => restore( protectedValues[ Number( index ) ] ) );
		const rows = [];
		let current = '';
		const flush = () => {
			if ( current ) {
				rows.push( current );
			}
			current = '';
		};
		masked.split( /\r?\n/ ).forEach( ( line ) => {
			const trimmed = line.trim();
			if ( /^\|[-}]/.test( trimmed ) ) {
				flush();
			} else if ( /^[!|]/.test( trimmed ) && !trimmed.startsWith( '|+' ) ) {
				if ( current && current[ 0 ] !== trimmed[ 0 ] ) {
					flush();
				}
				current += current ? trimmed[ 0 ] + trimmed : trimmed;
			} else if ( current ) {
				current += '\n' + line;
			}
		} );
		flush();
		return rows.map( ( row ) => ( {
			header: row.startsWith( '!' ),
			cells: row.slice( 1 ).split( row.startsWith( '!' ) ? /\s*!!\s*/ : /\s*\|\|\s*/ ).map( restore )
		} ) );
	}

	function parseRowsFromCareerSection( source ) {
		const sourceText = source || '';
		const tableRange = findWikitableRanges( sourceText ).find(
			( range ) => isFootballerStatsTable( sourceText.slice( range.start, range.end ) )
		);
		if ( !tableRange ) {
			return { rows: [], otherNote: '' };
		}
		const section = sourceText.slice( tableRange.start, tableRange.end );
		const namedNotes = collectCompetitionNotes( sourceText );

		const otherNoteMatch = section.match( /Other(?:\\s+Cup)?\\s*\\{\\{efn\\|Appearances in (.+?)\\.\\}\\}/i );
		const parsedOtherNote = cleanValue( otherNoteMatch ? otherNoteMatch[ 1 ] : '' );
		const tableRows = careerTableRows( section );
		const headers = careerTableHeaders( section );
		const hasHeader = ( span, pattern ) => headers.slice( 3 ).some( ( header ) => (
			header.span === span && pattern.test( header.text )
		) );
		const hasLeagueName = headers[ 2 ].span === 3;
		const hasLocalLeague = hasHeader( 3, /^Local league\b/i );
		if ( hasLocalLeague ) {
			localLeagueEnabled = true;
		}
		const hasLeagueCup = hasHeader( 2, /^(?:League cup|EFL Cup)\b/i );
		if ( hasLeagueCup ) {
			leagueCupEnabled = true;
		}
		const hasNationalCup = hasHeader( 2, /^(?:(?:National )?Cup|Coppa Italia|FA Cup)\b/i );
		const hasContinental = hasHeader( 2, /^(?:Continental|Europe)\b/i );
		const hasOther = hasHeader( 2, /^Other(?: Cup)?\b/i );
		nationalCupEnabled = hasNationalCup;
		continentalEnabled = hasContinental;
		otherEnabled = hasOther;
		const rows = [];
		let activeTeam = null;
		let remainingTeamRows = 0;

		tableRows.forEach( ( tableRow ) => {
			if ( tableRow.header ) {
				activeTeam = null;
				return;
			}
			const rawCells = tableRow.cells;

			if ( !rawCells.length ) {
				return;
			}

			if ( /^Total$/i.test( extractCellContent( rawCells[ 0 ] ) ) ) {
				return;
			}

			let seasonCellIndex = 0;
			let statStartIndex = 1;
			const firstCell = cleanValue( rawCells[ 0 ] );
			const teamSpan = tableCellSpan( firstCell, 'rowspan' );
			if ( teamSpan > 1 || !activeTeam ) {
				remainingTeamRows = teamSpan;
				activeTeam = {
					...parseTeamValue( extractCellContent( firstCell ) ),
					clubSpellId: `table:${ rows.length }`
				};
				seasonCellIndex = 1;
				statStartIndex = 2;
			}

			const seasonCell = extractCellContent( rawCells[ seasonCellIndex ] || '' );
			if ( !seasonCell || /^Total$/i.test( seasonCell ) ) {
				return;
			}

			const seasonSource = splitInfoboxReferences( seasonCell );
			const season = parseSeasonValue( seasonSource.value );
			rows.push( {
				...activeTeam,
				...season,
				...parseStatPairs(
					rawCells,
					statStartIndex,
					hasLeagueName,
					hasLocalLeague,
					hasNationalCup,
					hasLeagueCup,
					hasContinental,
					hasOther,
					season.season,
					namedNotes
				)
			} );
			if ( seasonSource.references.length ) {
				rows[ rows.length - 1 ].tableCellRefs.season = seasonSource.references;
			}
			remainingTeamRows -= 1;
			if ( remainingTeamRows <= 0 ) {
				activeTeam = null;
			}
		} );

		if ( parsedOtherNote ) {
			rows.forEach( ( row ) => {
				row.competitionNotes.otherApps = row.competitionNotes.otherApps || parsedOtherNote;
			} );
		}
		return { rows, otherNote: parsedOtherNote, hasTable: true };
	}

	function topLevelTemplateParameters( templateText ) {
		const pipeIndexes = [];
		let templateDepth = 0;
		let linkDepth = 0;
		let templateEnd = templateText.length;

		for ( let i = 0; i < templateText.length - 1; i += 1 ) {
			if ( templateText[ i ] === '<' ) {
				const opaque = templateText.slice( i ).match(
					/^(?:<ref\b[^>]*\/\s*>|<ref\b[^>]*>[\s\S]*?<\/ref\s*>|<!--[\s\S]*?-->)/i
				);
				if ( opaque ) {
					i += opaque[ 0 ].length - 1;
					continue;
				}
			}
			const pair = templateText.slice( i, i + 2 );
			if ( pair === '{{' ) {
				templateDepth += 1;
				i += 1;
			} else if ( pair === '}}' ) {
				if ( templateDepth === 1 ) {
					templateEnd = i;
				}
				templateDepth = Math.max( templateDepth - 1, 0 );
				i += 1;
			} else if ( pair === '[[' ) {
				linkDepth += 1;
				i += 1;
			} else if ( pair === ']]' ) {
				linkDepth = Math.max( linkDepth - 1, 0 );
				i += 1;
			} else if ( templateText[ i ] === '|' && templateDepth === 1 && linkDepth === 0 ) {
				pipeIndexes.push( i );
			}
		}

		return pipeIndexes.map( ( start, index ) => {
			const end = pipeIndexes[ index + 1 ] || templateEnd;
			const content = templateText.slice( start + 1, end );
			const equalsIndex = content.indexOf( '=' );
			return {
				start,
				end,
				name: equalsIndex === -1 ? '' : cleanValue( content.slice( 0, equalsIndex ) ),
				value: equalsIndex === -1 ? '' : cleanValue( content.slice( equalsIndex + 1 ) )
			};
		} );
	}

	function isInfoboxCareerParameter( name ) {
		return /^(years|clubs|caps|goals)\d+$/i.test( cleanValue( name ) );
	}

	function removeInfoboxCareerParameters( templateText ) {
		const parameters = topLevelTemplateParameters( templateText )
			.filter( ( parameter ) => isInfoboxCareerParameter( parameter.name ) ||
				/^(totalcaps|totalgoals)$/i.test( cleanValue( parameter.name ) ) )
			.reverse();
		let result = templateText;
		parameters.forEach( ( parameter ) => {
			result = result.slice( 0, parameter.start ) + result.slice( parameter.end );
		} );
		return result;
	}

	function removeEmptyCareerGroups( templateText ) {
		const parameters = topLevelTemplateParameters( templateText );
		const removals = new Set();
		const groups = new Map();
		const familyPatterns = [
			{
				family: 'club',
				pattern: /^(years|clubs|caps|goals)(\d+)$/i,
				yearNames: [ 'years' ],
				teamNames: [ 'clubs' ]
			},
			{
				family: 'youth',
				pattern: /^(youthyears|youthclubs)(\d+)$/i,
				yearNames: [ 'youthyears' ],
				teamNames: [ 'youthclubs' ]
			},
			{
				family: 'national',
				pattern: /^(nationalyears|nationalteam|nationalcaps|nationalgoals)(\d+)$/i,
				yearNames: [ 'nationalyears' ],
				teamNames: [ 'nationalteam' ]
			},
			{
				family: 'manager',
				pattern: /^(manageryears|managerclubs)(\d+)$/i,
				yearNames: [ 'manageryears' ],
				teamNames: [ 'managerclubs' ]
			}
		];

		parameters.forEach( ( parameter ) => {
			const name = cleanValue( parameter.name ).toLocaleLowerCase( 'en-GB' );
			for ( const definition of familyPatterns ) {
				const match = name.match( definition.pattern );
				if ( !match ) {
					continue;
				}
				const key = `${ definition.family }:${ match[ 2 ] }`;
				const group = groups.get( key ) || {
					parameters: [],
					yearValue: '',
					teamValue: ''
				};
				group.parameters.push( parameter );
				if ( definition.yearNames.includes( match[ 1 ] ) ) {
					group.yearValue = stripHtmlComments( parameter.value );
				}
				if ( definition.teamNames.includes( match[ 1 ] ) ) {
					group.teamValue = stripHtmlComments( parameter.value );
				}
				groups.set( key, group );
				break;
			}
		} );

		groups.forEach( ( group ) => {
			if ( !group.yearValue && !group.teamValue ) {
				group.parameters.forEach( ( parameter ) => removals.add( parameter ) );
			}
		} );

		let result = templateText;
		Array.from( removals ).sort( ( a, b ) => b.start - a.start ).forEach( ( parameter ) => {
			result = result.slice( 0, parameter.start ) + result.slice( parameter.end );
		} );
		return result;
	}

	function ensureMissingYouthYearParameters( templateText ) {
		const parameters = topLevelTemplateParameters( templateText );
		const existingYears = new Set();
		parameters.forEach( ( parameter ) => {
			const name = cleanValue( parameter.name ).toLocaleLowerCase( 'en-GB' );
			const yearMatch = name.match( /^youthyears(\d+)$/i );
			if ( yearMatch ) {
				existingYears.add( yearMatch[ 1 ] );
			}
		} );

		const insertions = parameters
			.map( ( parameter ) => {
				const name = cleanValue( parameter.name ).toLocaleLowerCase( 'en-GB' );
				const teamMatch = name.match( /^youthclubs(\d+)$/i );
				if ( !teamMatch || existingYears.has( teamMatch[ 1 ] ) ) {
					return null;
				}
				return {
					start: parameter.start,
					text: `| youthyears${ teamMatch[ 1 ] } = \n`
				};
			} )
			.filter( Boolean )
			.sort( ( a, b ) => b.start - a.start );

		let result = templateText;
		insertions.forEach( ( insertion ) => {
			result = result.slice( 0, insertion.start ) + insertion.text +
				result.slice( insertion.start );
		} );
		return result;
	}

	function normalizeInfoboxParameterLines( templateText ) {
		const parameters = topLevelTemplateParameters( templateText );
		const insertions = parameters
			.filter( ( parameter ) => parameter.start > 0 && templateText[ parameter.start - 1 ] !== '\n' )
			.map( ( parameter ) => ( { start: parameter.start, text: '\n' } ) );
		const closingIndex = templateText.lastIndexOf( '}}' );
		if ( closingIndex > 0 && templateText[ closingIndex - 1 ] !== '\n' ) {
			insertions.push( { start: closingIndex, text: '\n' } );
		}

		let result = templateText;
		insertions.sort( ( a, b ) => b.start - a.start ).forEach( ( insertion ) => {
			result = result.slice( 0, insertion.start ) + insertion.text +
				result.slice( insertion.start );
		} );
		return result;
	}

	function protectInfoboxReferences( text ) {
		const references = [];
		const protectedText = text.replace( /<ref\b[^>]*\/\s*>|<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi,
			( reference ) => {
				const token = `__TFS_REFERENCE_${ references.length }__`;
				references.push( reference );
				return token;
			} );
		return {
			text: protectedText,
			restore( value ) {
				return value.replace( /__TFS_REFERENCE_(\d+)__/g,
					( full, index ) => references[ Number( index ) ] || full );
			}
		};
	}

	function normalizeInfoboxParameterSpacing( templateText ) {
		const replacements = topLevelTemplateParameters( templateText )
			.filter( ( parameter ) => !/^medaltemplates$/i.test( cleanValue( parameter.name ) ) )
			.map( ( parameter ) => {
				const raw = templateText.slice( parameter.start, parameter.end );
				const equalsIndex = raw.indexOf( '=' );
				if ( equalsIndex === -1 ) {
					return null;
				}
				const valueStart = equalsIndex + 1;
				const horizontalWhitespace = raw.slice( valueStart ).match( /^[ \t]*/ )[ 0 ];
				const valueRemainder = raw.slice( valueStart + horizontalWhitespace.length );
				const separator = valueRemainder.startsWith( '\n' ) ? ' ' : ' ';
				return {
					start: parameter.start,
					end: parameter.start + valueStart + horizontalWhitespace.length,
					text: `| ${ cleanValue( parameter.name ) } =${ separator }`
				};
			} )
			.filter( Boolean )
			.sort( ( a, b ) => b.start - a.start );

		let result = templateText;
		replacements.forEach( ( replacement ) => {
			result = result.slice( 0, replacement.start ) + replacement.text +
				result.slice( replacement.end );
		} );
		return result;
	}

	function reorderNationalTeamParameters( templateText ) {
		const fieldOrder = [ 'nationalyears', 'nationalteam', 'nationalcaps', 'nationalgoals' ];
		const parameters = topLevelTemplateParameters( templateText );
		const groups = new Map();
		parameters.forEach( ( parameter ) => {
			const match = cleanValue( parameter.name ).toLocaleLowerCase( 'en-GB' )
				.match( /^(nationalyears|nationalteam|nationalcaps|nationalgoals)(\d+)$/i );
			if ( !match ) {
				return;
			}
			const index = match[ 2 ];
			const group = groups.get( index ) || new Map();
			group.set( match[ 1 ].toLocaleLowerCase( 'en-GB' ), parameter );
			groups.set( index, group );
		} );

		if ( !groups.size ) {
			return templateText;
		}

		const nationalParameters = parameters.filter( ( parameter ) => /^(nationalyears|nationalteam|nationalcaps|nationalgoals)\d+$/i.test(
			cleanValue( parameter.name )
		) );
		const firstStart = Math.min(
			...nationalParameters.map( ( parameter ) => parameter.start )
		);
		let result = templateText;
		nationalParameters.slice().sort( ( a, b ) => b.start - a.start ).forEach( ( parameter ) => {
			result = result.slice( 0, parameter.start ) + result.slice( parameter.end );
		} );

		const ordered = Array.from( groups.keys() )
			.sort( ( a, b ) => Number( a ) - Number( b ) )
			.flatMap( ( index ) => {
				const group = groups.get( index );
				return fieldOrder
					.map( ( field ) => group.get( field ) )
					.filter( Boolean )
					.map( ( parameter ) => templateText
						.slice( parameter.start, parameter.end ).trim() );
			} )
			.join( '\n' );
		return result.slice( 0, firstStart ) + ordered + '\n' + result.slice( firstStart );
	}

	function extractAndRemoveManagerParameters( templateText ) {
		const parameters = topLevelTemplateParameters( templateText )
			.filter( ( parameter ) => /^manager/i.test( cleanValue( parameter.name ) ) );
		const values = parameters.map(
			( parameter ) => templateText.slice( parameter.start, parameter.end ).trim()
		);
		let result = templateText;
		parameters.slice().reverse().forEach( ( parameter ) => {
			result = result.slice( 0, parameter.start ) + result.slice( parameter.end );
		} );
		return { text: result, values };
	}

	function extractAndRemoveMedalParameters( templateText ) {
		const parameters = topLevelTemplateParameters( templateText )
			.filter( ( parameter ) => /^(?:medaltemplates(?:-expand|-title)?|show-medals)$/i.test( cleanValue( parameter.name ) ) );
		const values = parameters.map( ( parameter ) => (
			templateText.slice( parameter.start, parameter.end ).trimEnd()
		) );
		let result = templateText;
		parameters.slice().reverse().forEach( ( parameter ) => {
			result = result.slice( 0, parameter.start ) + result.slice( parameter.end );
		} );
		return { text: result, values };
	}

	function currentUpdateDate() {
		const today = new Date();
		return `${ String( today.getUTCHours() ).padStart( 2, '0' ) }:${ String( today.getUTCMinutes() ).padStart( 2, '0' ) }, ${ today.getUTCDate() } ${ UPDATE_MONTHS[ today.getUTCMonth() ] } ${ today.getUTCFullYear() } (UTC)`;
	}

	function formatInfoboxUpdateDate( value ) {
		return stripHtmlComments( cleanValue( value ) )
			.replace( /<ref\b[^>]*>[\s\S]*?<\/ref\s*>|<ref\b[^>]*\/\s*>/gi, '' )
			.replace( /\[\[([^|\]]+\|)?([^\]]+)\]\]/g, '$2' ).trim();
	}

	async function resolveUpdateDateTemplate( value, loadId ) {
		if ( !value.includes( '{{' ) || typeof mw.Api !== 'function' ) {
			return;
		}
		try {
			const response = await new mw.Api().post( {
				action: 'parse',
				text: value,
				title: mw.config.get( 'wgPageName' ),
				contentmodel: 'wikitext',
				prop: 'text',
				disablelimitreport: true,
				formatversion: 2
			} );
			const html = response.parse && response.parse.text;
			if ( typeof html !== 'string' ) {
				return;
			}
			const parsed = new DOMParser().parseFromString( html, 'text/html' );
			if ( parsed.querySelector( '.error' ) ) {
				return;
			}
			Array.from( parsed.querySelectorAll(
				'style, script, .sortkey, .reference, [hidden], [style*="display:none"], [style*="display: none"]'
			) )
				.forEach( ( element ) => element.remove() );
			const formatted = formatInfoboxUpdateDate( parsed.body.textContent.replace( /\s+/g, ' ' ).trim() );
			if ( !/^\d{1,2} [\p{L}]+ \d{4}$/u.test( formatted ) ||
				loadId !== updateDateLoadId || !updateDateAutomatic || updateDateUseToday ) {
				return;
			}
			updateDateDraft = formatted;
			syncUpdateDate( updateDateCareerActive );
		} catch ( error ) {
			mw.log.warn( 'Could not parse the update date template:', error );
		}
	}

	function initializeUpdateDate( source ) {
		const loadId = ++updateDateLoadId;
		const bounds = detectInfoboxBounds( source || '' );
		const parameter = bounds && topLevelTemplateParameters( bounds.lines.slice( bounds.startIndex, bounds.endIndex + 1 ).join( '\n' ) )
			.filter( ( item ) => /^(?:club-update|pcupdate)$/i.test( cleanValue( item.name ) ) )
			.sort( ( a, b ) => Number( /^pcupdate$/i.test( a.name ) ) - Number( /^pcupdate$/i.test( b.name ) ) )[ 0 ];
		updateDateDraft = ( parameter && formatInfoboxUpdateDate( parameter.value ) ) || currentUpdateDate();
		updateDateAutomatic = true;
		updateDateUseToday = false;
		syncUpdateDate( sourceHasOpenEndedClubYear( source ) );
		return resolveUpdateDateTemplate( updateDateDraft, loadId );
	}

	function syncUpdateDate( active ) {
		updateDateCareerActive = active;
		if ( updateDateDraft === null ) {
			updateDateDraft = currentUpdateDate();
		}
		if ( updateDateUseToday ) {
			updateDateDraft = currentUpdateDate();
		}
		updateDate = active ? formatInfoboxUpdateDate( updateDateDraft ) : '';
		if ( updateDateInput ) {
			updateDateInput.disabled = !active;
			updateDateInput.value = active ? updateDateDraft : '';
			updateDateInput.placeholder = active ? currentUpdateDate() : 'Retired';
			updateDateInput.classList.toggle( 'tfsh-date-automatic', active && updateDateAutomatic );
		}
		if ( updateDateTodayInput ) {
			updateDateTodayInput.disabled = !active;
			updateDateTodayInput.checked = active && updateDateUseToday;
		}
	}

	function refreshUpdateDate() {
		syncUpdateDate( updateDateCareerActive );
	}

	function sourceHasOpenEndedClubYear( source ) {
		const bounds = detectInfoboxBounds( source || '' );
		if ( !bounds ) {
			return false;
		}
		const infoboxText = bounds.lines.slice( bounds.startIndex, bounds.endIndex + 1 ).join( '\n' );
		return topLevelTemplateParameters( infoboxText ).some( ( parameter ) => (
			/^years\d+$/i.test( cleanValue( parameter.name ) ) &&
			/[-–—]\s*$/.test( stripHtmlComments( parameter.value ) )
		) );
	}

	function hasManagerCareerData( source ) {
		const bounds = detectInfoboxBounds( source || '' );
		if ( !bounds ) {
			return false;
		}
		const infoboxText = bounds.lines.slice( bounds.startIndex, bounds.endIndex + 1 ).join( '\n' );
		return topLevelTemplateParameters( infoboxText ).some( ( parameter ) => (
			/^manageryears\d+$/i.test( cleanValue( parameter.name ) ) &&
			Boolean( stripHtmlComments( parameter.value ) )
		) );
	}

	function rowsHaveOpenEndedClubYear( rows ) {
		const infoboxRows = aggregateInfoboxRows( rows );
		return infoboxRows.some( ( row, index ) => (
			/[-–—]\s*$/.test(
				infoboxSeasonRangeText( row, infoboxRows[ index + 1 ] )
			)
		) );
	}

	function updateInfoboxUpdateParameter( templateText ) {
		const parameters = topLevelTemplateParameters( templateText ).filter(
			( item ) => /^(?:club-update|pcupdate|nationalteam-update|ntupdate)$/i.test( cleanValue( item.name ) )
		);
		const updates = parameters
			.filter( ( item ) => /^(?:nationalteam-update|ntupdate)$/i.test( cleanValue( item.name ) ) )
			.map( ( item ) => templateText.slice( item.start, item.end ).trimEnd() );
		if ( cleanValue( updateDate ) ) {
			updates.unshift( '| club-update = ' + updateDate );
		}
		let withoutUpdate = templateText;
		parameters.slice().reverse().forEach( ( parameter ) => {
			withoutUpdate = withoutUpdate.slice( 0, parameter.start ) +
				withoutUpdate.slice( parameter.end );
		} );
		if ( !updates.length ) {
			return withoutUpdate;
		}
		const remaining = topLevelTemplateParameters( withoutUpdate );
		const nationalParameters = remaining.filter( ( item ) => (
			/^(?:nationalyears|nationalteam|nationalcaps|nationalgoals)\d+$/i.test( cleanValue( item.name ) )
		) );
		const medals = remaining.find( ( item ) => (
			/^(?:medaltemplates(?:-expand|-title)?|show-medals)$/i.test( cleanValue( item.name ) )
		) );
		const insertAt = nationalParameters.length ?
			nationalParameters[ nationalParameters.length - 1 ].end :
			( medals ? medals.start : withoutUpdate.lastIndexOf( '}}' ) );
		if ( insertAt === -1 ) {
			return withoutUpdate;
		}
		return withoutUpdate.slice( 0, insertAt ).trimEnd() + '\n' +
			updates.join( '\n' ) + '\n' + withoutUpdate.slice( insertAt );
	}

	function hasNationalTeamCareerData( source ) {
		const found = findWikitableRanges( source ).some( ( range ) => isNationalStatisticsTable(
			source.slice( range.start, range.end )
		)
		);
		if ( found ) {
			return true;
		}
		const bounds = detectInfoboxBounds( source );
		if ( bounds ) {
			const infoboxText = bounds.lines.slice( bounds.startIndex, bounds.endIndex + 1 ).join( '\n' );
			const hasNationalTeamParameter = topLevelTemplateParameters( infoboxText ).some(
				( parameter ) => /^nationalteam\d+$/i.test( cleanValue( parameter.name ) ) &&
					Boolean( cleanValue( parameter.value ) )
			);
			if ( hasNationalTeamParameter ) {
				return true;
			}
		}

		return findWikitableRanges( source ).some( ( range ) => {
			const precedingSource = source.slice( 0, range.start );
			const headingRegex = /^(={2,6})\s*([^=\n].*?)\s*\1\s*$/gm;
			let nearestHeading = '';
			let match;
			while ( ( match = headingRegex.exec( precedingSource ) ) !== null ) {
				nearestHeading = cleanValue( match[ 2 ] ).toLocaleLowerCase( 'en-GB' );
			}
			return /international/.test( nearestHeading );
		} );
	}

	function formatSeasonRange( start, end ) {
		const fullEndYearSeasons = [ '1899-1900', '1999-2000' ];
		const normalizedRange = `${ start }-${ end }`;
		const displayedEnd = fullEndYearSeasons.includes( normalizedRange ) ? end : end.slice( -2 );
		return `${ start }\u2013${ displayedEnd }`;
	}

	function currentFootballSeasonEndYear() {
		const now = new Date();
		const seasonStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
		return String( seasonStart + 1 );
	}

	function removeUnknownInfoboxStartYear( value ) {
		return cleanValue( value ).replace( /^\{\{\s*0\s*\|\s*0000\s*\}\}\s*/i, '' );
	}

	function shortenInfoboxYearRange( value ) {
		const shortened = normalizeYearDashes( removeUnknownInfoboxStartYear( value ) ).replace(
			/(\b\d{4}\b)(\s*[-–—]\s*)(\d{4}\b)/g,
			( fullMatch, start, separator, end ) => formatSeasonRange( start, end, separator )
		);
		const ongoingMatch = shortened.match( /^(\d{4})(\s*[-–—]\s*)$/ );
		if ( !ongoingMatch ) {
			return shortened;
		}

		const currentSeasonEnd = currentFootballSeasonEndYear();
		return formatSeasonRange( ongoingMatch[ 1 ], currentSeasonEnd, ongoingMatch[ 2 ] );
	}

	function singleInfoboxYearValue( value ) {
		const cleaned = normalizeYearDashes( stripHtmlComments( value ) );
		const years = cleaned.match( /\b\d{4}\b/g ) || [];
		return years.length === 1 || /^\d{4}\s*[-–—−]\s*\d{4}$/.test( cleaned ) ? cleaned : '';
	}

	function expandInfoboxSeasonRows( row ) {
		const bounds = seasonBounds( row.season );
		const start = Number( bounds.start );
		const end = Number( bounds.end );
		if ( !Number.isInteger( start ) || !Number.isInteger( end ) || end <= start ) {
			return [ row ];
		}

		const expanded = [];
		const originalInfoboxYear = cleanValue( row.infoboxYear );
		for ( let year = start; year < end; year += 1 ) {
			const seasonRow = {
				...row,
				season: formatSeasonRange( String( year ), String( year + 1 ), '-' ),
				seasonLink: '',
				infoboxYear: '',
				infoboxStatRefs: year === start ? row.infoboxStatRefs : { apps: [], goals: [] },
				infoboxRefs: year === start ? row.infoboxRefs : { team: [], year: [] },
				ongoingSeasonStart: ''
			};

			// Assign infobox totals to the first season only.
			if ( year > start ) {
				STAT_PAIRS.forEach( ( [ appsKey, goalsKey ] ) => {
					seasonRow[ appsKey ] = '';
					seasonRow[ goalsKey ] = '';
				} );
			}
			expanded.push( seasonRow );
		}
		if ( expanded.length && row.ongoingSeasonStart ) {
			expanded[ expanded.length - 1 ].ongoingSeasonStart = row.ongoingSeasonStart;
		}
		if ( expanded.length && originalInfoboxYear ) {
			const closedRange = originalInfoboxYear.match(
				/^(\d{4})\s*[-–—−]\s*(\d{4})$/
			);
			if ( /^[-–—−]\s*\d{4}$/.test( originalInfoboxYear ) ) {
				expanded[ 0 ].infoboxYear = originalInfoboxYear;
			} else if ( row.ongoingSeasonStart ) {
				expanded[ 0 ].infoboxYear = row.ongoingSeasonStart;
				expanded[ expanded.length - 1 ].infoboxYear = '\u2013';
			} else if ( closedRange ) {
				expanded[ 0 ].infoboxYear = closedRange[ 1 ];
				expanded[ expanded.length - 1 ].infoboxYear = closedRange[ 2 ];
			} else {
				expanded[ 0 ].infoboxYear = originalInfoboxYear;
			}
		}
		if ( expanded.length === 1 && originalInfoboxYear ) {
			expanded[ 0 ].infoboxYear = originalInfoboxYear;
		}
		return expanded;
	}

	function parseRowsFromInfobox( source ) {
		const bounds = detectInfoboxBounds( source || '' );
		if ( !bounds ) {
			return [];
		}

		const rowsByIndex = new Map();
		const infoboxText = bounds.lines.slice( bounds.startIndex, bounds.endIndex + 1 ).join( '\n' );

		topLevelTemplateParameters( infoboxText ).forEach( ( parameter ) => {
			const match = parameter.name.match( /^(years|clubs|caps|goals)(\d+)$/i );
			if ( !match ) {
				return;
			}

			const field = match[ 1 ].toLowerCase();
			const index = Number( match[ 2 ] );
			const value = parameter.value;
			const row = rowsByIndex.get( index ) || {
				team: '',
				teamLink: '',
				disableTeamLink: false,
				isLoan: false,
				season: '',
				seasonLink: '',
				disableSeasonLink: false,
				leagueName: '',
				leagueApps: '',
				leagueGoals: '',
				localLeagueName: '',
				localLeagueApps: '',
				localLeagueGoals: '',
				cupApps: '',
				cupGoals: '',
				leagueCupApps: '',
				leagueCupGoals: '',
				continentalApps: '',
				continentalGoals: '',
				otherApps: '',
				otherGoals: ''
			};
			row.infoboxSourceIndex = index;
			row.clubSpellId = `infobox:${ index }`;
			row.infoboxStatRefs = row.infoboxStatRefs || {};
			row.infoboxRefs = row.infoboxRefs || {};

			if ( field === 'years' ) {
				const seasonValue = splitInfoboxReferences( value );
				const normalizedValue = removeUnknownInfoboxStartYear( seasonValue.value );
				row.infoboxRefs.year = seasonValue.references;
				row.infoboxOriginalSeason = normalizedValue;
				const unknownStartMatch = index === 1 ?
					normalizedValue.match( /^\s*[-–—−]\s*(\d{4})\s*$/ ) : null;
				const ongoingMatch = normalizedValue.match( /^(\d{4})\s*[-–—]\s*$/ );
				if ( unknownStartMatch ) {
					const endYear = Number( unknownStartMatch[ 1 ] );
					row.season = formatSeasonRange(
						String( endYear - 1 ),
						String( endYear ),
						'-'
					);
					row.infoboxYear = singleInfoboxYearValue( normalizedValue );
				} else {
					row.season = shortenInfoboxYearRange( normalizedValue );
					row.infoboxYear = singleInfoboxYearValue( normalizedValue );
				}
				row.ongoingSeasonStart = ongoingMatch ? ongoingMatch[ 1 ] : '';
				row.seasonLink = '';
				row.disableSeasonLink = !cleanValue( normalizedValue );
			} else if ( field === 'clubs' ) {
				const teamValue = splitInfoboxClubAnnotations( value );
				const parsedTeam = parseTeamValue( teamValue.value );
				row.infoboxRefs.team = teamValue.references;
				row.team = parsedTeam.team;
				row.teamLink = parsedTeam.teamLink;
				row.disableTeamLink = parsedTeam.disableTeamLink;
				row.isLoan = parsedTeam.isLoan;
				row.reserveAnnotation = parsedTeam.reserveAnnotation;
				row.isGuest = parsedTeam.isGuest;
				row.clubAnnotation = parsedTeam.clubAnnotation;
				row.clubPrefix = parsedTeam.clubPrefix;
			} else if ( field === 'caps' ) {
				const stat = splitInfoboxReferences( value );
				row.leagueApps = stripHtmlComments( stat.value ).includes( '+' ) ? '?' : stat.value;
				row.infoboxDashApps = /^[-–—−]$/.test( cleanValue( stat.value ) );
				row.infoboxStatRefs.apps = stat.references;
			} else if ( field === 'goals' ) {
				const stat = splitInfoboxReferences( value );
				row.leagueGoals = stripHtmlComments( stat.value ).includes( '+' ) ? '?' : stat.value;
				row.infoboxDashGoals = /^[-–—−]$/.test( cleanValue( stat.value ) );
				row.infoboxStatRefs.goals = stat.references;
			}

			rowsByIndex.set( index, row );
		} );

		return Array.from( rowsByIndex.entries() )
			.sort( ( a, b ) => a[ 0 ] - b[ 0 ] )
			.map( ( [ , row ] ) => {
				// An empty value represents an unknown total; 0 represents an actual zero.
				if ( row.team || row.season ) {
					if ( !cleanValue( row.leagueApps ) ) {
						row.leagueApps = '?';
					}
					if ( !cleanValue( row.leagueGoals ) ) {
						row.leagueGoals = '?';
					}
				}
				return row;
			} )
			.flatMap( ( row ) => expandInfoboxSeasonRows( row ) )
			.filter( ( row ) => row.team || row.season || row.leagueApps || row.leagueGoals );
	}

	function addInfoboxYearsToTableRows( rows, source ) {
		const infoboxRows = parseRowsFromInfobox( source );
		const byTeamAndSeason = new Map();
		infoboxRows.forEach( ( row ) => {
			const bounds = seasonBounds( row.season );
			const key = `${ rowTeamIdentityKey( row ) }|${ bounds.start }|${ bounds.end }`;
			if ( !byTeamAndSeason.has( key ) ) {
				byTeamAndSeason.set( key, [] );
			}
			byTeamAndSeason.get( key ).push( row );
		} );

		// Older tables often omit the loan/reserve suffix found in the infobox.
		const matchesIdentity = ( candidate, row ) => {
			// A table may intentionally omit the link for a repeated club.
			if ( normalizeBoolean( row.disableTeamLink ) && !cleanValue( row.teamLink ) ) {
				candidate = { ...candidate, teamLink: '', disableTeamLink: true };
			}
			if ( rowTeamIdentityKey( candidate ) === rowTeamIdentityKey( row ) ) {
				return true;
			}
			if ( normalizeBoolean( row.isLoan ) || clubAnnotationText( row ) ) {
				return false;
			}
			return rowTeamIdentityKey( { ...candidate, isLoan: false,
				reserveAnnotation: '', clubAnnotation: '', isGuest: false } ) === rowTeamIdentityKey( row );
		};
		const assignedReferences = new Set();
		const enrichedRows = rows.map( ( row ) => {
			const bounds = seasonBounds( row.season );
			const key = `${ rowTeamIdentityKey( row ) }|${ bounds.start }|${ bounds.end }`;
			const candidates = byTeamAndSeason.get( key ) || [];
			let infoboxRow = candidates.shift();
			if ( !infoboxRow ) {
				const rowStart = Number( bounds.start );
				const rowEnd = Number( bounds.end );
				const matchingPeriods = new Map();
				infoboxRows.forEach( ( candidate ) => {
					const period = seasonBounds( candidate.infoboxOriginalSeason );
					const periodStart = Number( period.start );
					const periodEnd = Number( period.end );
					const sameCalendarYear = /^\d{4}$/.test( cleanValue( row.season ) );
					const withinPeriod = Number.isFinite( rowStart ) &&
						Number.isFinite( rowEnd ) &&
						Number.isFinite( periodStart ) &&
						Number.isFinite( periodEnd ) &&
						rowEnd >= periodStart &&
						( sameCalendarYear ? rowEnd <= periodEnd : rowStart <= periodEnd );
					if ( matchesIdentity( candidate, row ) && withinPeriod ) {
						if ( !matchingPeriods.has( candidate.infoboxSourceIndex ) ) {
							matchingPeriods.set( candidate.infoboxSourceIndex, candidate );
						}
					}
				} );
				if ( matchingPeriods.size === 1 ) {
					infoboxRow = matchingPeriods.values().next().value;
				}
			}
			if ( !infoboxRow ) {
				const clubPeriods = new Map();
				infoboxRows.forEach( ( candidate ) => {
					if ( matchesIdentity( candidate, row ) ) {
						clubPeriods.set( candidate.infoboxSourceIndex, candidate );
					}
				} );
				if ( clubPeriods.size === 1 ) {
					infoboxRow = clubPeriods.values().next().value;
				}
			}
			if ( !infoboxRow ) {
				return row;
			}
			const firstMatch = !assignedReferences.has( infoboxRow.infoboxSourceIndex );
			assignedReferences.add( infoboxRow.infoboxSourceIndex );
			const refRow = infoboxRows.find( ( candidate ) => (
				candidate.infoboxSourceIndex === infoboxRow.infoboxSourceIndex
			) );
			return {
				...row,
				infoboxYear: infoboxRow.infoboxYear,
				isLoan: infoboxRow.isLoan,
				reserveAnnotation: infoboxRow.reserveAnnotation,
				isGuest: infoboxRow.isGuest,
				clubAnnotation: infoboxRow.clubAnnotation,
				clubPrefix: infoboxRow.clubPrefix,
				infoboxSourceIndex: infoboxRow.infoboxSourceIndex,
				clubSpellId: infoboxRow.clubSpellId,
				infoboxOriginalSeason: infoboxRow.infoboxOriginalSeason,
				infoboxRefs: firstMatch ? refRow.infoboxRefs : { team: [], year: [] },
				infoboxStatRefs: firstMatch ? refRow.infoboxStatRefs : { apps: [], goals: [] },
				ongoingSeasonStart: infoboxRow.ongoingSeasonStart
			};
		} );
		const periodRows = new Map();
		enrichedRows.forEach( ( row ) => {
			if ( row.infoboxSourceIndex === undefined ) {
				return;
			}
			if ( !periodRows.has( row.infoboxSourceIndex ) ) {
				periodRows.set( row.infoboxSourceIndex, [] );
			}
			periodRows.get( row.infoboxSourceIndex ).push( row );
		} );
		periodRows.forEach( ( matches ) => {
			const original = stripHtmlComments( matches[ 0 ].infoboxOriginalSeason );
			const range = original.match( /^(\d{4})\s*[-–—−]\s*(\d{4})?$/ );
			if ( !range ) {
				return;
			}
			matches.forEach( ( row ) => {
				row.infoboxYear = '';
			} );
			matches[ 0 ].infoboxYear = range[ 1 ];
			matches[ matches.length - 1 ].infoboxYear = range[ 2 ] || '\u2013';
			if ( matches.length === 1 ) {
				matches[ 0 ].infoboxYear = normalizeYearDashes( original );
			}
		} );
		// Add spells missing from the table without duplicating partially matched totals.
		const missingPeriods = new Map();
		infoboxRows.forEach( ( row ) => {
			if ( assignedReferences.has( row.infoboxSourceIndex ) ) {
				return;
			}
			if ( !missingPeriods.has( row.infoboxSourceIndex ) ) {
				missingPeriods.set( row.infoboxSourceIndex, [] );
			}
			missingPeriods.get( row.infoboxSourceIndex ).push( {
				...row,
				infoboxOnly: false
			} );
		} );
		missingPeriods.forEach( ( missingRows, sourceIndex ) => {
			const nextIndex = enrichedRows.findIndex(
				( row ) => row.infoboxSourceIndex > sourceIndex
			);
			enrichedRows.splice(
				nextIndex < 0 ? enrichedRows.length : nextIndex, 0, ...missingRows
			);
		} );
		return enrichedRows;
	}

	async function getInitialSourceForForm() {
		const search = new URLSearchParams( window.location.search );
		const isSectionEdit = search.has( 'section' ) && search.get( 'section' ) !== '0';
		// Some editors create #wpTextbox1 before loading its content.
		// Fetch the article text from the API instead of using an empty textarea as the source.
		if ( textarea && !isSectionEdit && cleanValue( textarea.value ) ) {
			return textarea.value;
		}
		return getArticleSource();
	}

	function createLinkToggle( labelText, checkedValue, onChange = refreshPreview ) {
		const label = document.createElement( 'label' );
		label.className = 'tfsh-link-toggle';

		const checkbox = document.createElement( 'input' );
		checkbox.type = 'checkbox';
		checkbox.checked = normalizeBoolean( checkedValue );
		checkbox.addEventListener( 'input', onChange );
		checkbox.addEventListener( 'change', onChange );

		label.appendChild( document.createTextNode( labelText ) );
		label.appendChild( checkbox );

		return { label, checkbox };
	}

	function matchingTeamLinkRows( sourceRow ) {
		const sourceInputs = sourceRow && sourceRow.tfshData && sourceRow.tfshData.inputs;
		const team = cleanValue( sourceInputs && sourceInputs.team.value ).toLocaleLowerCase( 'en-GB' );
		return Array.from( tbody.querySelectorAll( 'tr' ) ).filter( ( candidate ) => {
			const inputs = candidate.tfshData && candidate.tfshData.inputs;
			return inputs && ( candidate === sourceRow ||
				( team && cleanValue( inputs.team.value ).toLocaleLowerCase( 'en-GB' ) === team ) );
		} );
	}

	function propagateTeamLinkPreference( sourceRow, disabled ) {
		matchingTeamLinkRows( sourceRow ).forEach( ( candidate ) => {
			const inputs = candidate.tfshData.inputs;
			inputs.disableTeamLink.checked = disabled;
			inputs.teamLink.disabled = disabled;
		} );
	}

	function propagateTeamLinkValue( sourceRow ) {
		const link = sourceRow.tfshData.inputs.teamLink.value;
		matchingTeamLinkRows( sourceRow ).forEach( ( candidate ) => {
			const inputs = candidate.tfshData.inputs;
			inputs.teamLink.value = link;
			delete inputs.teamLink.dataset.tfshAutoTeamLink;
			if ( cleanValue( link ) ) {
				inputs.disableTeamLink.checked = false;
				inputs.teamLink.disabled = false;
			}
		} );
	}

	let nextClubSpellId = 0;
	const usedClubSpellIds = new Set();

	function createRow( initialData = {} ) {
		const savedSelection = readInfoboxOnlySelections()[ infoboxOnlySelectionKey( initialData ) ];
		if ( Object.keys( initialData ).length ) {
			initialData = { ...initialData, infoboxOnly: savedSelection === true };
		}
		const tr = document.createElement( 'tr' );
		tr.tfshPreviousSeason = cleanValue( initialData.season );
		tr.tfshSeasonSequenceHandled = normalizeBoolean( initialData.seasonSequenceHandled );
		tr.tfshOngoingSeasonStart = cleanValue( initialData.ongoingSeasonStart );
		tr.tfshInfoboxSourceIndex = initialData.infoboxSourceIndex;
		while ( usedClubSpellIds.has( 'new:' + nextClubSpellId ) ) {
			nextClubSpellId++;
		}
		tr.tfshClubSpellId = initialData.clubSpellId ??
			( initialData.infoboxSourceIndex === undefined ?

				`new:${ nextClubSpellId++ }` : `infobox:${ initialData.infoboxSourceIndex }` );
		tr.tfshInfoboxOriginalSeason = initialData.infoboxOriginalSeason;
		tr.tfshInfoboxYearEdited = Boolean( initialData.infoboxYearEdited );
		tr.tfshInfoboxYearPending = initialData.infoboxYearPending === undefined ?
			Object.keys( initialData ).length === 0 : normalizeBoolean( initialData.infoboxYearPending );
		usedClubSpellIds.add( tr.tfshClubSpellId );
		tr.tfshInfoboxStatRefs = initialData.infoboxStatRefs || {};
		tr.tfshTableCellRefs = { ...initialData.tableCellRefs };
		tr.tfshCompetitionNotes = { ... initialData.competitionNotes };
		tr.tfshCompetitionNoteButtons = {};
		tr.tfshCompetitionNotePropagationDone = { ... initialData.competitionNotePropagationDone };
		Object.keys( tr.tfshCompetitionNotes ).forEach( ( key ) => {
			if ( cleanValue( tr.tfshCompetitionNotes[ key ] ) ) {
				tr.tfshCompetitionNotePropagationDone[ key ] = true;
			}
		} );
		tr.tfshInfoboxRefs = initialData.infoboxRefs || {};
		tr.tfshIsGuest = Boolean( initialData.isGuest );
		const data = {};
		const cells = {};
		let addSeasonLink = null;
		let addTeamLink = null;

		FIELD_KEYS.forEach( ( key ) => {
			data[ key ] = initialData[ key ] === null || initialData[ key ] === undefined ? '' : initialData[ key ];
		} );
		data.season = normalizeSeasonText( data.season );
		data.seasonLink = normalizeSeasonTarget( data.seasonLink );
		data.infoboxYear = normalizeYearDashes( initialData.infoboxYear );

		const fieldDefs = [
			[ 'team', 'text', 'tfsh-team' ],
			[ 'teamLink', 'text', 'tfsh-text' ],
			[ 'season', 'text', 'tfsh-season' ],
			[ 'infoboxYear', 'text', 'tfsh-season' ],
			[ 'infoboxOnly', 'checkbox', 'tfsh-infobox-only' ],
			[ 'seasonLink', 'text', 'tfsh-text' ],
			[ 'leagueName', 'text', 'tfsh-text' ],
			[ 'leagueApps', 'text', 'tfsh-stat' ],
			[ 'leagueGoals', 'text', 'tfsh-stat' ],
			[ 'localLeagueName', 'text', 'tfsh-text' ],
			[ 'localLeagueApps', 'text', 'tfsh-stat' ],
			[ 'localLeagueGoals', 'text', 'tfsh-stat' ],
			[ 'cupApps', 'text', 'tfsh-stat' ],
			[ 'cupGoals', 'text', 'tfsh-stat' ],
			[ 'leagueCupApps', 'text', 'tfsh-stat' ],
			[ 'leagueCupGoals', 'text', 'tfsh-stat' ],
			[ 'continentalApps', 'text', 'tfsh-stat' ],
			[ 'continentalGoals', 'text', 'tfsh-stat' ],
			[ 'otherApps', 'text', 'tfsh-stat' ],
			[ 'otherGoals', 'text', 'tfsh-stat' ]
		];

		fieldDefs.forEach( ( [ key, type, className ] ) => {
			const td = document.createElement( 'td' );
			if ( className === 'tfsh-stat' ) {
				td.classList.add( 'tfsh-stat-cell' );
			}
			if ( key === 'infoboxYear' ) {
				td.classList.add( 'tfsh-infobox-year-column' );
			}
			if ( key === 'leagueCupApps' || key === 'leagueCupGoals' ) {
				td.classList.add( 'tfsh-league-cup-column' );
			}
			if ( key === 'localLeagueName' || key === 'localLeagueApps' || key === 'localLeagueGoals' ) {
				td.classList.add( 'tfsh-local-league-column' );
			}
			if ( key === 'cupApps' || key === 'cupGoals' ) {
				td.classList.add( 'tfsh-national-cup-column' );
			}
			if ( key === 'continentalApps' || key === 'continentalGoals' ) {
				td.classList.add( 'tfsh-continental-column' );
			}
			if ( key === 'otherApps' || key === 'otherGoals' ) {
				td.classList.add( 'tfsh-other-column' );
			}
			const input = document.createElement( 'input' );
			input.type = type;
			input.className = className;
			if ( type === 'checkbox' ) {
				input.checked = normalizeBoolean( data[ key ] );
			} else {
				input.value = cleanValue( data[ key ] );
			}
			if ( key === 'teamLink' && ( initialData.teamLinkAuto === undefined ?
				!cleanValue( input.value ) : normalizeBoolean( initialData.teamLinkAuto ) ) ) {
				input.dataset.tfshAutoTeamLink = '1';
				input.value = cleanValue( data.team.value );
			}
			if ( key === 'seasonLink' && !cleanValue( input.value ) ) {
				input.dataset.tfshAutoLink = '1';
			}
			if ( key === 'seasonLink' ) {
				input.addEventListener( 'input', () => {
					delete input.dataset.tfshAutoLink;
				} );
			}
			if ( key === 'season' ) {
				input.addEventListener( 'change', () => {
					fillNewClubInfoboxYear( tr );
					resequenceFirstSeason( tr );
				} );
			}
			if ( key === 'infoboxYear' ) {
				const markYearEdited = () => {
					tr.tfshInfoboxYearEdited = true;
					tr.tfshInfoboxYearPending = false;
				};
				input.addEventListener( 'input', markYearEdited );
				input.addEventListener( 'change', markYearEdited );
			}
			if ( key === 'teamLink' ) {
				input.addEventListener( 'input', () => propagateTeamLinkValue( tr ) );
				input.addEventListener( 'change', () => propagateTeamLinkValue( tr ) );
			}
			if ( key === 'infoboxOnly' ) {
				input.addEventListener( 'change', () => {
					updateUiGrouping();
					const selectionRow = { ...initialData };
					FIELD_KEYS.forEach( ( field ) => {
						selectionRow[ field ] = data[ field ].type === 'checkbox' ?
							data[ field ].checked : data[ field ].value;
					} );
					selectionRow.reserveAnnotation = data.reserveAnnotation;
					selectionRow.clubAnnotation = data.clubAnnotation;
					saveInfoboxOnlySelection( selectionRow, input.checked );
					if ( input.checked ) {
						data.leagueApps.value = '0';
						data.leagueGoals.value = '0';
						updateGoalInputState( data.leagueApps, data.leagueGoals, false );
					}
				} );
			}
			if ( !STAT_PAIRS.some( ( pair ) => pair.includes( key ) ) ) {
				input.addEventListener( 'input', refreshPreview );
				input.addEventListener( 'change', refreshPreview );
			}
			if ( key === 'leagueName' || key === 'localLeagueName' ) {
				input.addEventListener( 'focus', () => prepareLeagueNamePropagation( tr, key ) );
				input.addEventListener( 'input', () => propagateLeagueName( tr, key ) );
				input.addEventListener( 'blur', clearLeagueNamePropagation );
			}

			if ( key === 'team' ) {
				input.addEventListener( 'focus', () => prepareTeamNamePropagation( tr ) );
				input.addEventListener( 'input', () => propagateTeamName( tr ) );
				input.addEventListener( 'blur', clearTeamNamePropagation );
				td.className = 'tfsh-team-cell';
				const stack = document.createElement( 'div' );
				stack.className = 'tfsh-team-stack';
				stack.appendChild( input );

				const loanToggle = createLinkToggle( 'Loan', data.isLoan );
				stack.appendChild( loanToggle.label );
				data.isLoan = loanToggle.checkbox;

				addTeamLink = document.createElement( 'button' );
				addTeamLink.type = 'button';
				addTeamLink.className = 'tfsh-inline-link tfsh-add-team';
				addTeamLink.textContent = '+';
				addTeamLink.setAttribute( 'aria-label', 'Add club' );
				addTeamLink.title = 'Add club';
				addTeamLink.addEventListener( 'click', addTeamRow );
				stack.appendChild( addTeamLink );

				td.appendChild( stack );
			} else if ( key === 'teamLink' || key === 'seasonLink' ) {
				td.className = 'tfsh-link-cell';
				const row = document.createElement( 'div' );
				row.className = 'tfsh-link-row';
				row.appendChild( input );

				if ( key === 'teamLink' ) {
					const toggle = createLinkToggle( 'No link', data.disableTeamLink, () => {
						propagateTeamLinkPreference( tr, toggle.checkbox.checked );
						refreshPreview();
					} );
					row.appendChild( toggle.label );
					data.disableTeamLink = toggle.checkbox;
					input.disabled = toggle.checkbox.checked;
				} else {
					const toggle = createLinkToggle( 'No link', data.disableSeasonLink, () => {
						input.disabled = toggle.checkbox.checked;
						refreshPreview();
					} );
					row.appendChild( toggle.label );
					data.disableSeasonLink = toggle.checkbox;
					input.disabled = toggle.checkbox.checked;
				}

				td.appendChild( row );
			} else if ( key === 'season' ) {
				input.addEventListener( 'input', () => {
					tr.tfshOngoingSeasonStart = '';
				} );
				const stack = document.createElement( 'div' );
				stack.className = 'tfsh-season-stack';
				stack.appendChild( input );

				addSeasonLink = document.createElement( 'button' );
				addSeasonLink.type = 'button';
				addSeasonLink.className = 'tfsh-inline-link';
				addSeasonLink.textContent = '+';
				addSeasonLink.setAttribute( 'aria-label', 'Add season' );
				addSeasonLink.title = 'Add season';
				addSeasonLink.addEventListener( 'click', () => {
					addSeasonRow( tr );
				} );
				stack.appendChild( addSeasonLink );

				td.appendChild( stack );
			} else {
				td.appendChild( input );
			}

			if ( COMPETITION_NOTE_LABELS[ key ] ) {
				const stack = document.createElement( 'div' );
				stack.className = 'tfsh-match-stack';
				stack.appendChild( input );
				const noteButton = document.createElement( 'button' );
				noteButton.type = 'button';
				noteButton.className = 'tfsh-competition-note-btn';
				noteButton.textContent = 'N';
				tr.tfshCompetitionNoteButtons[ key ] = noteButton;
				noteButton.title = COMPETITION_NOTE_LABELS[ key ] + ' competition note';
				noteButton.setAttribute( 'aria-label', noteButton.title );
				noteButton.classList.toggle( 'has-note', Boolean( tr.tfshCompetitionNotes[ key ] ) );
				noteButton.addEventListener( 'click', ( event ) => editCompetitionNote( event, tr, key, noteButton ) );
				stack.appendChild( noteButton );
				td.appendChild( stack );
			}
			if ( key === 'infoboxOnly' ) {
				const label = document.createElement( 'label' );
				label.className = 'tfsh-link-toggle';
				label.title = 'Exclude this row from the season table while keeping it in the infobox';
				label.appendChild( document.createTextNode( 'Infobox only' ) );
				label.appendChild( input );
				cells.team.lastElementChild.insertBefore( label, addTeamLink );
			} else {
				tr.appendChild( td );
			}
			data[ key ] = input;
			cells[ key ] = key === 'infoboxOnly' ? cells.team : td;
		} );

		data.clubSpellId = tr.tfshClubSpellId;
		data.reserveAnnotation = cleanValue( initialData.reserveAnnotation );
		data.clubAnnotation = clubAnnotationText( initialData, true );
		data.clubPrefix = initialData.clubPrefix || '';
		const statPairs = [
			[ 'leagueApps', 'leagueGoals' ],
			[ 'localLeagueApps', 'localLeagueGoals' ],
			[ 'cupApps', 'cupGoals' ],
			[ 'leagueCupApps', 'leagueCupGoals' ],
			[ 'continentalApps', 'continentalGoals' ],
			[ 'otherApps', 'otherGoals' ]
		];
		statPairs.forEach( ( [ appsKey, goalsKey ] ) => {
			const appsInput = data[ appsKey ];
			const goalsInput = data[ goalsKey ];
			[ 'input', 'change' ].forEach( ( eventName ) => {
				appsInput.addEventListener( eventName, () => {
					updateGoalInputState( appsInput, goalsInput, true );
					refreshPreview();
				} );
				goalsInput.addEventListener( eventName, () => {
					updateGoalInputState( appsInput, goalsInput, false );
					refreshPreview();
				} );
			} );
			updateGoalInputState( appsInput, goalsInput, false );
		} );

		const removeTd = document.createElement( 'td' );
		removeTd.className = 'tfsh-remove-cell';
		const removeButton = document.createElement( 'button' );
		removeButton.type = 'button';
		removeButton.className = 'tfsh-remove';
		removeButton.textContent = '–';
		removeButton.title = 'Delete row';
		removeButton.setAttribute( 'aria-label', 'Delete row' );
		removeButton.addEventListener( 'click', () => removeSeasonRow( tr ) );
		removeTd.appendChild( removeButton );
		tr.appendChild( removeTd );

		tr.tfshData = { inputs: data, cells, removeCell: removeTd, addSeasonLink, addTeamLink };
		tbody.appendChild( tr );
	}

	function removeSeasonRow( tr ) {
		const rows = Array.from( tbody.querySelectorAll( 'tr' ) );
		if ( rows.length === 1 ) {
			// Build the replacement before removing the last editable row.
			createRow();
			tr.remove();
			refreshPreview();
			tbody.lastElementChild.tfshData.inputs.team.focus();
			return;
		}
		const index = rows.indexOf( tr );
		const previous = rows[ index - 1 ];
		const next = rows[ index + 1 ];
		const key = teamGroupKey( tr.tfshData.inputs );
		const exit = cleanValue( tr.tfshData.inputs.infoboxYear.value );
		if ( exit && previous && teamGroupKey( previous.tfshData.inputs ) === key &&
			( !next || teamGroupKey( next.tfshData.inputs ) !== key ) ) {
			const input = previous.tfshData.inputs.infoboxYear;
			const beforePrevious = rows[ index - 2 ];
			if ( !beforePrevious || teamGroupKey( beforePrevious.tfshData.inputs ) !== key ) {
				const entry = seasonBounds( cleanValue( input.value ) || previous.tfshData.inputs.season.value ).start;
				input.value = !entry || entry === exit ? exit : entry + ( /^[-–—−]$/.test( exit ) ? exit : '–' + exit );
			} else {
				input.value = exit;
			}
			previous.tfshInfoboxYearEdited = previous.tfshInfoboxYearEdited || tr.tfshInfoboxYearEdited;
		}
		tr.remove();
		refreshPreview();
	}

	function updateTeamLinkHints() {
		Array.from( tbody.querySelectorAll( 'tr' ) ).forEach( ( row ) => {
			const inputs = row.tfshData && row.tfshData.inputs;
			if ( inputs && inputs.teamLink.dataset.tfshAutoTeamLink === '1' && !inputs.disableTeamLink.checked ) {
				inputs.teamLink.value = cleanValue( inputs.team.value );
			}
		} );
	}

	function teamGroupKey( inputs ) {
		return JSON.stringify( [
			cleanValue( inputs.team.value ),
			cleanValue( inputs.teamLink.value ),
			inputs.isLoan.checked,
			inputs.disableTeamLink.checked,
			inputs.clubSpellId,
			Boolean( cleanValue( inputs.reserveAnnotation ) ),
			clubAnnotationText( inputs )
		] );
	}

	function updateUiGrouping() {
		const rows = Array.from( tbody.querySelectorAll( 'tr' ) );
		rows.forEach( ( tr ) => {
			const rowData = tr.tfshData;
			const teamCell = rowData && rowData.cells && rowData.cells.team;
			const linkCell = rowData && rowData.cells && rowData.cells.teamLink;
			const infoboxYearCell = rowData && rowData.cells && rowData.cells.infoboxYear;
			const seasonLink = rowData && rowData.addSeasonLink;
			const teamLink = rowData && rowData.addTeamLink;
			if ( teamCell ) {
				teamCell.style.display = '';
				teamCell.rowSpan = 1;
			}
			if ( linkCell ) {
				linkCell.style.display = '';
				linkCell.rowSpan = 1;
			}
			if ( infoboxYearCell ) {
				const input = rowData.inputs.infoboxYear;
				input.style.visibility = '';
				input.placeholder = 'Year';
				input.disabled = !infoboxYearEnabled;
			}
			if ( seasonLink ) {
				seasonLink.style.display = '';
			}
			if ( teamLink ) {
				teamLink.style.display = 'none';
			}
		} );

		for ( let i = 0; i < rows.length; i += 1 ) {
			const current = rows[ i ];
			const currentInputs = current.tfshData.inputs;
			const key = teamGroupKey( currentInputs );

			let span = 1;
			for ( let j = i + 1; j < rows.length; j += 1 ) {
				const next = rows[ j ];
				const nextInputs = next.tfshData.inputs;
				const nextKey = teamGroupKey( nextInputs );
				if ( nextKey !== key ) {
					break;
				}
				span += 1;
			}

			if ( span > 1 ) {
				currentInputs.infoboxYear.placeholder = 'Start';
				const lastInputs = rows[ i + span - 1 ].tfshData.inputs;
				lastInputs.infoboxYear.placeholder = 'End';
				for ( let j = i + 1; j < i + span; j += 1 ) {
					if ( rows[ j - 1 ].tfshData.addSeasonLink ) {
						rows[ j - 1 ].tfshData.addSeasonLink.style.display = 'none';
					}
				}
				for ( let j = i + 1; j < i + span - 1; j += 1 ) {
					const middleInput = rows[ j ].tfshData.inputs.infoboxYear;
					middleInput.style.visibility = 'hidden';
					middleInput.disabled = true;
				}
				// Expose every season's checkbox as soon as any season is excluded.
				// Infobox years still belong to the original, uninterrupted spell.
				const hasInfoboxOnly = rows.slice( i, i + span ).some(
					( row ) => row.tfshData.inputs.infoboxOnly.checked
				);
				if ( !hasInfoboxOnly ) {
					for ( const field of [ 'team', 'teamLink' ] ) {
						current.tfshData.cells[ field ].rowSpan = span;
						for ( let j = i + 1; j < i + span; j += 1 ) {
							rows[ j ].tfshData.cells[ field ].style.display = 'none';
						}
					}
				}
				i += span - 1;
			}
		}

		for ( let i = rows.length - 1; i >= 0; i -= 1 ) {
			const row = rows[ i ];
			if ( row.tfshData && row.tfshData.cells && row.tfshData.cells.team.style.display !== 'none' && row.tfshData.addTeamLink ) {
				row.tfshData.addTeamLink.style.display = '';
				break;
			}
		}
	}

	function updateLeagueCupVisibility() {
		updateOptionalCompetitionVisibility( 'tfsh-league-cup-column', 'tfsh-league-cup-heading', leagueCupEnabled, 'League cup' );
	}

	function toggleLeagueCup() {
		leagueCupEnabled = !leagueCupEnabled;
		saveColumnStates();
		updateLeagueCupVisibility();
		refreshPreview();
	}

	function updateLocalLeagueVisibility() {
		updateOptionalCompetitionVisibility( 'tfsh-local-league-column', 'tfsh-local-league-heading', localLeagueEnabled, 'Local league' );
	}

	function updateInfoboxYearVisibility() {
		updateOptionalCompetitionVisibility(
			'tfsh-infobox-year-column',
			'tfsh-infobox-year-heading',
			infoboxYearEnabled,
			'Infobox year'
		);
	}

	function toggleLocalLeague() {
		localLeagueEnabled = !localLeagueEnabled;
		saveColumnStates();
		updateLocalLeagueVisibility();
		refreshPreview();
	}

	function updateOptionalCompetitionVisibility( columnClass, headingClass, enabled, label ) {
		if ( !backdrop ) {
			return;
		}
		Array.from( backdrop.querySelectorAll( `.${ columnClass }` ) ).forEach( ( element ) => {
			element.classList.toggle( 'tfsh-column-disabled', !enabled );
			Array.from( element.querySelectorAll( 'input, .tfsh-competition-note-btn' ) ).forEach( ( input ) => {
				input.disabled = !enabled && !input.classList.contains( 'tfsh-column-guide-btn' );
			} );
		} );
		const heading = backdrop.querySelector( `.${ headingClass }` );
		if ( heading ) {
			heading.setAttribute( 'aria-pressed', enabled ? 'true' : 'false' );
			heading.title = `${ enabled ? 'Disable' : 'Enable' } the ${ label } column`;
		}
	}

	function updateOptionalCompetitionColumns() {
		updateOptionalCompetitionVisibility( 'tfsh-national-cup-column', 'tfsh-national-cup-heading', nationalCupEnabled, 'National cup' );
		updateOptionalCompetitionVisibility( 'tfsh-continental-column', 'tfsh-continental-heading', continentalEnabled, 'Continental' );
		updateOptionalCompetitionVisibility( 'tfsh-other-column', 'tfsh-other-heading', otherEnabled, 'Other' );
	}

	function toggleNationalCup() {
		nationalCupEnabled = !nationalCupEnabled;
		saveColumnStates();
		updateOptionalCompetitionColumns();
		refreshPreview();
	}

	function toggleContinental() {
		continentalEnabled = !continentalEnabled;
		saveColumnStates();
		updateOptionalCompetitionColumns();
		refreshPreview();
	}

	function toggleOther() {
		otherEnabled = !otherEnabled;
		saveColumnStates();
		updateOptionalCompetitionColumns();
		refreshPreview();
	}

	function resetDefaultOptionalCompetitionColumns() {
		infoboxYearEnabled = true;
		nationalCupEnabled = true;
		continentalEnabled = true;
		otherEnabled = true;
	}

	function matchingTeamRows( sourceTr ) {
		const sourceInputs = sourceTr && sourceTr.tfshData && sourceTr.tfshData.inputs;
		const team = cleanValue( sourceInputs && sourceInputs.team && sourceInputs.team.value );
		if ( !team ) {
			return [];
		}

		const sourceKey = teamGroupKey( sourceInputs );

		return Array.from( tbody.querySelectorAll( 'tr' ) ).filter( ( row ) => {
			if ( row === sourceTr || !row.tfshData ) {
				return false;
			}
			const inputs = row.tfshData.inputs;
			return teamGroupKey( inputs ) === sourceKey;
		} );
	}

	function prepareTeamNamePropagation( sourceTr ) {
		clearTeamNamePropagation();
		matchingTeamRows( sourceTr ).forEach( ( row ) => {
			row.tfshData.inputs.team.dataset.tfshTeamSync = '1';
		} );
	}

	function clearTeamNamePropagation() {
		if ( !tbody ) {
			return;
		}
		Array.from( tbody.querySelectorAll( '[data-tfsh-team-sync="1"]' ) ).forEach( ( input ) => {
			delete input.dataset.tfshTeamSync;
		} );
	}

	function propagateTeamName( sourceTr ) {
		const sourceInput = sourceTr && sourceTr.tfshData && sourceTr.tfshData.inputs.team;
		if ( !sourceInput ) {
			return;
		}

		let changed = false;
		Array.from( tbody.querySelectorAll( '[data-tfsh-team-sync="1"]' ) ).forEach( ( input ) => {
			if ( input.value !== sourceInput.value ) {
				input.value = sourceInput.value;
				changed = true;
			}
		} );

		if ( changed ) {
			refreshPreview();
		}
	}

	function prepareLeagueNamePropagation( sourceTr, fieldKey = 'leagueName' ) {
		clearLeagueNamePropagation();
		const teamRows = matchingTeamRows( sourceTr );
		if ( teamRows.some( ( row ) => row.tfshData.inputs[ fieldKey ].dataset.tfshLeaguePropagationDone === '1' ) ) {
			return;
		}
		teamRows.forEach( ( row ) => {
			const input = row.tfshData.inputs[ fieldKey ];
			if ( !cleanValue( input.value ) ) {
				input.dataset.tfshLeagueSync = '1';
			}
		} );
	}

	function clearLeagueNamePropagation() {
		if ( !tbody ) {
			return;
		}
		Array.from( tbody.querySelectorAll( '[data-tfsh-league-sync="1"]' ) ).forEach( ( input ) => {
			delete input.dataset.tfshLeagueSync;
		} );
	}

	function propagateLeagueName( sourceTr, fieldKey = 'leagueName' ) {
		const inputs = sourceTr && sourceTr.tfshData && sourceTr.tfshData.inputs;
		const field = inputs && inputs[ fieldKey ];
		const leagueName = ( field && field.value ) || '';

		let changed = false;
		matchingTeamRows( sourceTr ).forEach( ( row ) => {
			const input = row.tfshData.inputs[ fieldKey ];
			if ( input.dataset.tfshLeagueSync === '1' && input.value !== leagueName ) {
				input.value = leagueName;
				changed = true;
			}
		} );

		if ( changed ) {
			matchingTeamRows( sourceTr ).forEach( ( row ) => {
				row.tfshData.inputs[ fieldKey ].dataset.tfshLeaguePropagationDone = '1';
			} );
			refreshPreview();
		}
	}

	function markLoadedLeagueNamesAsPropagated() {
		[ 'leagueName', 'localLeagueName' ].forEach( ( fieldKey ) => {
			Array.from( tbody.querySelectorAll( 'tr' ) ).forEach( ( row ) => {
				const input = row.tfshData && row.tfshData.inputs[ fieldKey ];
				if ( !input || !cleanValue( input.value ) ) {
					return;
				}
				matchingTeamRows( row ).forEach( ( teamRow ) => {
					teamRow.tfshData.inputs[ fieldKey ].dataset.tfshLeaguePropagationDone = '1';
				} );
			} );
		} );
	}

	function lastRowData() {
		const rows = getRowsFromUI();
		return rows.length ? rows[ rows.length - 1 ] : null;
	}

	function addTeamRow() {
		createRow();
		refreshPreview();
	}

	function nextSeasonValue( value ) {
		const season = cleanValue( value );
		if ( /^\d{4}$/.test( season ) ) {
			return String( Number( season ) + 1 );
		}
		const match = season.match( /\b(\d{4})(\s*[-–—]\s*)?(?:\d{2,4})?\b/ );
		if ( !match ) {
			return '';
		}

		const nextStart = Number( match[ 1 ] ) + 1;
		const nextEnd = String( nextStart + 1 );
		const separator = match[ 2 ] || '-';
		return formatSeasonRange( String( nextStart ), nextEnd, separator );
	}

	function fillNewClubInfoboxYear( tr ) {
		if ( !tr.tfshInfoboxYearPending ) {
			return;
		}
		const inputs = tr.tfshData.inputs;
		if ( tr.tfshInfoboxYearEdited || cleanValue( inputs.infoboxYear.value ) ||
			cleanValue( tr.tfshInfoboxOriginalSeason ) ) {
			tr.tfshInfoboxYearPending = false;
			return;
		}
		const bounds = seasonSequenceBounds( inputs.season.value );
		if ( !bounds ) {
			return;
		}
		inputs.infoboxYear.value = bounds.start === bounds.end ?
			bounds.start : bounds.start + '\u2013' + bounds.end;
		tr.tfshInfoboxYearPending = false;
	}

	function seasonSequenceBounds( value ) {
		const season = cleanValue( value );
		if ( /^\d{4}$/.test( season ) ) {
			return seasonBounds( season );
		}
		if ( !/^\d{4}\s*[-–—]\s*(?:\d{2}|\d{4})$/.test( season ) ) {
			return null;
		}
		const bounds = seasonBounds( season );
		return Number( bounds.end ) === Number( bounds.start ) + 1 ? bounds : null;
	}

	function resequenceFirstSeason( sourceTr ) {
		const inputs = sourceTr.tfshData.inputs;
		const value = cleanValue( inputs.season.value );
		const current = seasonSequenceBounds( value );
		if ( !current ) {
			return;
		}
		const previous = seasonSequenceBounds( sourceTr.tfshPreviousSeason );
		sourceTr.tfshPreviousSeason = value;
		if ( !previous || ( previous.start === current.start && previous.end === current.end ) ) {
			return;
		}
		const rows = Array.from( tbody.querySelectorAll( 'tr' ) );
		const index = rows.indexOf( sourceTr );
		const key = teamGroupKey( inputs );
		if ( index === -1 || ( index > 0 && teamGroupKey( rows[ index - 1 ].tfshData.inputs ) === key ) ) {
			return;
		}
		const peers = [ sourceTr ];
		for ( let i = index + 1; i < rows.length && teamGroupKey( rows[ i ].tfshData.inputs ) === key; i++ ) {
			peers.push( rows[ i ] );
		}
		if ( peers.some( ( tr ) => tr.tfshSeasonSequenceHandled ) ) {
			return;
		}
		peers.forEach( ( tr ) => {
			tr.tfshSeasonSequenceHandled = true;
		} );
		const consecutive = peers.slice( 1 ).every( ( tr, offset ) => {
			const bounds = seasonSequenceBounds( tr.tfshData.inputs.season.value );
			return bounds && Number( bounds.start ) === Number( previous.start ) + offset + 1 &&
				Number( bounds.end ) === Number( previous.end ) + offset + 1;
		} );
		if ( !consecutive ) {
			return;
		}
		let season = value;
		peers.slice( 1 ).forEach( ( tr ) => {
			season = nextSeasonValue( season );
			tr.tfshData.inputs.season.value = season;
			tr.tfshPreviousSeason = season;
			tr.tfshOngoingSeasonStart = '';
		} );
	}

	function buildSeasonRowSeed( row ) {
		const base = row || lastRowData();
		if ( !base ) {
			return null;
		}

		return {
			team: base.team,
			teamLink: base.teamLink,
			teamLinkAuto: base.teamLinkAuto,
			isLoan: base.isLoan,
			reserveAnnotation: base.reserveAnnotation,
			isGuest: base.isGuest,
			clubAnnotation: base.clubAnnotation,
			clubPrefix: base.clubPrefix,
			disableTeamLink: base.disableTeamLink,
			season: nextSeasonValue( base.season ),
			seasonSequenceHandled: base.seasonSequenceHandled,
			clubSpellId: base.clubSpellId,
			seasonLink: '',
			disableSeasonLink: false,
			leagueName: base.leagueName,
			leagueApps: '',
			leagueGoals: '',
			localLeagueName: base.localLeagueName,
			localLeagueApps: '',
			localLeagueGoals: '',
			cupApps: '',
			cupGoals: '',
			leagueCupApps: '',
			leagueCupGoals: '',
			continentalApps: '',
			continentalGoals: '',
			otherApps: '',
			otherGoals: ''
		};
	}

	function addSeasonRow( afterTr = null ) {
		updateTeamLinkHints();
		const sourceTr = afterTr || tbody.lastElementChild;
		const seed = buildSeasonRowSeed(
			afterTr ?
				Object.fromEntries(
					FIELD_KEYS.map( ( key ) => {
						const input = afterTr.tfshData.inputs[ key ];
						return [ key, input.type === 'checkbox' ? input.checked : cleanValue( input.value ) ];
					} )
				) :
				null
		);

		if ( !seed ) {
			addTeamRow();
			return;
		}

		if ( afterTr ) {
			seed.clubSpellId = afterTr.tfshClubSpellId;
		}
		if ( sourceTr ) {
			seed.seasonSequenceHandled = sourceTr.tfshSeasonSequenceHandled;
			seed.reserveAnnotation = sourceTr.tfshData.inputs.reserveAnnotation;
			seed.clubAnnotation = sourceTr.tfshData.inputs.clubAnnotation;
			seed.clubPrefix = sourceTr.tfshData.inputs.clubPrefix;
			seed.isGuest = sourceTr.tfshIsGuest;
			seed.competitionNotePropagationDone = { ...sourceTr.tfshCompetitionNotePropagationDone };
			seed.teamLinkAuto = sourceTr.tfshData.inputs.teamLink.dataset.tfshAutoTeamLink === '1';
			const peers = Array.from( tbody.querySelectorAll( 'tr' ) ).filter( ( tr ) => (
				teamGroupKey( tr.tfshData.inputs ) === teamGroupKey( sourceTr.tfshData.inputs )
			) );
			if ( peers[ peers.length - 1 ] === sourceTr ) {
				const exitInput = sourceTr.tfshData.inputs.infoboxYear;
				const exitYear = cleanValue( exitInput.value );
				if ( peers.length > 1 ) {
					seed.infoboxYear = exitYear;
					exitInput.value = '';
				} else if ( exitYear ) {
					const range = exitYear.match( /^(\d{4})\s*[-–—−]\s*(\d{4})?$/ );
					seed.infoboxYear = range ? ( range[ 2 ] || '\u2013' ) : normalizeYearDashes( exitYear );
					if ( range ) {
						exitInput.value = range[ 1 ];
					}
				}
			}
		}
		createRow( seed );
		const newRow = tbody.lastElementChild;
		if ( afterTr && newRow && afterTr.nextSibling ) {
			tbody.insertBefore( newRow, afterTr.nextSibling );
		}
		refreshPreview();
	}

	function getRowsFromUI() {
		updateTeamLinkHints();
		return Array.from( tbody.querySelectorAll( 'tr' ) )
			.map( ( tr ) => {
				const row = {};
				FIELD_KEYS.forEach( ( key ) => {
					const input = tr.tfshData.inputs[ key ];
					row[ key ] = input.type === 'checkbox' ?
						input.checked :
						key === 'seasonLink' && input.dataset.tfshAutoLink === '1' ?
							'' :
							cleanValue( input.value );
				} );
				row.teamLinkAuto = tr.tfshData.inputs.teamLink.dataset.tfshAutoTeamLink === '1';
				row.seasonSequenceHandled = Boolean( tr.tfshSeasonSequenceHandled );
				row.infoboxYear = cleanValue( tr.tfshData.inputs.infoboxYear.value );
				row.infoboxYearEdited = Boolean( tr.tfshInfoboxYearEdited );
				row.infoboxYearPending = Boolean( tr.tfshInfoboxYearPending );
				row.ongoingSeasonStart = tr.tfshOngoingSeasonStart || '';
				row.infoboxSourceIndex = tr.tfshInfoboxSourceIndex;
				row.clubSpellId = tr.tfshClubSpellId;
				row.infoboxOriginalSeason = tr.tfshInfoboxOriginalSeason || '';
				row.infoboxStatRefs = tr.tfshInfoboxStatRefs || {};
				row.tableCellRefs = { ...tr.tfshTableCellRefs };
				updateCompetitionNoteValidity( tr );
				row.competitionNotes = { ...tr.tfshCompetitionNotes };
				row.competitionNotePropagationDone = { ...tr.tfshCompetitionNotePropagationDone };
				row.infoboxRefs = tr.tfshInfoboxRefs || {};
				row.isGuest = tr.tfshIsGuest;
				row.reserveAnnotation = tr.tfshData.inputs.reserveAnnotation;
				row.clubAnnotation = tr.tfshData.inputs.clubAnnotation;
				row.clubPrefix = tr.tfshData.inputs.clubPrefix;
				return row;
			} )
			.filter( ( row ) => row.team || row.season );
	}

	function updateInfoboxOnlyFields() {
		Array.from( tbody.querySelectorAll( 'tr' ) ).forEach( ( row ) => {
			const { inputs, cells } = row.tfshData;
			const infoboxOnly = inputs.infoboxOnly.checked;
			const keys = FIELD_KEYS.slice( FIELD_KEYS.indexOf( 'seasonLink' ) );
			keys.forEach( ( key ) => {
				if ( !cells[ key ] ) {
					return;
				}
				const leagueStat = key === 'leagueApps' || key === 'leagueGoals';
				cells[ key ].classList.toggle( 'tfsh-infobox-only-disabled', infoboxOnly && !leagueStat );
				const disabled = !leagueStat && ( infoboxOnly ||
					cells[ key ].classList.contains( 'tfsh-column-disabled' ) );
				Array.from( cells[ key ].querySelectorAll( 'input, button' ) ).forEach( ( control ) => {
					control.disabled = disabled || ( key === 'seasonLink' &&
						control === inputs.seasonLink && inputs.disableSeasonLink.checked );
				} );
			} );
		} );
	}

	function updateSeasonLinkHints() {
		Array.from( tbody.querySelectorAll( 'tr' ) ).forEach( ( row ) => {
			const inputs = row.tfshData && row.tfshData.inputs;
			if ( !inputs ) {
				return;
			}
			const generatedTarget = defaultSeasonTarget( {
				team: inputs.team.value,
				teamLink: inputs.teamLink.value,
				season: inputs.season.value
			} );
			inputs.seasonLink.disabled = inputs.disableSeasonLink.checked;
			if ( inputs.seasonLink.disabled ) {
				return;
			}
			if ( inputs.seasonLink.dataset.tfshAutoLink === '1' || !cleanValue( inputs.seasonLink.value ) ) {
				inputs.seasonLink.value = generatedTarget;
				inputs.seasonLink.dataset.tfshAutoLink = '1';
			}
			inputs.seasonLink.placeholder = generatedTarget;
		} );
	}

	function updateLeagueNameValidity() {
		Array.from( tbody.querySelectorAll( 'tr' ) ).forEach( ( row ) => {
			const inputs = row.tfshData && row.tfshData.inputs;
			if ( !inputs ) {
				return;
			}
			const activeRow = cleanValue( inputs.team.value ) || cleanValue( inputs.season.value );
			inputs.leagueName.classList.toggle(
				'tfsh-invalid',
				Boolean( activeRow && !inputs.infoboxOnly.checked &&
					!cleanValue( inputs.leagueName.value ) )
			);
		} );
	}

	function handleTableKeyboardNavigation( event ) {
		if ( event.key !== 'Enter' || event.isComposing ) {
			return;
		}
		const currentInput = event.target.closest( 'input[type="text"]' );
		if ( !currentInput || !tbody.contains( currentInput ) ) {
			return;
		}

		const visibleInputs = Array.from( tbody.querySelectorAll( 'input[type="text"]' ) )
			.filter( ( input ) => input.getClientRects().length > 0 && !input.disabled );
		const currentIndex = visibleInputs.indexOf( currentInput );
		const nextIndex = currentIndex + ( event.shiftKey ? -1 : 1 );
		const nextInput = visibleInputs[ nextIndex ];
		if ( !nextInput ) {
			return;
		}

		event.preventDefault();
		nextInput.focus();
		nextInput.select();
	}

	function refreshPreview() {
		const rows = getRowsFromUI();
		syncUpdateDate( rowsHaveOpenEndedClubYear( rows ) );
		mw.storage.set( getRowsStorageKey(), JSON.stringify( rows ) );
		mw.storage.set( getOtherNoteStorageKey(), otherNote );
		mw.storage.set( getOtherColumnStorageKey(), otherEnabled ? '1' : '0' );
		updateSeasonLinkHints();
		updateLeagueNameValidity();
		updateLeagueCupVisibility();
		updateLocalLeagueVisibility();
		updateInfoboxYearVisibility();
		updateOptionalCompetitionColumns();
		updateInfoboxOnlyFields();
		updateUiGrouping();
	}

	function initializeColumnGuides() {
		const guides = [
			[ 'Club', 'The club name displayed in the infobox and statistics table.\n\n* The display name is filled in from the infobox when available.\n* Select "Loan" if the player was on loan at the club.\n* Select "Infobox only" to keep the club in the infobox without including it in the statistics table.' ],
			[ 'Club link', 'The title of the club’s Wikipedia article.\n\n* The link is filled in from the infobox when available.\n* Redirect links are resolved automatically.' ],
			[ 'Season', 'The season to which the statistics apply.\n\n* The value is filled in from the infobox years when available.\n* Use the + button in the club’s season group to add a season.' ],
			[ 'Infobox year', 'Enter how the player’s arrival and departure years should appear in the infobox.\n\n* For a single year, enter that year.\n* For a two-year period, enter the start and end years separated by an en dash (–).\n* For multiple seasons, enter the start year in the first row and the end year in the last row.\n* Use an en dash (–) for an ongoing spell at the club.' ],
			[ 'Season link', 'Enter the title of the club’s season article.\n\n* Select "No link" if the season should not link to an article.' ],
			[ 'League', 'The main league in which the player competed during the season.\n\n* Entering a league name fills it in for all seasons at the same club. Adjust it where the club played in a different league.\n* The season value is used to create a link to that league season.\n* Use the league name that applied during that season.\n* If the league season differs from the Season column, put the season before the league name.\n* Enter the player’s league appearances and goals.\n* Enter appearances and goals as follows:\n  * The club participated but the player did not appear: 0\n  * The number of appearances or goals is unknown: ?\n  * The competition was not held or the club did not participate: Leave blank' ],
			[ 'Local league', 'The local league in which the player competed during the season.\n\n* Use this only when the player appeared in both local and national leagues during the same season.\n* Entering a league name fills it in for all seasons at the same club. Adjust it where the club played in a different league.\n* The season value is used to create a link to that league season.\n* Use the league name that applied during that season.\n* If the league season differs from the Season column, put the season before the league name.\n* Enter the player’s league appearances and goals.\n* Enter appearances and goals as follows:\n  * The club participated but the player did not appear: 0\n  * The number of appearances or goals is unknown: ?\n  * The competition was not held or the club did not participate: Leave blank' ],
			[ 'National cup', 'Statistics for the player’s national cup during the season.\n\n* Click the heading to disable this column if no relevant competition applies to any of the player’s seasons.\n* Enter the player’s appearances and goals in these competitions.\n* Enter appearances and goals as follows:\n  * The club participated but the player did not appear: 0\n  * The number of appearances or goals is unknown: ?\n  * The competition was not held or the club did not participate: Leave blank\n* Click "N" and enter the competitions covered by these statistics.' ],
			[ 'League cup', 'Statistics for the player’s league cup during the season.\n\n* Click the heading to disable this column if no relevant competition applies to any of the player’s seasons.\n* Enter the player’s appearances and goals in these competitions.\n* Enter appearances and goals as follows:\n  * The club participated but the player did not appear: 0\n  * The number of appearances or goals is unknown: ?\n  * The competition was not held or the club did not participate: Leave blank\n* Click "N" and enter the competitions covered by these statistics.' ],
			[ 'Continental', 'Statistics for the player’s continental competitions during the season.\n\n* Click the heading to disable this column if no relevant competition applies to any of the player’s seasons.\n* Enter the player’s appearances and goals in these competitions.\n* Enter appearances and goals as follows:\n  * The club participated but the player did not appear: 0\n  * The number of appearances or goals is unknown: ?\n  * The competition was not held or the club did not participate: Leave blank\n* Click "N" and enter the competitions covered by these statistics.' ],
			[ 'Other', 'Statistics for the player’s competitions not covered by the other columns during the season.\n\n* Click the heading to disable this column if no relevant competition applies to any of the player’s seasons.\n* Enter the player’s appearances and goals in these competitions.\n* Enter appearances and goals as follows:\n  * The club participated but the player did not appear: 0\n  * The number of appearances or goals is unknown: ?\n  * The competition was not held or the club did not participate: Leave blank\n* Click "N" and enter the competitions covered by these statistics.' ]
		];
		const guideBackdrop = document.createElement( 'div' );
		guideBackdrop.className = 'tfsh-note-dialog-backdrop tfsh-column-guide-backdrop';
		const content = document.createElement( 'div' );
		content.className = 'tfsh-note-dialog-content';
		const description = document.createElement( 'div' );
		description.className = 'tfsh-column-guide-description';
		content.appendChild( description );
		guideBackdrop.appendChild( content );
		backdrop.appendChild( guideBackdrop );
		let opener = null;
		const dialog = jQuery( content ).dialog( {
			autoOpen: false,
			width: 500,
			resizable: false,
			closeText: 'Close',
			position: { my: 'top', at: 'top+50', of: window },
			close: () => {
				guideBackdrop.classList.remove( 'is-open' );
				if ( opener && opener.isConnected ) {
					opener.focus();
				}
				opener = null;
			}
		} );
		const widget = dialog.dialog( 'widget' ).addClass( 'tfsh-note-dialog' );
		widget.appendTo( guideBackdrop );
		widget.find( '.ui-dialog-title' ).attr( 'id', 'tfsh-column-guide-title' );
		widget.attr( 'aria-labelledby', 'tfsh-column-guide-title' ).attr( 'aria-modal', 'true' );
		widget.find( '.ui-dialog-titlebar-close' ).addClass( 'tfsh-note-close' );
		widget.on( 'keydown', ( event ) => {
			if ( event.key === 'Escape' ) {
				event.stopPropagation();
			}
		} );
		guideBackdrop.addEventListener( 'click', ( event ) => {
			if ( event.target === guideBackdrop ) {
				dialog.dialog( 'close' );
			}
		} );
		const headings = backdrop.querySelectorAll( '.tfsh-table thead tr:first-child th' );
		guides.forEach( ( [ title, text ], index ) => {
			const button = document.createElement( 'button' );
			button.type = 'button';
			button.className = 'tfsh-competition-note-btn tfsh-column-guide-btn';
			button.textContent = '?';
			button.title = title + ' user guide';
			button.setAttribute( 'aria-label', button.title );
			button.setAttribute( 'aria-haspopup', 'dialog' );
			button.addEventListener( 'click', ( event ) => {
				event.preventDefault();
				event.stopPropagation();
				opener = button;
				description.textContent = '';
				const guideText = document.createElement( 'div' );
				guideText.className = 'tfsh-column-guide-text';
				const [ introduction, ...items ] = text.split( /\n+\* / );
				const paragraph = document.createElement( 'p' );
				paragraph.textContent = introduction;
				guideText.appendChild( paragraph );
				if ( items.length ) {
					const list = document.createElement( 'ul' );
					items.forEach( ( item ) => {
						const listItem = document.createElement( 'li' );
						const [ itemText, ...subitems ] = item.split( /\n {2}\* / );
						listItem.textContent = itemText;
						if ( subitems.length ) {
							const sublist = document.createElement( 'ul' );
							subitems.forEach( ( subitem ) => {
								const sublistItem = document.createElement( 'li' );
								sublistItem.textContent = subitem;
								sublist.appendChild( sublistItem );
							} );
							listItem.appendChild( sublist );
						}
						list.appendChild( listItem );
					} );
					guideText.appendChild( list );
				}
				description.appendChild( guideText );
				guideBackdrop.classList.add( 'is-open' );
				dialog.dialog( 'option', 'title', title ).dialog( 'open' );
			} );
			button.addEventListener( 'keydown', ( event ) => {
				if ( event.key === 'Enter' || event.key === ' ' ) {
					event.stopPropagation();
				}
			} );
			headings[ index ].appendChild( button );
		} );
	}

	function closeCompetitionNoteDialog() {
		const content = backdrop && backdrop.querySelector( '.tfsh-note-dialog-content' );
		if ( content ) {
			jQuery( content ).dialog( 'close' );
		}
	}

	function editCompetitionNote( event, row, key, button ) {
		if ( button.disabled ) {
			return;
		}
		if ( event ) {
			event.preventDefault();
			event.stopPropagation();
		}
		const dialogBackdrop = backdrop.querySelector( '.tfsh-note-dialog-backdrop' );
		const content = dialogBackdrop.querySelector( '.tfsh-note-dialog-content' );
		activeNoteEditor = { row, key, button, entries: [], originalNote: row.tfshCompetitionNotes[ key ] || '' };
		backdrop.querySelector( '.tfsh-note-entries' ).textContent = '';
		parseCompetitionEntries( activeNoteEditor.originalNote ).forEach( addCompetitionEntry );
		activeNoteEditor.originalEntries = JSON.stringify( readCompetitionEntries() );
		const title = [ cleanValue( row.tfshData.inputs.season.value ), COMPETITION_NOTE_LABELS[ key ].toLocaleLowerCase( 'en-GB' ), 'note' ].filter( Boolean ).join( ' ' );
		dialogBackdrop.classList.add( 'is-open' );
		jQuery( content ).dialog( 'option', 'title', title ).dialog( 'open' );
		activeNoteEditor.entries[ 0 ].name.focus();
		activeNoteEditor.entries[ 0 ].name.select();
	}

	function setCompetitionNoteValue( row, key, note ) {
		if ( note ) {
			row.tfshCompetitionNotes[ key ] = note;
		} else {
			delete row.tfshCompetitionNotes[ key ];
		}
		const button = row.tfshCompetitionNoteButtons[ key ];
		if ( button ) {
			button.classList.toggle( 'has-note', Boolean( note ) );
		}
	}

	function updateCompetitionNoteValidity( row ) {
		STAT_PAIRS.forEach( ( [ appsKey, goalsKey ] ) => {
			if ( !COMPETITION_NOTE_LABELS[ appsKey ] ) {
				return;
			}
			const inputs = row.tfshData.inputs;
			const hasNote = Boolean( cleanValue( row.tfshCompetitionNotes[ appsKey ] ) );
			[ appsKey, goalsKey ].forEach( ( key ) => {
				inputs[ key ].classList.toggle( 'tfsh-invalid', hasNote && !cleanValue( inputs[ key ].value ) );
			} );
		} );
	}

	function saveCompetitionNote() {
		if ( !activeNoteEditor || !validateCompetitionEntries() ) {
			return;
		}
		const { row, key } = activeNoteEditor;
		const entries = readCompetitionEntries();
		const note = JSON.stringify( entries ) === activeNoteEditor.originalEntries ?
			activeNoteEditor.originalNote : formatCompetitionEntries( entries );
		const teamRows = [ row, ...matchingTeamRows( row ) ];
		const firstEntry = Boolean( note ) && !teamRows.some( ( candidate ) => (
			candidate.tfshCompetitionNotePropagationDone[ key ] ||
			cleanValue( candidate.tfshCompetitionNotes[ key ] )
		) );
		if ( firstEntry ) {
			const orderedRows = Array.from( tbody.querySelectorAll( 'tr' ) );
			orderedRows.slice( orderedRows.indexOf( row ) ).filter( ( candidate ) => teamRows.includes( candidate ) )
				.forEach( ( candidate ) => {
					candidate.tfshCompetitionNotePropagationDone[ key ] = true;
					setCompetitionNoteValue( candidate, key, note );
				} );
		} else {
			setCompetitionNoteValue( row, key, note );
		}
		closeCompetitionNoteDialog();
		refreshPreview();
	}

	function clearUiRows() {
		tbody.innerHTML = '';
	}

	async function loadSavedRows( sourceOverride ) {
		// Open each article with the default column visibility.
		resetDefaultOptionalCompetitionColumns();

		try {
			const source = typeof sourceOverride === 'string' ?
				sourceOverride : await getInitialSourceForForm();
			nationalTeamCareerEnabled = hasNationalTeamCareerData( source );
			managerCareerEnabled = hasManagerCareerData( source );
			await initializeUpdateDate( source );
			const parsedCareer = parseRowsFromCareerSection( source );
			const parsedColumnStates = {
				infoboxYear: infoboxYearEnabled,
				nationalCup: nationalCupEnabled,
				localLeague: localLeagueEnabled,
				leagueCup: leagueCupEnabled,
				continental: continentalEnabled,
				other: otherEnabled
			};
			// Restore the default visibility after parsing.
			resetDefaultOptionalCompetitionColumns();
			if ( Object.keys( getSavedColumnStates() ).length ) {
				applySavedColumnStates();
			} else {
				infoboxYearEnabled = parsedColumnStates.infoboxYear;
				nationalCupEnabled = parsedColumnStates.nationalCup;
				localLeagueEnabled = parsedColumnStates.localLeague;
				leagueCupEnabled = parsedColumnStates.leagueCup;
				otherEnabled = parsedColumnStates.other;
			}
			// Published table columns are shared by all editors; local preferences
			// must not override them. Without a recognized table, use the defaults.
			continentalEnabled = parsedCareer.hasTable ? parsedColumnStates.continental : true;
			otherEnabled = parsedCareer.hasTable ? parsedColumnStates.other : true;
			if ( parsedCareer.rows.length ) {
				clearUiRows();
				otherNote = parsedCareer.otherNote;
				addInfoboxYearsToTableRows( parsedCareer.rows, source ).forEach(
					( row ) => createRow( row )
				);
				markLoadedLeagueNamesAsPropagated();
				refreshPreview();
				await resolveLoadedTeamRedirects();
				return;
			}

			const infoboxRows = parseRowsFromInfobox( source );
			if ( infoboxRows.length ) {
				clearUiRows();
				otherNote = '';
				infoboxRows.forEach( ( row ) => createRow( row ) );
				markLoadedLeagueNamesAsPropagated();
				refreshPreview();
				await resolveLoadedTeamRedirects();
				return;
			}
		} catch ( error ) {
			mw.log.warn( 'Could not parse the article content:', error );
			if ( typeof sourceOverride === 'string' ) {
				throw error;
			}
		}

		try {
			const saved = JSON.parse( mw.storage.get( getRowsStorageKey() ) || '[]' );
			otherNote = cleanValue( mw.storage.get( getOtherNoteStorageKey() ) || '' );
			applySavedColumnStates();
			continentalEnabled = true;
			otherEnabled = true;
			if ( Array.isArray( saved ) && saved.length ) {
				clearUiRows();
				saved.forEach( ( row ) => createRow( row ) );
				markLoadedLeagueNamesAsPropagated();
				refreshPreview();
				await resolveLoadedTeamRedirects();
				return;
			}
		} catch ( error ) {
			mw.log.warn( 'Could not read saved data:', error );
		}

		clearUiRows();
		otherNote = '';
		createRow();
		refreshPreview();
	}

	function findWikitableRanges( source ) {
		const ranges = [];
		const markerRegex = /^\s*(\{\||\|\})/gm;
		let depth = 0;
		let start = -1;
		let match;

		while ( ( match = markerRegex.exec( source ) ) !== null ) {
			if ( match[ 1 ] === '{|' ) {
				if ( depth === 0 ) {
					start = match.index;
				}
				depth += 1;
			} else if ( depth > 0 ) {
				depth -= 1;
				if ( depth === 0 ) {
					const lineEnd = source.indexOf( '\n', markerRegex.lastIndex );
					ranges.push( {
						start,
						end: lineEnd === -1 ? source.length : lineEnd + 1
					} );
				}
			}
		}

		return ranges;
	}

	function isNationalStatisticsTable( table ) {
		const text = stripHtmlComments( table ).replace( /<ref\b[^>]*>[\s\S]*?<\/ref>|<ref\b[^>]*\/>/gi, '' )
			.toLocaleLowerCase( 'en-GB' );
		const hasTeamLink = /\[\[[^\]\n|]*national football team(?:#[^\]\n|]*)?(?:\|[^\]\n]*)?\]\]/.test( text );
		const headers = text.split( /\r?\n/ ).filter( ( line ) => /^\s*!/.test( line ) ).join( ' ' );
		return hasTeamLink && /(?:^|[^a-z])(?:apps|appearances|goals)(?=$|[^a-z])/.test( headers );
	}

	function insertClubBeforeNationalStatistics(
		source, body, nationalTable, clubTable, sectionText
	) {
		if ( clubTable ) {
			const extracted = extractLeadingTableReferences( source, clubTable.start );

			body = placeTableReferences( body, extracted.references );
			const clubEnd = extracted.tableStart + clubTable.end - clubTable.start;
			let beforeClub = extracted.source.slice( 0, extracted.tableStart )
				.replace( /(?:^|\n)===\s*Club\s*===[ \t]*\n(?:\s*\{\{Updated\|[^\n]*\}\}\s*)?\s*$/, '\n' );
			const nationalOffset = nationalTable.start - clubTable.start + extracted.tableStart;
			if ( /^==[^=\n]+==[ \t]*$/m.test( extracted.source.slice( clubEnd, nationalOffset ) ) ) {
				beforeClub = beforeClub.replace(
					/(?:^|\n)==[ \t]*Career statistics[ \t]*==\s*$/, '\n'
				);
			}
			source = beforeClub + extracted.source.slice( clubEnd );
			nationalTable = findWikitableRanges( source ).find( ( range ) => (
				isNationalStatisticsTable( source.slice( range.start, range.end ) )
			) );
		}
		const headings = [];
		const regex = /^(={2,6})[ \t]*([^=\n]+?)[ \t]*\1[ \t]*\r?$/gm;
		let match;
		while ( ( match = regex.exec( source.slice( 0, nationalTable.start ) ) ) !== null ) {
			while ( headings.length &&
				headings[ headings.length - 1 ].level >= match[ 1 ].length ) {
				headings.pop();
			}
			headings.push( {
				level: match[ 1 ].length, title: match[ 2 ].trim(),
				start: match.index, end: regex.lastIndex
			} );
		}
		const statsHeading = headings.find( ( heading ) => (
			heading.level === 2 &&
			/^Career statistics$/i.test( heading.title )
		) );
		const nationalHeadings = headings.filter( ( heading ) => (
			heading !== statsHeading &&
			/statistics|^international$/i.test( heading.title.toLocaleLowerCase( 'en-GB' ) )
		) );
		const nationalHeading = nationalHeadings[ 0 ];
		const title = hasManagerCareerData( source ) || /^== Career statistics ==/m.test( sectionText ) ||
			( statsHeading && statsHeading.title === 'Career statistics' ) ? 'Career statistics' : 'Career statistics';
		const start = nationalHeading ? nationalHeading.start : nationalTable.start;
		const end = nationalHeading ? nationalHeading.end : start;
		let before = source.slice( 0, start );
		if ( statsHeading ) {
			before = before.slice( 0, statsHeading.start ) + '== ' + title + ' ==' + before.slice( statsHeading.end );
		}
		let after = source.slice( end );
		nationalHeadings.slice( 1 ).reverse().forEach( ( heading ) => {
			after = after.slice( 0, heading.start - end ) + after.slice( heading.end - end );
		} );
		const mainHeading = statsHeading ? '' : '== ' + title + ' ==\n';
		const separator = statsHeading && before.trimEnd().endsWith( '== ' + title + ' ==' ) ?
			'\n' : '\n\n';
		return before.trimEnd() + separator + mainHeading + '=== Club ===\n' + body +
			'\n\n=== International ===\n' + after.replace( /^\s*/, '' );
	}

	function findExistingClubStatistics( source ) {
		const ranges = findWikitableRanges( source );
		return ranges.find( ( range ) => {
			const headings = [];
			const headingRegex = /^(={2,6})[ \t]*([^=\n]+?)[ \t]*\1[ \t]*$/gm;
			let heading;
			while ( ( heading = headingRegex.exec( source.slice( 0, range.start ) ) ) !== null ) {
				while ( headings.length &&
					headings[ headings.length - 1 ].level >= heading[ 1 ].length ) {
					headings.pop();
				}
				headings.push( { level: heading[ 1 ].length, title: heading[ 2 ] } );
			}
			const context = headings.map( ( item ) => item.title ).join( ' ' )
				.toLocaleLowerCase( 'en-GB' );
			if ( /international|manager|coach|performance|honours|tournament|derby/.test( context ) ) {
				return false;
			}
			const table = source.slice( range.start, range.end );
			if ( isNationalStatisticsTable( table ) ) {
				return false;
			}
			const headers = table.split( /\r?\n/ ).filter( ( line ) => /^\s*!/.test( line ) )
				.join( ' ' ).toLocaleLowerCase( 'en-GB' );
			const statIndicators = [ /apps|appearances/, /goals/, /total/ ];
			const contextIndicators = [ /club|team/, /season/, /league/, /cup/, /continental/, /europe/ ];
			return statIndicators.some( ( indicator ) => indicator.test( headers ) ) &&
				contextIndicators.filter( ( indicator ) => indicator.test( headers ) )
					.length >= 2 &&
				!/international|wins|losses|difference|points|coach/.test( headers );
		} );
	}

	function extractLeadingTableReferences( source, tableStart ) {
		const tableEnd = source.indexOf( '\n|}', tableStart );
		const oldTable = source.slice( tableStart, tableEnd < 0 ? source.length : tableEnd );
		const caption = oldTable.match( /^\|\+(?:<ref\b[^>]*\/\s*>|<ref\b[^>]*>[\s\S]*?<\/ref\s*>|[^\n])*/mi );
		const captionReferences = caption ? ( caption[ 0 ].match( /<ref\b[^>]*\/\s*>|<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi ) || [] ).join( '' ) : '';
		const prefixLines = source.slice( 0, tableStart ).split( /\r?\n/ );
		for ( let index = prefixLines.length - 1; index >= 0; index-- ) {
			const line = prefixLines[ index ];
			const update = line.match( /^\s*\{\{\s*Updated\s*\|[^\n]*?\}\}(?=\s*(?:<ref\b|$))/i );
			if ( update ) {
				const remainder = line.slice( update[ 0 ].length );
				if ( cleanValue( remainder ) ) {
					prefixLines[ index ] = remainder;
				} else {
					prefixLines.splice( index, 1 );
				}
			} else if ( cleanValue( line ) && !/<ref\b/i.test( line ) ) {
				break;
			}
		}
		const prefix = prefixLines.join( '\n' );
		source = prefix + source.slice( tableStart );
		tableStart = prefix.length;
		const beforeTable = source.slice( 0, tableStart );
		const lines = beforeTable.split( /\r?\n/ );
		let end = lines.length;
		while ( end > 0 && !cleanValue( lines[ end - 1 ] ) ) {
			end--;
		}
		const references = [];
		let start = end;
		while ( start > 0 && /<ref\b/i.test( lines[ start - 1 ] ) ) {
			references.unshift( lines[ start - 1 ] );
			start--;
		}
		if ( !references.length ) {
			return { source, references: captionReferences, tableStart: tableStart };
		}
		const referenceText = references.join( '\n' ).match( /<ref\b[^>]*>(?:[\s\S]*?<\/ref>)|<ref\b[^>]*\/>/gi );
		if ( !referenceText || !referenceText.length ) {
			return { source, references: captionReferences, tableStart };
		}
		const cleanedLines = lines.slice( 0, start ).concat(
			references.map( ( line ) => line.replace( /<ref\b[^>]*>(?:[\s\S]*?<\/ref>)|<ref\b[^>]*\/>/gi, '' ).trimEnd() ),
			lines.slice( end )
		);
		const cleanedSource = cleanedLines.join( '\n' );
		return {
			source: cleanedSource + source.slice( tableStart ),
			references: referenceText.join( '' ) + captionReferences,
			tableStart: cleanedSource.length
		};
	}

	function placeTableReferences( body, references ) {
		if ( !references ) {
			return body;
		}
		references = Array.from( new Set( references.match( /<ref\b[^>]*\/\s*>|<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi ) || [] ) ).join( '' );
		const updateMatch = body.match( /^(\{\{Updated\|[^\n]+\}\})\n/m );
		if ( updateMatch ) {
			const insertAt = updateMatch.index + updateMatch[ 1 ].length;
			return body.slice( 0, insertAt ) + references + body.slice( insertAt );
		}
		const captionMatch = body.match( /^\|\+[^\n]*/m );
		if ( captionMatch ) {
			const insertAt = captionMatch.index + captionMatch[ 0 ].length;
			return body.slice( 0, insertAt ) + references + body.slice( insertAt );
		}
		const tableIndex = body.indexOf( '{|' );
		if ( tableIndex === -1 ) {
			return body;
		}
		return body.slice( 0, tableIndex ) + references + '\n' + body.slice( tableIndex );
	}

	function reorderInfoboxDisplayParameters( templateText ) {
		let result = templateText;
		[ [ 'caption', [ 'image_size', 'image' ] ], [ 'clubnumber', [ 'currentclub' ] ] ]
			.forEach( ( [ name, anchors ] ) => {
				const parameters = topLevelTemplateParameters( result );
				const parameter = parameters.find( ( item ) => item.name === name );
				const anchor = anchors.map( ( candidate ) => (
					parameters.find( ( item ) => item.name === candidate )
				) ).find( Boolean );
				if ( !parameter || !anchor ) {
					return;
				}
				const raw = result.slice( parameter.start, parameter.end );
				result = result.slice( 0, parameter.start ) + result.slice( parameter.end );
				const position = anchor.end - ( parameter.start < anchor.end ? raw.length : 0 );
				result = result.slice( 0, position ).trimEnd() + '\n' + raw.trimEnd() + '\n' +
					result.slice( position );
			} );
		return result;
	}

	function normalizeClubStatisticsHeadings( source, table, sectionText ) {
		const headings = [];
		const regex = /^(={2,6})[ \t]*([^=\n]+?)[ \t]*\1[ \t]*\r?$/gm;
		let match;
		while ( ( match = regex.exec( source.slice( 0, table.start ) ) ) !== null ) {
			while ( headings.length &&
			headings[ headings.length - 1 ].level >= match[ 1 ].length ) {
				headings.pop();
			}
			headings.push( {
				level: match[ 1 ].length, title: match[ 2 ],
				start: match.index, end: regex.lastIndex
			} );
		}
		const nearestHeading = headings[ headings.length - 1 ];
		if ( !nearestHeading ) {
			return source;
		}
		const betweenHeadingAndTable = source.slice( nearestHeading.end, table.start ).trim();
		if ( betweenHeadingAndTable && betweenHeadingAndTable.split( /\\r?\\n/ ).filter( ( line ) => line.trim() ).length > 1 ) {
			return source;
		}
		const index = headings.findIndex( ( heading ) => (
			/statistics/.test( heading.title.toLocaleLowerCase( 'en-GB' ) )
		) );
		if ( index === -1 ) {
			return source;
		}
		const oldHeadings = headings.slice( index );
		const title = hasManagerCareerData( source ) ||
			/Career statistics/.test( sectionText + oldHeadings[ 0 ].title ) ?
			'Career statistics' : 'Career statistics';
		oldHeadings.slice().reverse().forEach( ( heading, reversedIndex ) => {
			const position = oldHeadings.length - 1 - reversedIndex;
			const replacement = position === 0 ? '== ' + title + ' ==' :
				position === 1 ? '' : '';
			source = source.slice( 0, heading.start ) + replacement + source.slice( heading.end );
		} );
		return source;
	}

	function insertOrReplaceCareerSection( source, sectionText ) {
		const bounds = detectInfoboxBounds( source );
		const bodyStart = bounds ? source.split( '\n' )
			.slice( 0, bounds.endIndex + 1 ).join( '\n' ).length - bounds.suffix.length : 0;
		return source.slice( 0, bodyStart ) + insertOrReplaceCareerSectionInBody(
			source.slice( bodyStart ), sectionText
		).replace(
			/^(==[ \t]*[^=\r\n][^\r\n]*?==)[ \t]*\r?\n(?:[ \t]*\r?\n)*(?====[ \t]*[^=\r\n][^\r\n]*?===[ \t]*\r?$)/gm,
			'$1\n'
		);
	}

	function insertOrReplaceCareerSectionInBody( source, sectionText ) {
		let table = findExistingClubStatistics( source );
		if ( table ) {
			source = normalizeClubStatisticsHeadings( source, table, sectionText );
			table = findExistingClubStatistics( source );
			source = source.slice( 0, table.end ) + removeLeadingNotelists( source.slice( table.end ) );
		}
		let body = sectionText.replace( /^={2,3}[^\n]*={2,3}[ \t]*(?:\r?\n|$)/gm, '' ).trim();
		const nationalTable = findWikitableRanges( source ).find( ( range ) => (
			isNationalStatisticsTable( source.slice( range.start, range.end ) )
		) );
		if ( nationalTable ) {
			return insertClubBeforeNationalStatistics(
				source, body, nationalTable, table, sectionText
			);
		}
		if ( table ) {
			const extracted = extractLeadingTableReferences( source, table.start );

			body = placeTableReferences( body, extracted.references );
			if ( nationalTeamCareerEnabled ) {
				body = /^=== Club ===/.test( body ) ? body : '=== Club ===\n' + body;
			}
			const adjustedTableStart = extracted.tableStart;
			const adjustedTableEnd = adjustedTableStart +
				source.slice( table.start, table.end ).length;
			return ( extracted.source.slice( 0, adjustedTableStart ) + '\n' + body + '\n' + extracted.source.slice( adjustedTableEnd ) )
				.replace( /(?:=== Club ===\s*){2,}/g, '=== Club ===\n' );
		}
		const existingHeading = /^==[ \t]*Career statistics[ \t]*==[ \t]*\r?$/im.exec( source );
		if ( existingHeading ) {
			const bodyStart = existingHeading.index + existingHeading[ 0 ].length;
			return source.slice( 0, bodyStart ) + '\n' + body + '\n' + source.slice( bodyStart );
		}
		const cleanSource = source;

		const headings = [];
		const topLevelHeadingRegex = /^==\s*([^=\n].*?)\s*==\s*$/gm;
		let headingMatch;
		while ( ( headingMatch = topLevelHeadingRegex.exec( cleanSource ) ) !== null ) {
			headings.push( {
				index: headingMatch.index,
				title: headingMatch[ 1 ]
					.trim()
					.toLocaleLowerCase( 'en-GB' )
					.replace( /[\s_-]+/g, ' ' )
			} );
		}

		// Insert career statistics before the closing sections.

		const closingHeadingPattern = /^(honou?rs|honou?rs and awards|awards|notes|references|sources|external links)$/;
		const closingHeading = headings.find( ( heading ) => {
			const title = heading.title;
			return closingHeadingPattern.test( title );
		} );
		let insertAt = closingHeading ? closingHeading.index : -1;

		if ( insertAt === -1 ) {
			// If there are no closing sections, insert after the last career heading.
			const careerHeadings = headings.filter( ( heading ) => /(?:^| )(?:career|playing career|managerial career)(?: |$)/.test( heading.title )
			);
			if ( careerHeadings.length ) {
				const lastCareer = careerHeadings[ careerHeadings.length - 1 ];
				const followingHeading = headings.find( ( heading ) => {
					const headingIndex = heading.index;
					return headingIndex > lastCareer.index;
				} );
				insertAt = followingHeading ? followingHeading.index : cleanSource.length;
			}
		}

		// Keep the section above stub templates, sort keys and categories.
		// Apply this boundary even when the career heading points to the end of the text.
		const trailingMetadata = /^(?:\s*\{\{[^\n{}]*(?:stub)[^\n{}]*\}\}\s*$|\{\{\s*(?:DEFAULTSORT)\s*:|\[\[(?:Category):)/gim.exec( cleanSource );
		if ( trailingMetadata && ( insertAt === -1 || trailingMetadata.index < insertAt ) ) {
			insertAt = trailingMetadata.index;
		}
		const trailingTemplate = /^(?:\s*\{\{[^\n{}]+\}\}\s*\r?\n)+(?=\s*(?:\[\[(?:Category):|$))/im.exec( cleanSource );
		if ( trailingTemplate && ( insertAt === -1 || trailingTemplate.index < insertAt ) ) {
			insertAt = trailingTemplate.index;
		}
		const trailingNavigation = /(?:^|\n)(\{\{\s*(?:Navboxes|[^\n{}]*(?:navbox|squad))[^\n]*[\s\S]*?\n\}\}\s*)(?=\[\[(?:Category):|$)/im.exec( cleanSource );
		if ( trailingNavigation ) {
			const navigationIndex = trailingNavigation.index +
				( trailingNavigation[ 0 ].startsWith( '\n' ) ? 1 : 0 );
			if ( insertAt === -1 || navigationIndex < insertAt ) {
				insertAt = navigationIndex;
			}
		}
		if ( insertAt === -1 ) {
			insertAt = cleanSource.length;
		}

		const before = cleanSource.slice( 0, insertAt ).replace( /\s*$/, '' );
		const after = cleanSource.slice( insertAt ).replace( /^\s*/, '' );
		return `${ before }\n\n${ sectionText.trimEnd() }${ after ? `\n\n${ after }` : '\n' }`;
	}

	function removeLeadingNotelists( text ) {
		let result = text;
		const leadingNotelist = /^(\s*(?:<!--[\s\S]*?-->\s*)*)\{\{\s*(?:Template\s*:\s*)?Notelist(?=\s*[|}])/i;
		let match;
		while ( ( match = leadingNotelist.exec( result ) ) !== null ) {
			const start = match[ 1 ].length;
			const tokens = /<!--[\s\S]*?-->|\x3cnowiki\b[^>]*>[\s\S]*?<\/nowiki\s*>|\{\{|\}\}/gi;
			tokens.lastIndex = start;
			let depth = 0;
			let end = -1;
			let token;
			while ( ( token = tokens.exec( result ) ) !== null ) {
				if ( token[ 0 ] === '{{' ) {
					depth++;
				} else if ( token[ 0 ] === '}}' ) {
					depth--;
					if ( depth === 0 ) {
						end = tokens.lastIndex;
						break;
					}
				}
			}
			if ( end === -1 ) {
				return result;
			}
			result = result.slice( 0, start ) + result.slice( end );
		}
		return result;
	}

	function ensureNotesSection( source ) {
		const table = findExistingClubStatistics( source );
		if ( !table ) {
			return source;
		}
		const tableText = source.slice( table.start, table.end );
		const hasNotes = /\{\{\s*efn\s*\|/i.test( tableText );
		let after = removeLeadingNotelists( source.slice( table.end ) );
		if ( hasNotes ) {
			after = after.replace( /(?:^|\n)(={2,6})[ \t]*Notes[ \t]*\1[ \t]*\r?\n([\s\S]*?)(?=\n={2,6}[ \t]*[^=]|$)/gi,
				( full, heading, content ) => {
					const remaining = removeLeadingNotelists( content );
					const outside = source.slice( 0, table.start ) + after.replace( full, '' );
					const hasOutsideNotes = /\{\{\s*efn\s*\||<ref\b[^>]*\bgroup\s*=/i.test( outside );
					return remaining !== content && !stripHtmlComments( remaining ) && !hasOutsideNotes ? '\n' : full;
				} );
		}
		if ( hasNotes ) {
			after = after.replace( /^(?:[ \t]*\r?\n)+/, '' );
			const separator = /^[ \t]*\{\{\s*(?:(?:Template|Şablon)\s*:\s*)?(?:Reflist|Kaynakça)(?=\s*[|}])/i.test( after ) ? '\n' : '\n\n';
			return source.slice( 0, table.end ).trimEnd() + '\n{{Notelist}}' + separator +
				( after.trim() ? after : '' );
		}
		after = after.replace( /^\s*\n/, '' );
		return source.slice( 0, table.end ).trimEnd() + ( after.trim() ? '\n\n' + after : '\n' );
	}

	function detectInfoboxBounds( source ) {
		const lines = source.split( '\n' );
		const startIndex = lines.findIndex( ( line ) => hasSupportedFootballerInfobox( line ) );
		if ( startIndex === -1 ) {
			return null;
		}
		const infoboxStart = /\{\{\s*Infobox football biography\b/i.exec( lines[ startIndex ] );
		const prefix = lines[ startIndex ].slice( 0, infoboxStart.index );
		lines[ startIndex ] = lines[ startIndex ].slice( infoboxStart.index );

		let depth = 0;
		for ( let i = startIndex; i < lines.length; i += 1 ) {
			const line = lines[ i ];
			for ( let position = 0; position < line.length - 1; position += 1 ) {
				const pair = line.slice( position, position + 2 );
				if ( pair === '{{' ) {
					depth += 1;
					position += 1;
				} else if ( pair === '}}' ) {
					depth -= 1;
					position += 1;
					if ( depth <= 0 ) {
						const closingEnd = position + 1;
						const suffix = line.slice( closingEnd );
						lines[ i ] = line.slice( 0, closingEnd );
						return { startIndex, endIndex: i, lines, prefix, suffix };
					}
				}
			}
		}

		return null;
	}

	function seasonBounds( seasonText ) {
		const season = cleanValue( seasonText );
		const openEndedMatch = season.match( /^(\d{4})\s*[-–—−]\s*$/ );
		if ( openEndedMatch ) {
			return {
				start: openEndedMatch[ 1 ],
				end: openEndedMatch[ 1 ],
				openEnded: true
			};
		}
		const match = season.match( /(\d{4})\D+(\d{2,4})/ );
		if ( !match ) {
			return { start: season, end: season };
		}

		const start = Number( match[ 1 ] );
		const rawEnd = match[ 2 ];
		let end = Number( rawEnd );

		if ( rawEnd.length === 2 ) {
			const century = Math.floor( start / 100 ) * 100;
			end = century + end;
			if ( end < start ) {
				end += 100;
			}
		}

		return { start: String( start ), end: String( end ) };
	}

	function seasonRangeText( seasons, ongoingSeasonStart ) {
		const filtered = seasons.filter( Boolean );
		if ( !filtered.length ) {
			return '';
		}
		const span = seasonSpanBounds( filtered );
		if ( ongoingSeasonStart ) {
			return `${ span.start }–`;
		}

		if ( span.start === span.end ) {
			return span.start;
		}
		return `${ span.start }–${ span.end }`;
	}

	function seasonSpanBounds( seasons ) {
		const bounds = seasons.map( ( season ) => seasonBounds( season ) );
		const starts = bounds.map( ( bound ) => Number( bound.start ) ).filter( Number.isFinite );
		const ends = bounds.map( ( bound ) => Number( bound.end ) ).filter( Number.isFinite );
		return {
			start: starts.length ? String( Math.min( ...starts ) ) : '',
			end: ends.length ? String( Math.max( ...ends ) ) : ''
		};
	}

	function infoboxSeasonRangeText( row, nextRow ) {
		const explicitSeasons = Array.from( new Set(
			row.explicitInfoboxSeasons.map( cleanValue ).filter( Boolean )
		) );
		if ( explicitSeasons.length === 1 && !row.infoboxYearEdited ) {
			return explicitSeasons[ 0 ];
		}
		const ongoingSeasonStart = row.infoboxYearEdited ? '' : row.ongoingSeasonStart;
		const firstCustomYear = cleanValue( row.infoboxYears[ 0 ] );
		const lastCustomYear = cleanValue( row.infoboxYears[ row.infoboxYears.length - 1 ] );
		const hasOpenCustomEnd = /^[-–—−]$/.test( lastCustomYear );
		if ( row.seasons.length === 1 && firstCustomYear ) {
			if ( /^[-–—−]$/.test( firstCustomYear ) ) {
				return `${ seasonBounds( row.seasons[ 0 ] ).start }–`;
			}
			if ( ongoingSeasonStart ) {
				const customStart = seasonBounds( firstCustomYear ).start ||
					seasonBounds( row.seasons[ 0 ] ).start;
				return `${ customStart }–`;
			}
			return firstCustomYear;
		}
		if ( firstCustomYear || lastCustomYear ) {
			const seasonSpan = seasonSpanBounds( row.seasons );
			const start = /^[-–—−]$/.test( firstCustomYear ) ?
				seasonSpan.start : ( firstCustomYear || seasonSpan.start );
			let end = hasOpenCustomEnd || ongoingSeasonStart ? '' :
				( lastCustomYear || seasonSpan.end );
			if (
				!lastCustomYear && !hasOpenCustomEnd && !row.isLoan && nextRow &&
				!nextRow.isLoan && nextRow.seasons.length
			) {
				const nextSeason = seasonBounds( nextRow.seasons[ 0 ] );
				if (
					Number( nextSeason.start ) >= Number( seasonSpan.start ) &&
					Number( seasonSpan.end ) > Number( nextSeason.start )
				) {
					end = nextSeason.start;
				}
			}
			if ( !end ) {
				return `${ start }–`;
			}
			return start === end ? start : `${ start }–${ end }`;
		}

		const defaultRange = seasonRangeText( row.seasons, ongoingSeasonStart );
		if (
			row.isLoan || !nextRow || nextRow.isLoan ||
			!row.seasons.length || !nextRow.seasons.length
		) {
			return defaultRange;
		}

		const span = seasonSpanBounds( row.seasons );
		const next = seasonBounds( nextRow.seasons[ 0 ] );
		if (
			!Number.isFinite( Number( next.start ) ) ||
			Number( next.start ) < Number( span.start ) ||
			Number( span.end ) <= Number( next.start )
		) {
			return defaultRange;
		}

		return span.start === next.start ? span.start : `${ span.start }–${ next.start }`;
	}

	function aggregateInfoboxRows( rows ) {
		const aggregated = [];
		let lastCareerRowIndex = -1;
		for ( let i = rows.length - 1; i >= 0; i -= 1 ) {
			if ( cleanValue( rows[ i ].team ) ) {
				lastCareerRowIndex = i;
				break;
			}
		}

		rows.forEach( ( row, rowIndex ) => {
			const team = cleanValue( row.team );
			if ( !team ) {
				return;
			}

			const key = JSON.stringify( [
				team,
				cleanValue( row.teamLink ),
				normalizeBoolean( row.isLoan ),
				normalizeBoolean( row.disableTeamLink ),
				normalizeBoolean( row.isGuest ),
				Boolean( cleanValue( row.reserveAnnotation ) ),
				clubAnnotationText( row ),
				row.clubSpellId ?? row.infoboxSourceIndex
			] );
			const previous = aggregated[ aggregated.length - 1 ];
			const dashApps = /^[-–—−]$/.test( stripHtmlComments( row.leagueApps ) );
			const dashGoals = /^[-–—−]$/.test( stripHtmlComments( row.leagueGoals ) );
			const appsUnknown = isUnknown( row.leagueApps ) || isUnknown( row.localLeagueApps );
			const goalsUnknown = isUnknown( row.leagueGoals ) || isUnknown( row.localLeagueGoals );
			const leagueApps = numericValue( row.leagueApps ) +
				numericValue( row.localLeagueApps );
			const leagueGoals = numericValue( row.leagueGoals ) +
				numericValue( row.localLeagueGoals );
			const isLoan = normalizeBoolean( row.isLoan );
			const rowSeasonBounds = seasonBounds( row.season );
			const customInfoboxYear = cleanValue( row.infoboxYear );
			const hasExplicitClosedInfoboxYear = Boolean( customInfoboxYear ) &&
				!/[–—−-]\s*$/.test( customInfoboxYear );
			const isCurrentFinalSeason = rowIndex === lastCareerRowIndex &&
				rowSeasonBounds.end === currentFootballSeasonEndYear();
			const ongoingSeasonStart = cleanValue( row.ongoingSeasonStart ) ||
				( rowSeasonBounds.openEnded ? rowSeasonBounds.start : '' ) ||
				( isCurrentFinalSeason && !hasExplicitClosedInfoboxYear ?
					rowSeasonBounds.start : '' );

			if ( previous && previous.key === key ) {
				previous.seasons.push( cleanValue( row.season ) );
				previous.teamRefs.push( ...( ( row.infoboxRefs && row.infoboxRefs.team ) || [] ) );
				previous.yearRefs.push( ...( ( row.infoboxRefs && row.infoboxRefs.year ) || [] ) );
				previous.infoboxYears.push( cleanValue( row.infoboxYear ) );
				previous.infoboxYearEdited = previous.infoboxYearEdited || Boolean( row.infoboxYearEdited );
				previous.explicitInfoboxSeasons.push( cleanValue( row.infoboxOriginalSeason ) );
				previous.statRefs.apps.push(
					...( ( row.infoboxStatRefs && row.infoboxStatRefs.apps ) || [] )
				);
				previous.statRefs.goals.push(
					...( ( row.infoboxStatRefs && row.infoboxStatRefs.goals ) || [] )
				);
				previous.infoboxDashApps = previous.infoboxDashApps && dashApps;
				previous.infoboxDashGoals = previous.infoboxDashGoals && dashGoals;
				previous.ongoingSeasonStart = ongoingSeasonStart ||
					previous.ongoingSeasonStart;
				if ( isLoan ) {
					for ( let i = aggregated.length - 2; i >= 0; i -= 1 ) {
						const parentEntry = aggregated[ i ];
						if ( !normalizeBoolean( parentEntry.isLoan ) ) {
							parentEntry.seasons.push( cleanValue( row.season ) );
							parentEntry.ongoingSeasonStart = ongoingSeasonStart ||
								parentEntry.ongoingSeasonStart;
							break;
						}
					}
				}
				if ( !previous.appsUnknown && !appsUnknown ) {
					previous.apps += leagueApps;
				}
				if ( !previous.goalsUnknown && !goalsUnknown ) {
					previous.goals += leagueGoals;
				}
				previous.appsUnknown = previous.appsUnknown || appsUnknown;
				previous.goalsUnknown = previous.goalsUnknown || goalsUnknown;
				return;
			}

			if ( isLoan ) {
				for ( let i = aggregated.length - 1; i >= 0; i -= 1 ) {
					const entry = aggregated[ i ];
					if ( !normalizeBoolean( entry.isLoan ) ) {
						entry.seasons.push( cleanValue( row.season ) );
						entry.ongoingSeasonStart = ongoingSeasonStart || entry.ongoingSeasonStart;
						break;
					}
				}
			}

			aggregated.push( {
				key,
				team,
				teamLink: cleanValue( row.teamLink ),
				isLoan,
				isGuest: normalizeBoolean( row.isGuest ),
				reserveAnnotation: cleanValue( row.reserveAnnotation ),
				clubAnnotation: clubAnnotationText( row, true ),
				clubPrefix: row.clubPrefix || '',
				disableTeamLink: normalizeBoolean( row.disableTeamLink ),
				seasons: [ cleanValue( row.season ) ],
				infoboxYears: [ cleanValue( row.infoboxYear ) ],
				infoboxYearEdited: Boolean( row.infoboxYearEdited ),
				explicitInfoboxSeasons: [ cleanValue( row.infoboxOriginalSeason ) ],
				teamRefs: [ ...( ( row.infoboxRefs && row.infoboxRefs.team ) || [] ) ],
				yearRefs: [ ...( ( row.infoboxRefs && row.infoboxRefs.year ) || [] ) ],
				statRefs: {
					apps: [ ...( ( row.infoboxStatRefs && row.infoboxStatRefs.apps ) || [] ) ],
					goals: [ ...( ( row.infoboxStatRefs && row.infoboxStatRefs.goals ) || [] ) ]
				},
				ongoingSeasonStart,
				apps: leagueApps,
				goals: leagueGoals,
				appsUnknown,
				goalsUnknown,
				infoboxDashApps: dashApps,
				infoboxDashGoals: dashGoals,
				includeStats: true
			} );
		} );

		return aggregated;
	}

	function findInfoboxCareerInsertIndex( infoboxLines ) {
		const isYouthLine = ( line ) => /^\|\s*(youthyears|youthclubs)\d+\s*=/.test( line.trim() );
		const isNationalLine = ( line ) => /^\|\s*(nationalyears|nationalteam|nationalcaps|nationalgoals)\d+\s*=/.test( line.trim() );

		for ( let i = 0; i < infoboxLines.length; i += 1 ) {
			if ( isNationalLine( infoboxLines[ i ] ) ) {
				return i;
			}
		}

		for ( let i = infoboxLines.length - 1; i >= 0; i -= 1 ) {
			if ( isYouthLine( infoboxLines[ i ] ) ) {
				return i + 1;
			}
		}

		return Math.max( infoboxLines.length - 1, 1 );
	}

	function clearInfoboxStatDashes( templateText ) {
		let result = templateText;
		topLevelTemplateParameters( templateText ).reverse().forEach( ( parameter ) => {
			if ( !/^(?:caps|goals|nationalcaps|nationalgoals)\d+$/i.test( cleanValue( parameter.name ) ) ||
				!/^[-–—−]$/.test( splitInfoboxReferences( parameter.value ).value ) ) {
				return;
			}
			const raw = templateText.slice( parameter.start, parameter.end );
			const equalsIndex = raw.indexOf( '=' );
			const value = raw.slice( equalsIndex + 1 ).replace(
				/<ref\b[^>]*>[\s\S]*?<\/ref\s*>|<ref\b[^>]*\/\s*>|<!--[\s\S]*?-->|[-–—−]/gi,
				( part ) => /^[-–—−]$/.test( part ) ? '' : part
			);
			result = result.slice( 0, parameter.start ) + raw.slice( 0, equalsIndex + 1 ) +
				value + result.slice( parameter.end );
		} );
		return result;
	}

	function rebuildInfobox( source, rows ) {
		const bounds = detectInfoboxBounds( source );
		if ( !bounds ) {
			return source;
		}

		const { startIndex, endIndex, lines } = bounds;
		const protectedReferences = protectInfoboxReferences(
			lines.slice( startIndex, endIndex + 1 ).join( '\n' )
		);
		const originalInfoboxText = normalizeInfoboxParameterLines( protectedReferences.text );
		const managerParameters = extractAndRemoveManagerParameters( originalInfoboxText );
		const medalParameters = extractAndRemoveMedalParameters( managerParameters.text );
		const cleanedInfoboxText = ensureMissingYouthYearParameters(
			removeInfoboxCareerParameters( medalParameters.text )
		);
		const infoboxLines = cleanedInfoboxText.split( '\n' );
		if ( infoboxLines.length === 1 ) {
			const closingIndex = infoboxLines[ 0 ].lastIndexOf( '}}' );
			if ( closingIndex !== -1 ) {
				const singleLineInfobox = infoboxLines[ 0 ];
				infoboxLines.splice(
					0,
					1,
					singleLineInfobox.slice( 0, closingIndex ).trimEnd(),
					singleLineInfobox.slice( closingIndex )
				);
			}
		}

		const insertAt = findInfoboxCareerInsertIndex( infoboxLines );
		const statLines = [];

		const infoboxRows = aggregateInfoboxRows( rows );
		infoboxRows.forEach( ( row, index ) => {
			const n = index + 1;
			const seasonRange = infoboxSeasonRangeText( row, infoboxRows[ index + 1 ] );
			const apps = row.appsUnknown ? '?' : ( row.infoboxDashApps && row.apps === 0 ? '' : row.apps );
			const goals = row.goalsUnknown ? '?' : ( row.infoboxDashGoals && row.goals === 0 ? '' : row.goals );
			const appReferences = row.statRefs.apps.join( '' );
			const goalReferences = row.statRefs.goals.join( '' );
			statLines.push( `| years${ n } = ${ seasonRange }${ row.yearRefs.join( '' ) }` );
			const teamValue = formatTeamCell( row, { withArrow: true, infobox: true } );
			statLines.push( `| clubs${ n } = ${ teamValue }` );
			statLines.push( `| caps${ n } = ${ apps }${ appReferences }` );
			statLines.push( `| goals${ n } = ${ goals }${ goalReferences }` );
		} );

		const originalParameters = topLevelTemplateParameters( originalInfoboxText );
		const careerActive = rowsHaveOpenEndedClubYear( rows );
		[ [ 'totalcaps', 'apps', 'appsUnknown' ], [ 'totalgoals', 'goals', 'goalsUnknown' ] ]
			.forEach( ( [ name, field, unknown ] ) => {
				const total = infoboxRows.some( ( row ) => row[ unknown ] ) ? '?' :
					infoboxRows.reduce( ( sum, row ) => sum + row[ field ], 0 );
				const original = originalParameters.find( ( parameter ) => (
					cleanValue( parameter.name ).toLowerCase() === name
				) );
				if ( careerActive && !original ) {
					return;
				}
				const annotations = original ? ( original.value.match(
					/__TFS_REFERENCE_\d+__|<!--[\s\S]*?-->/g
				) || [] ).join( '' ) : '';
				statLines.push( '| ' + name + ' = ' + total + annotations );
			} );
		infoboxLines.splice( insertAt, 0, ...statLines );

		if ( managerParameters.values.length ) {
			let managerInsertAt = -1;
			for ( let i = 0; i < infoboxLines.length; i += 1 ) {
				if ( /^\|\s*(?:nationalyears|nationalteam|nationalcaps|nationalgoals)\d+\s*=/i.test( infoboxLines[ i ].trim() ) ) {
					managerInsertAt = i + 1;
				}
			}
			if ( managerInsertAt === -1 ) {
				managerInsertAt = Math.max( infoboxLines.length - 1, 1 );
			}
			infoboxLines.splice( managerInsertAt, 0, ...managerParameters.values );
		}

		if ( medalParameters.values.length ) {
			let medalInsertAt = -1;
			for ( let i = 0; i < infoboxLines.length; i += 1 ) {
				if ( /^\|\s*(?:nationalyears|nationalteam|nationalcaps|nationalgoals)\d+\s*=/i.test( infoboxLines[ i ].trim() ) ) {
					medalInsertAt = i + 1;
				}
			}
			if ( medalInsertAt === -1 ) {
				medalInsertAt = Math.max( infoboxLines.length - 1, 1 );
			}
			infoboxLines.splice( medalInsertAt, 0, ...medalParameters.values );
		}

		// Remove unknown start-year placeholders while preserving dash characters.
		for ( let i = 0; i < infoboxLines.length; i += 1 ) {
			if ( /^\|\s*(?:years|youthyears|nationalyears)\d+\s*=/i.test( infoboxLines[ i ].trim() ) ) {
				infoboxLines[ i ] = infoboxLines[ i ].replace(
					/(=\s*)\{\{\s*0\s*\|\s*0000\s*\}\}\s*/i,
					'$1'
				);
			}
		}

		const finalizedInfoboxText = reorderNationalTeamParameters(
			normalizeInfoboxParameterSpacing(
				updateInfoboxUpdateParameter(
					reorderInfoboxDisplayParameters(
						removeEmptyCareerGroups( infoboxLines.join( '\n' ) )
					)
				)
			)
		);
		const finalizedInfoboxLines = clearInfoboxStatDashes(
			protectedReferences.restore( finalizedInfoboxText )
		).split( '\n' );
		if ( bounds.suffix && finalizedInfoboxLines.length ) {
			finalizedInfoboxLines[ finalizedInfoboxLines.length - 1 ] += bounds.suffix;
		}
		const rebuiltLines = [
			...lines.slice( 0, startIndex ),
			`${ bounds.prefix || '' }${ finalizedInfoboxLines[ 0 ] }`,
			...finalizedInfoboxLines.slice( 1 ),
			...lines.slice( endIndex + 1 )
		];
		return rebuiltLines.join( '\n' );
	}

	function setEditorText( value ) {
		let writtenThroughEditorApi = false;
		// textSelection is the safest shared content-writing interface
		// supported by WikiEditor and CodeMirror.
		if ( window.jQuery && window.jQuery.fn &&
			typeof window.jQuery.fn.textSelection === 'function' ) {
			try {
				window.jQuery( textarea ).textSelection( 'setContents', value );
				writtenThroughEditorApi = true;
			} catch ( error ) {
				mw.log.warn( 'The editor API was unavailable:', error );
			}
		}
		if ( !writtenThroughEditorApi && codeMirrorInstance && codeMirrorInstance.view ) {
			try {
				const view = codeMirrorInstance.view;
				view.dispatch( {
					changes: { from: 0, to: view.state.doc.length, insert: value }
				} );
				writtenThroughEditorApi = true;
			} catch ( error ) {
				mw.log.warn( 'Could not update CodeMirror:', error );
			}
		}

		if ( !writtenThroughEditorApi || textarea.value !== value ) {
			textarea.value = value;
		}
		textarea.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		textarea.dispatchEvent( new Event( 'change', { bubbles: true } ) );
	}

	function getEditorText() {
		if ( window.jQuery && window.jQuery.fn &&
			typeof window.jQuery.fn.textSelection === 'function' ) {
			try {
				const value = window.jQuery( textarea ).textSelection( 'getContents' );
				if ( cleanValue( value ) ) {
					return value;
				}
			} catch ( error ) {
				mw.log.warn( 'Could not read the editor content:', error );
			}
		}
		if ( codeMirrorInstance && codeMirrorInstance.view ) {
			const value = codeMirrorInstance.view.state.doc.toString();
			if ( cleanValue( value ) ) {
				return value;
			}
		}
		return textarea ? textarea.value : '';
	}

	function buildUpdatedArticle( editorText, rows ) {
		nationalTeamCareerEnabled = hasNationalTeamCareerData( editorText );
		managerCareerEnabled = hasManagerCareerData( editorText );
		if ( updateDateDraft === null ) {
			initializeUpdateDate( editorText );
		}
		syncUpdateDate( rowsHaveOpenEndedClubYear( rows ) );
		const sectionText = buildCareerSection( rows );
		let nextText = insertOrReplaceCareerSection( editorText, sectionText );
		nextText = ensureNotesSection( nextText );
		return rebuildInfobox( nextText, rows );
	}

	async function resolveTeamRedirects( rows ) {
		if ( !window.mw || typeof mw.Api !== 'function' ) {
			return rows;
		}
		const linkTarget = ( row ) => normalizeBoolean( row.disableTeamLink ) ||
			( row.teamLinkAuto === false && !cleanValue( row.teamLink ) ) ?
			'' : cleanValue( row.teamLink || row.team );
		const titles = Array.from( new Set(
			rows.map( ( row ) => linkTarget( row ).split( '#' )[ 0 ] ).filter( Boolean )
		) );
		if ( !titles.length ) {
			return rows;
		}
		const redirectMap = new Map();
		const existingTitles = new Set();
		for ( let i = 0; i < titles.length; i += 50 ) {
			const response = await new mw.Api().get( {
				action: 'query',
				formatversion: 2,
				redirects: 1,
				titles: titles.slice( i, i + 50 ).join( '|' ),
				prop: 'info'
			} );
			const query = response.query || {};
			[ ...( query.normalized || [] ), ...( query.converted || [] ),
				...( query.redirects || [] ) ].forEach( ( redirect ) => {
				redirectMap.set( redirect.from, redirect );
			} );
			( query.pages || [] ).forEach( ( page ) => {
				if ( !page.missing && !page.invalid && !page.redirect ) {
					existingTitles.add( page.title );
				}
			} );
		}
		return rows.map( ( row ) => {
			const target = linkTarget( row );
			if ( !target ) {
				return row;
			}
			const fragmentIndex = target.indexOf( '#' );
			let resolved = fragmentIndex === -1 ? target : target.slice( 0, fragmentIndex );
			let fragment = fragmentIndex === -1 ? '' : target.slice( fragmentIndex );
			const visited = new Set();
			while ( redirectMap.has( resolved ) ) {
				if ( visited.has( resolved ) ) {
					return row;
				}
				visited.add( resolved );
				const redirect = redirectMap.get( resolved );
				resolved = redirect.to;
				if ( !fragment && redirect.tofragment ) {
					fragment = '#' + redirect.tofragment;
				}
			}
			const link = resolved + fragment;
			return existingTitles.has( resolved ) && link !== target ?
				{ ...row, teamLink: link, teamLinkAuto: false } : row;
		} );
	}

	async function resolveLoadedTeamRedirects() {
		const stateKey = ( inputs ) => JSON.stringify( [
			teamGroupKey( inputs ), inputs.teamLink.dataset.tfshAutoTeamLink || ''
		] );
		const entries = Array.from( tbody.querySelectorAll( 'tr' ) ).map( ( tr ) => {
			const inputs = tr.tfshData.inputs;
			return {
				tr,
				key: stateKey( inputs ),
				row: {
					team: cleanValue( inputs.team.value ),
					teamLink: cleanValue( inputs.teamLink.value ),
					teamLinkAuto: inputs.teamLink.dataset.tfshAutoTeamLink === '1',
					disableTeamLink: inputs.disableTeamLink.checked
				}
			};
		} );
		try {
			const resolved = await resolveTeamRedirects( entries.map( ( entry ) => entry.row ) );
			const links = new Map();
			entries.forEach( ( entry, index ) => {
				if ( tbody.contains( entry.tr ) && stateKey( entry.tr.tfshData.inputs ) === entry.key &&
					resolved[ index ].teamLink !== entry.row.teamLink ) {
					links.set( entry.key, resolved[ index ].teamLink );
				}
			} );
			let changed = false;
			// Apply only to unchanged rows, including seasons added while the request was pending.
			Array.from( tbody.querySelectorAll( 'tr' ) ).forEach( ( tr ) => {
				const inputs = tr.tfshData.inputs;
				const link = links.get( stateKey( inputs ) );
				if ( link && !inputs.disableTeamLink.checked ) {
					inputs.teamLink.value = link;
					delete inputs.teamLink.dataset.tfshAutoTeamLink;
					changed = true;
				}
			} );
			if ( changed ) {
				refreshPreview();
			}
		} catch ( error ) {
			mw.log.warn( 'Could not resolve club redirects; existing links were preserved:', error );
		}
	}

	async function resolveInfoboxRedirects( source ) {
		if ( !window.mw || typeof mw.Api !== 'function' ) {
			return source;
		}
		const bounds = detectInfoboxBounds( source );
		if ( !bounds ) {
			return source;
		}
		const protectedReferences = protectInfoboxReferences(
			bounds.lines.slice( bounds.startIndex, bounds.endIndex + 1 ).join( '\n' )
		);
		const infoboxText = protectedReferences.text;
		const parameters = topLevelTemplateParameters( infoboxText ).filter( ( parameter ) => /^(?:youthclubs|managerclubs)\d+$/i.test( cleanValue( parameter.name ) )
		);
		const links = [];
		parameters.forEach( ( parameter ) => {
			parameter.value.replace( /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, ( full, target ) => {
				links.push( cleanValue( target ) );
				return full;
			} );
		} );
		const titles = Array.from( new Set( links.filter( Boolean ) ) );
		if ( !titles.length ) {
			return source;
		}
		const redirects = new Map();
		for ( let i = 0; i < titles.length; i += 50 ) {
			const response = await new mw.Api().get( {
				action: 'query', formatversion: 2, redirects: 1,
				titles: titles.slice( i, i + 50 ).join( '|' ), prop: 'info'
			} );
			( response.query && response.query.redirects || [] ).forEach( ( redirect ) => {
				redirects.set( redirect.from, redirect.to );
			} );
		}
		const replacements = parameters.map( ( parameter ) => ( {
			...parameter,
			raw: infoboxText.slice( parameter.start, parameter.end ).replace( /\[\[([^\]|]+)(\|[^\]]+)?\]\]/g,
				( full, target, label ) => redirects.has( cleanValue( target ) ) ?
					`[[${ redirects.get( cleanValue( target ) ) }${ label || '' }]]` : full )
		} ) );
		let updatedInfobox = infoboxText;
		replacements.slice().reverse().forEach( ( parameter, index ) => {
			const original = parameters[ parameters.length - 1 - index ];
			updatedInfobox = updatedInfobox.slice( 0, original.start ) +
				parameter.raw + updatedInfobox.slice( original.end );
		} );
		const updatedLines = protectedReferences.restore( updatedInfobox ).split( '\n' );
		const resultLines = [ ...bounds.lines ];
		resultLines.splice(
			bounds.startIndex, bounds.endIndex - bounds.startIndex + 1, ...updatedLines
		);
		resultLines[ bounds.startIndex ] = `${ bounds.prefix || '' }${ resultLines[ bounds.startIndex ] }`;
		if ( bounds.suffix && updatedLines.length ) {
			resultLines[ bounds.startIndex + updatedLines.length - 1 ] += bounds.suffix;
		}
		return resultLines.join( '\n' );
	}

	async function applyToVisualEditor( rows ) {
		if ( visualEditorApplying || visualEditorOpening ) {
			return;
		}
		visualEditorApplying = true;
		const applyButton = backdrop.querySelector( '.tfsh-apply' );
		applyButton.disabled = true;
		try {
			// Do not apply stale statistics to a document changed after the form was opened.
			assertVisualEditorSession( visualEditorSession );
			const session = await readVisualEditorSession();
			const resolvedSource = await resolveInfoboxRedirects( session.source );
			const resolvedRows = await resolveTeamRedirects( rows );
			const nextText = buildUpdatedArticle( resolvedSource, resolvedRows );
			const response = await session.target.parseWikitextFragment(
				nextText, false, session.doc
			);
			if ( !response.visualeditor || !cleanValue( response.visualeditor.content ) ) {
				throw new Error( 'The updated content could not be converted for VisualEditor.' );
			}
			const newDoc = session.doc.newFromHtml( response.visualeditor.content );
			assertVisualEditorSession( session );
			const model = session.surface.getModel();
			if ( model.isReadOnly() || !newDoc.data.hasContent() ) {
				throw new Error( 'Changes could not be applied in VisualEditor.' );
			}
			model.breakpoint();
			try {
				const range = session.doc.getDocumentRange();
				// Avoid duplicating categories and other metadata when reinserting the full document.
				model.change( window.ve.dm.TransactionBuilder.static.newFromRemoval(
					session.doc, range, true
				) );
				model.getLinearFragment( new window.ve.Range( range.start ) )
					.insertDocument( newDoc ).collapseToStart().select();
			} catch ( error ) {
				// If insertion fails, also undo the deletion in the same transaction.
				model.breakpoint();
				if ( session.doc.getCompleteHistoryLength() !== session.revision ) {
					model.undo();
				}
				throw error;
			}
			model.breakpoint();
			visualEditorSession = null;
			backdrop.classList.remove( 'is-open' );
			session.surface.getView().focus();
			mw.notify(
				'Statistics applied. You can publish the changes from VisualEditor.'
			);
		} catch ( error ) {
			mw.log.warn( 'FootballerStats VisualEditor error:', error );
			mw.notify( error.message || 'Changes could not be applied. Please try again.', { type: 'error' } );
		} finally {
			visualEditorApplying = false;
			applyButton.disabled = false;
		}
	}

	async function applyToTextarea() {
		const rows = getRowsFromUI();
		if ( !rows.length ) {
			return;
		}
		if ( visualEditorSession || getVisualEditorSurface() ) {
			applyToVisualEditor( rows );
			return;
		}

		const editorText = getEditorText();
		if ( !cleanValue( editorText ) ) {
			mw.notify( 'The article text could not be read from the editor. The operation was stopped to prevent content loss.', {
				title: TOOL_NAME,
				type: 'error'
			} );
			return;
		}

		try {
			const resolvedSource = await resolveInfoboxRedirects( editorText );
			const resolvedRows = await resolveTeamRedirects( rows );
			const nextText = buildUpdatedArticle( resolvedSource, resolvedRows );
			setEditorText( nextText );
			refreshPreview();
			backdrop.classList.remove( 'is-open' );

			const summaryInput = document.querySelector( "#wpSummary, input[name='wpSummary']" );
			if ( summaryInput && !cleanValue( summaryInput.value ) ) {
				summaryInput.value = 'edited and updated career statistics';
				summaryInput.dispatchEvent( new Event( 'input', { bubbles: true } ) );
				summaryInput.dispatchEvent( new Event( 'change', { bubbles: true } ) );
			}

			const previewButton = document.querySelector( "#wpPreview, button[name='wpPreview'], input[name='wpPreview']" );
			if ( previewButton ) {
				mw.storage.session.set( getPreviewScrollKey(), '1' );
				previewButton.click();
			}
		} catch ( error ) {
			mw.log.warn( 'FootballerStats preview error:', error );
			mw.notify( error.message || 'Could not generate a preview. Please try again.', {
				type: 'error'
			} );
		}
	}

	function findPreviewStatsTable( previewRoot ) {
		if ( !previewRoot ) {
			return null;
		}
		return Array.from( previewRoot.querySelectorAll( 'table.wikitable' ) ).find( ( table ) => {
			const headings = Array.from( table.querySelectorAll( 'th' ) )
				.map( ( heading ) => cleanValue( heading.textContent ).toLocaleLowerCase( 'en-GB' ) );
			return [ 'season', 'apps', 'goals' ].every(
				( label ) => headings.some(
					( heading ) => heading === label || heading.includes( label )
				)
			) && headings.some( ( heading ) => /club|team/.test( heading ) );
		} ) || null;
	}

	function enhancePreviewStatsTable( contentRoot = document.querySelector( '#wikiPreview, .mw-preview' ) ) {
		const table = findPreviewStatsTable( contentRoot );
		if ( !table ) {
			return false;
		}
		const previewRoot = contentRoot;
		const headings = Array.from( previewRoot.querySelectorAll( 'h2, h3, h4, h5, h6' ) );
		const heading = headings.filter( ( candidate ) => (
			candidate.compareDocumentPosition( table ) === Node.DOCUMENT_POSITION_FOLLOWING
		) ).pop();
		if ( !heading ) {
			return false;
		}
		const headingContainer = heading.closest( '.mw-heading' ) || heading;
		let actions = headingContainer.querySelector( '.footballerstats-preview-actions' );
		if ( !actions ) {
			actions = document.createElement( 'span' );
			actions.className = 'mw-editsection footballerstats-preview-actions';
			const openingBracket = document.createElement( 'span' );
			openingBracket.className = 'mw-editsection-bracket';
			openingBracket.textContent = '[';
			const button = document.createElement( 'a' );
			button.href = buildToolEditUrl();
			button.textContent = TOOL_NAME;
			button.addEventListener( 'click', ( event ) => {
				if ( getVisualEditorSurface() ) {
					event.preventDefault();
					openVisualEditorTool();
					return;
				}
				if ( !textarea ) {
					return;
				}
				event.preventDefault();
				if ( ensureUi() ) {
					visualEditorSession = null;
					backdrop.querySelector( '.tfsh-apply' ).textContent = 'Preview';
					refreshUpdateDate();
					backdrop.classList.add( 'is-open' );
					window.requestAnimationFrame( updateOptionalCompetitionColumns );
				}
			} );
			const closingBracket = document.createElement( 'span' );
			closingBracket.className = 'mw-editsection-bracket';
			closingBracket.textContent = ']';
			actions.append( openingBracket, button, closingBracket );
			headingContainer.appendChild( actions );
		}

		const shouldScroll = mw.storage.session.get( getPreviewScrollKey() ) === '1';
		mw.storage.session.remove( getPreviewScrollKey() );
		if ( shouldScroll ) {
			actions.scrollIntoView( { block: 'start', behavior: 'auto' } );
		}
		return true;
	}

	function ensureUi() {
		if ( launchButton && backdrop ) {
			return true;
		}

		const actionPortletId = getActionPortletId();
		if ( actionPortletId && window.mw && window.mw.util && window.mw.util.addPortletLink ) {
			launchButton = window.mw.util.addPortletLink(
				actionPortletId,
				'#',
				TOOL_NAME,
				EDIT_LINK_ID,
				`Open ${ TOOL_NAME }`
			);
			launchTab = launchButton ? launchButton.closest( 'li' ) : null;
		}

		if ( !launchButton ) {
			launchButton = document.createElement( 'button' );
			launchButton.type = 'button';
			launchButton.className = 'tfsh-launch';
			launchButton.textContent = TOOL_NAME;

			buttonRow = document.createElement( 'div' );
			buttonRow.className = 'tfsh-launch-row';
			buttonRow.appendChild( launchButton );
		}

		backdrop = document.createElement( 'div' );
		backdrop.className = 'tfsh-backdrop';
		backdrop.innerHTML = `
      <div class="tfsh-modal tfsh-english-modal" role="dialog" aria-modal="true" aria-label="${ TOOL_NAME }">
        <div class="tfsh-head oo-ui-processDialog oo-ui-processDialog-content">
          <div class="oo-ui-window-head">
            <div class="oo-ui-processDialog-navigation">
              <div class="oo-ui-processDialog-actions-primary"></div>
              <div class="oo-ui-processDialog-location"></div>
              <div class="oo-ui-processDialog-actions-safe"></div>
            </div>
          </div>
        </div>
        <div class="tfsh-table-wrap">
        <table class="tfsh-table tfsh-english-table">
          <colgroup>
            <col style="width:11%"><col style="width:11%"><col style="width:calc(7ch + 22px)"><col class="tfsh-infobox-year-column" style="width:6%"><col style="width:10%"><col style="width:calc(var(--tfsh-league-width) * 8 / 13)">
            <col style="width:var(--tfsh-stat-column-width)"><col style="width:var(--tfsh-stat-column-width)">
            <col class="tfsh-local-league-column" style="width:calc(var(--tfsh-local-league-width) * 8 / 13)"><col class="tfsh-local-league-column" style="width:var(--tfsh-stat-column-width)"><col class="tfsh-local-league-column" style="width:var(--tfsh-stat-column-width)">
            <col class="tfsh-national-cup-column" style="width:var(--tfsh-stat-column-width)"><col class="tfsh-national-cup-column" style="width:var(--tfsh-stat-column-width)">
            <col class="tfsh-league-cup-column" style="width:var(--tfsh-stat-column-width)"><col class="tfsh-league-cup-column" style="width:var(--tfsh-stat-column-width)">
            <col class="tfsh-continental-column" style="width:var(--tfsh-stat-column-width)"><col class="tfsh-continental-column" style="width:var(--tfsh-stat-column-width)"><col class="tfsh-other-column" style="width:var(--tfsh-stat-column-width)"><col class="tfsh-other-column" style="width:var(--tfsh-stat-column-width)"><col style="width:5%">
          </colgroup>
          <thead>
            <tr>
              <th rowspan="2">Club</th>
              <th rowspan="2">Club link</th>
              <th rowspan="2">Season</th>
              <th rowspan="2" class="tfsh-infobox-year-heading tfsh-infobox-year-column">Infobox<br>year</th>
              <th rowspan="2">Season link</th>
              <th colspan="3" class="tfsh-main-league-heading">League</th>
              <th colspan="3" class="tfsh-local-league-heading tfsh-local-league-column tfsh-toggle-heading" role="button" tabindex="0" aria-pressed="false">Local league</th>
              <th colspan="2" class="tfsh-national-cup-heading tfsh-national-cup-column tfsh-toggle-heading" role="button" tabindex="0" aria-pressed="true">National cup</th>
              <th colspan="2" class="tfsh-league-cup-heading tfsh-league-cup-column tfsh-toggle-heading" role="button" tabindex="0" aria-pressed="false">League cup</th>
              <th colspan="2" class="tfsh-continental-heading tfsh-continental-column tfsh-toggle-heading" role="button" tabindex="0" aria-pressed="true">Continental</th>
              <th colspan="2" class="tfsh-other-heading tfsh-other-column tfsh-toggle-heading" role="button" tabindex="0" aria-pressed="true">Other</th>
            </tr>
            <tr>
              <th>Division</th>
              <th class="tfsh-stat-heading"><span>Apps</span></th>
              <th class="tfsh-stat-heading"><span>Goals</span></th>
              <th class="tfsh-local-league-column">Division</th>
              <th class="tfsh-local-league-column tfsh-stat-heading"><span>Apps</span></th>
              <th class="tfsh-local-league-column tfsh-stat-heading"><span>Goals</span></th>
              <th class="tfsh-national-cup-column tfsh-stat-heading"><span>Apps</span></th>
              <th class="tfsh-national-cup-column tfsh-stat-heading"><span>Goals</span></th>
              <th class="tfsh-league-cup-column tfsh-stat-heading"><span>Apps</span></th>
              <th class="tfsh-league-cup-column tfsh-stat-heading"><span>Goals</span></th>
              <th class="tfsh-continental-column tfsh-stat-heading"><span>Apps</span></th>
              <th class="tfsh-continental-column tfsh-stat-heading"><span>Goals</span></th>
              <th class="tfsh-other-column tfsh-stat-heading"><span>Apps</span></th>
              <th class="tfsh-other-column tfsh-stat-heading"><span>Goals</span></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
        </div>
        <div class="tfsh-actions">
          <div class="tfsh-update-date-field">
            <label for="tfsh-update-date-input">Last updated</label>
            <label class="tfsh-link-toggle tfsh-today-toggle">Today<input type="checkbox" class="tfsh-update-date-today"></label>
            <input id="tfsh-update-date-input" type="text" class="tfsh-update-date" placeholder="Retired" disabled>
          </div>
          <button type="button" class="tfsh-primary tfsh-apply">Preview</button>
        </div>
      </div>
      <div class="tfsh-note-dialog-backdrop" role="presentation">
        <div class="tfsh-note-dialog-content">
          <p>Enter the competition's Wikipedia article title. A link will be created automatically. Use the + button to add another competition.</p>
          <table class="tfsh-note-table">
            <colgroup><col><col class="tfsh-note-stat-column"><col class="tfsh-note-stat-column"><col class="tfsh-note-remove-column"></colgroup>
            <thead><tr>
              <th scope="col">Competition</th>
              <th scope="col" class="tfsh-stat-heading"><span>Apps</span></th>
              <th scope="col" class="tfsh-stat-heading"><span>Goals</span></th>
              <th class="tfsh-remove-cell"></th>
            </tr></thead>
            <tbody class="tfsh-note-entries"></tbody>
          </table>
          <button type="button" class="tfsh-inline-link tfsh-note-add" aria-label="Add competition" title="Add competition">+</button>
          <p class="tfsh-note-preview" aria-live="polite"></p>
        </div>
      </div>
    `;
		document.body.appendChild( backdrop );
		const noteBackdrop = backdrop.querySelector( '.tfsh-note-dialog-backdrop' );
		const noteDialog = jQuery( noteBackdrop.querySelector( '.tfsh-note-dialog-content' ) ).dialog( {
			autoOpen: false,
			title: 'Competitions',
			width: 500,
			resizable: false,
			closeText: 'Close',
			position: { my: 'top', at: 'top+50', of: window },
			buttons: [ { text: 'Save', click: saveCompetitionNote } ],
			close: () => {
				const button = activeNoteEditor && activeNoteEditor.button;
				activeNoteEditor = null;
				noteBackdrop.classList.remove( 'is-open' );
				if ( button && button.isConnected ) {
					button.focus();
				}
			}
		} );
		const noteWidget = noteDialog.dialog( 'widget' ).addClass( 'tfsh-note-dialog' );
		noteWidget.appendTo( noteBackdrop );
		noteWidget.on( 'keydown', ( event ) => {
			if ( event.key === 'Escape' ) {
				event.stopPropagation();
			}
		} );
		noteWidget.find( '.ui-dialog-title' ).attr( 'id', 'tfsh-note-dialog-title' );
		noteWidget.attr( 'aria-labelledby', 'tfsh-note-dialog-title' ).attr( 'aria-modal', 'true' );
		noteWidget.find( '.ui-dialog-titlebar-close' ).addClass( 'tfsh-note-close' );
		noteWidget.find( '.ui-dialog-buttonpane button' ).addClass( 'tfsh-note-save' );
		initializeColumnGuides();

		if ( buttonRow ) {
			const upperContainer = document.querySelector( '.mw-body-header, #contentSub, #content' );
			if ( upperContainer ) {
				upperContainer.appendChild( buttonRow );
			}
		}

		tbody = backdrop.querySelector( 'tbody' );
		updateDateInput = backdrop.querySelector( '.tfsh-update-date' );
		updateDateTodayInput = backdrop.querySelector( '.tfsh-update-date-today' );
		tbody.addEventListener( 'keydown', handleTableKeyboardNavigation );
		updateDateInput.addEventListener( 'input', () => {
			updateDateDraft = updateDateInput.value;
			updateDateAutomatic = false;
			updateDateUseToday = false;
			refreshPreview();
		} );

		updateDateTodayInput.addEventListener( 'change', () => {
			updateDateUseToday = updateDateTodayInput.checked;
			if ( updateDateUseToday ) {
				updateDateDraft = currentUpdateDate();
				updateDateAutomatic = false;
			}
			refreshPreview();
		} );
		launchButton.addEventListener( 'click', ( event ) => {
			event.preventDefault();
			if ( getVisualEditorSurface() ) {
				openVisualEditorTool();
				return;
			}
			visualEditorSession = null;
			backdrop.querySelector( '.tfsh-apply' ).textContent = 'Preview';
			refreshUpdateDate();
			backdrop.classList.add( 'is-open' );
			window.requestAnimationFrame( updateOptionalCompetitionColumns );
		} );

		const headerTitle = new OO.ui.LabelWidget( {
			label: '',
			classes: [ 'oo-ui-processDialog-title' ]
		} );
		headerTitle.$element.html( '<img class="tfsh-brand-mark" src="https://upload.wikimedia.org/wikipedia/commons/8/8c/Soccer_Field_-_The_Noun_Project.svg" alt="" width="28" height="28"><span class="tfsh-brand-wordmark">Footballer<strong>Stats</strong></span>' );
		const closeAction = new OO.ui.ActionWidget(
			OO.ui.ProcessDialog.prototype.getActionWidgetConfig( {
				label: 'Close',
				flags: [ 'safe', 'close' ]
			} )
		);
		closeAction.$button.addClass( 'tfsh-close' ).attr( 'title', 'Close' );
		jQuery( backdrop.querySelector( '.oo-ui-processDialog-location' ) ).append( headerTitle.$element );
		jQuery( backdrop.querySelector( '.oo-ui-processDialog-actions-safe' ) ).append( closeAction.$element );
		backdrop.querySelector( '.tfsh-close' ).addEventListener( 'click', () => {
			backdrop.classList.remove( 'is-open' );
		} );

		backdrop.querySelector( '.tfsh-note-add' ).addEventListener( 'click', () => {
			addCompetitionEntry().name.focus();
		} );
		backdrop.querySelector( '.tfsh-note-dialog-content' ).addEventListener( 'keydown', ( event ) => {
			if ( event.key === 'Enter' && event.target.matches( 'input' ) ) {
				event.preventDefault();
				saveCompetitionNote();
			}
		} );
		backdrop.querySelector( '.tfsh-league-cup-heading' ).addEventListener( 'click', toggleLeagueCup );
		backdrop.querySelector( '.tfsh-local-league-heading' ).addEventListener( 'click', toggleLocalLeague );
		backdrop.querySelector( '.tfsh-national-cup-heading' ).addEventListener( 'click', toggleNationalCup );
		backdrop.querySelector( '.tfsh-continental-heading' ).addEventListener( 'click', toggleContinental );
		backdrop.querySelector( '.tfsh-other-heading' ).addEventListener( 'click', ( event ) => {
			if ( !event.target.closest( '.tfsh-other-note-btn' ) ) {
				toggleOther();
			}
		} );
		[
			[ '.tfsh-local-league-heading', toggleLocalLeague ],
			[ '.tfsh-national-cup-heading', toggleNationalCup ],
			[ '.tfsh-league-cup-heading', toggleLeagueCup ],
			[ '.tfsh-continental-heading', toggleContinental ],
			[ '.tfsh-other-heading', toggleOther ]
		].forEach( ( [ selector, toggle ] ) => {
			backdrop.querySelector( selector ).addEventListener( 'keydown', ( event ) => {
				if ( event.target.closest( '.tfsh-other-note-btn' ) ) {
					return;
				}
				if ( event.key === 'Enter' || event.key === ' ' ) {
					event.preventDefault();
					toggle();
				}
			} );
		} );
		backdrop.querySelector( '.tfsh-apply' ).addEventListener( 'click', applyToTextarea );

		document.addEventListener( 'keydown', ( event ) => {
			if ( event.key === 'Escape' && backdrop.classList.contains( 'is-open' ) ) {
				const guide = backdrop.querySelector( '.tfsh-column-guide-backdrop' );
				if ( guide.classList.contains( 'is-open' ) ) {
					jQuery( guide.querySelector( '.tfsh-note-dialog-content' ) ).dialog( 'close' );
					return;
				}
				if ( backdrop.querySelector( '.tfsh-note-dialog-backdrop' ).classList.contains( 'is-open' ) ) {
					closeCompetitionNoteDialog();
					return;
				}
				backdrop.classList.remove( 'is-open' );
			}
		} );

		if ( !getVisualEditorSurface() ) {
			loadSavedRows();
		}
		return true;
	}

	function repositionLaunchButton() {
		if ( !buttonRow ) {
			return;
		}
		const upperContainer = document.querySelector( '.mw-body-header, #contentSub, #content' );
		if ( upperContainer && buttonRow.parentElement !== upperContainer ) {
			upperContainer.appendChild( buttonRow );
		}
	}

	function applyUiAvailability( shouldShow ) {
		if ( !textarea || !ensureUi() ) {
			return false;
		}

		if ( buttonRow ) {
			buttonRow.style.display = shouldShow ? '' : 'none';
		}
		if ( launchTab ) {
			launchTab.style.display = shouldShow ? '' : 'none';
		}
		if ( !shouldShow ) {
			backdrop.classList.remove( 'is-open' );
		}
		return shouldShow;
	}

	function autoOpenIfRequested( shouldShow ) {
		const search = new URLSearchParams( window.location.search );
		const shouldAutoOpen = search.get( 'tfsh' ) === '1';
		if ( !shouldShow || !shouldAutoOpen || !backdrop || document.body.dataset.tfshAutoOpened === '1' ) {
			return;
		}

		document.body.dataset.tfshAutoOpened = '1';
		refreshUpdateDate();
		backdrop.classList.add( 'is-open' );
	}

	async function syncUiAvailability() {
		if ( !textarea || !ensureUi() ) {
			return false;
		}

		const search = new URLSearchParams( window.location.search );
		// If the user explicitly opened the tool through its link, open the dialog
		// without waiting for the textarea or WikiEditor/CodeMirror to finish loading.
		if ( search.get( 'tfsh' ) === '1' ) {
			const available = applyUiAvailability( true );
			autoOpenIfRequested( available );
			return available;
		}

		if ( hasSupportedFootballerInfobox( textarea.value ) ) {
			const available = applyUiAvailability( true );
			autoOpenIfRequested( available );
			return available;
		}

		const isSectionEdit = search.has( 'section' ) && search.get( 'section' ) !== '0';
		if ( isSectionEdit ) {
			const available = applyUiAvailability( await articleUsesSupportedFootballerInfobox() );
			autoOpenIfRequested( available );
			return available;
		}

		const result = applyUiAvailability( false );
		autoOpenIfRequested( result );
		return result;
	}

	async function initViewShortcut() {
		if ( !isSupportedSkin() ) {
			return false;
		}

		const search = new URLSearchParams( window.location.search );
		const action = search.get( 'action' ) || ( window.mw && window.mw.config && window.mw.config.get( 'wgAction' ) ) || 'view';
		const hasTextbox = !!document.querySelector( '#wpTextbox1' );
		const isVisualEditor = /[?&]veaction=(?:edit|editsource)\b/i.test( window.location.search );
		const isSourceEdit = hasTextbox || action === 'edit' || action === 'submit';

		if ( ( isSourceEdit && !isVisualEditor ) || !getCurrentPageTitle() ) {
			return false;
		}

		const supportedArticle = await articleUsesSupportedFootballerInfobox();
		if ( !supportedArticle ) {
			return false;
		}

		const link = ensureQuickAccessLink();
		enhancePreviewStatsTable( document.querySelector( '#mw-content-text .mw-parser-output, #mw-content-text' ) );
		if ( link && link.dataset.tfshSourceSwitch !== '1' ) {
			link.dataset.tfshSourceSwitch = '1';
			link.addEventListener( 'click', ( event ) => {
				if ( !getVisualEditorSurface() ) {
					return;
				}
				event.preventDefault();
				openVisualEditorTool();
			} );
		}
		if ( quickAccessTab ) {
			quickAccessTab.style.display = '';
		}
		return !!link;
	}

	function init() {
		textarea = document.querySelector( '#wpTextbox1' );
		const search = new URLSearchParams( window.location.search );
		const hasTextbox = !!textarea;
		const supportedSkin = isSupportedSkin();
		const isEditView =
			hasTextbox &&
			(
				search.get( 'action' ) === 'edit' ||
				search.get( 'action' ) === 'submit' ||
				document.body.classList.contains( 'action-edit' ) ||
				document.body.classList.contains( 'action-submit' ) ||
				/[?&]veaction=(?:edit|editsource)\b/i.test( window.location.search )
			);

		if ( !textarea || !isEditView || !supportedSkin ) {
			return false;
		}

		syncUiAvailability();

		if ( !textarea.dataset.tfshBound ) {
			textarea.dataset.tfshBound = '1';
			textarea.addEventListener( 'input', syncUiAvailability );
		}

		return true;
	}

	function loadEnglishStylesheet() {
		if ( document.getElementById( 'tfsh-english-user-styles' ) ) {
			return;
		}
		const href = mw.util.getUrl( 'User:Nanahuatl/FootballerStats.css', {
			action: 'raw',
			ctype: 'text/css'
		} );
		const stylesheet = document.createElement( 'link' );
		stylesheet.id = 'tfsh-english-user-styles';
		stylesheet.rel = 'stylesheet';
		stylesheet.href = href;
		document.head.appendChild( stylesheet );
	}
	function startTool() {
		loadEnglishStylesheet();
		mw.hook( 've.activationComplete' ).add( initVisualEditorShortcut );
		mw.hook( 've.newTarget' ).add( bindVisualEditorTarget );
		if ( window.ve && window.ve.init && window.ve.init.target ) {
			bindVisualEditorTarget( window.ve.init.target );
		}
		const initResult = init();
		enhancePreviewStatsTable();
		mw.hook( 'wikipage.content' ).add( () => {
			enhancePreviewStatsTable();
			if ( !document.querySelector( '#wpTextbox1' ) ) {
				initViewShortcut();
			}
		} );
		mw.hook( 'wikiEditor.toolbarReady' ).add( () => {
			init();
			repositionLaunchButton();
		} );
		mw.hook( 'ext.CodeMirror.ready' ).add( ( instance ) => {
			codeMirrorInstance = instance;
			init();
			repositionLaunchButton();
		} );
		mw.hook( 'ext.CodeMirror.toggle' ).add( ( enabled, instance ) => {
			if ( enabled === false ) {
				codeMirrorInstance = null;
			} else if ( instance && instance.view ) {
				codeMirrorInstance = instance;
			}
			repositionLaunchButton();
		} );

		if ( !initResult ) {
			initViewShortcut();
			const observer = new MutationObserver( () => {
				if ( init() ) {
					observer.disconnect();
					return;
				}
				if ( quickAccessLink ) {
					observer.disconnect();
					return;
				}
				initViewShortcut().then( ( added ) => {
					if ( added || quickAccessLink ) {
						observer.disconnect();
					}
				} );
			} );
			observer.observe( document.documentElement, { childList: true, subtree: true } );
			window.addEventListener( 'load', init, { once: true } );
		}
	}

	mw.loader.using( [ 'mediawiki.util', 'mediawiki.api', 'mediawiki.storage', 'jquery.textSelection', 'jquery.ui', 'oojs-ui-core', 'oojs-ui-windows', 'oojs-ui.styles.icons-interactions' ] )
		.then( startTool )
		.catch( ( error ) => {
			mw.log.warn( `${ TOOL_NAME } dependencies could not be loaded:`, error );
			startTool();
		} );
}() );
// </nowiki>
