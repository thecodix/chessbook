// Step-by-step guided tour shown to first-time users (and replayable via the
// "? Help" button in the topbar). Each step optionally switches `screen` and
// optionally highlights a DOM node matched by `selector` (a `data-tour`
// attribute placed on the relevant element). Steps without a `selector`
// render as a centered modal.

export const TOUR_STEPS = [
  {
    screen: 'dashboard',
    selector: '[data-tour="main-nav"]',
    title: 'Welcome to Chessbook',
    body: 'Use these tabs to move between your Dashboard, Repertoire (Study) and Import screens. Let\u2019s take a full tour of everything you can do.',
  },
  {
    screen: 'dashboard',
    selector: '[data-tour="user-badge"]',
    title: 'Your profile',
    body: 'Your username and rating are shown here \u2014 click the rating to edit it. Coverage gaps and other comparisons use this rating to find similarly-rated players on Lichess.',
  },
  {
    screen: 'dashboard',
    selector: '[data-tour="stats-row"]',
    title: 'Your stats at a glance',
    body: 'See how many games you\u2019ve played, how often you deviate from your prepared lines, and your average accuracy.',
  },
  {
    screen: 'dashboard',
    selector: '[data-tour="due-review"]',
    title: 'Due for review',
    body: 'Lines due for review appear here on a spaced-repetition schedule. Click "Start review session" to jump straight into drilling the most overdue line.',
  },
  {
    screen: 'dashboard',
    selector: '[data-tour="coverage-gaps"]',
    title: 'Coverage gaps',
    body: 'Chessbook compares your games to what similarly-rated players face on Lichess, and flags opening branches you haven\u2019t prepared a response for.',
  },
  {
    screen: 'dashboard',
    selector: '[data-tour="heatmap"]',
    title: 'Deviation heatmap',
    body: 'Red squares show where you tend to leave your prepared lines. Click a square to filter the deviations list to just that square.',
  },
  {
    screen: 'dashboard',
    selector: '[data-tour="recent-deviations"]',
    title: 'Ask Stockfish',
    body: 'Expand any recent deviation and hit "Ask Stockfish" for an engine-powered explanation of what went wrong and what the best move was.',
  },
  {
    screen: 'repertoire',
    selector: '[data-tour="opening-sidebar"]',
    title: 'Your repertoire',
    body: 'Openings you\u2019re preparing are listed here, grouped by color. Click one to load its lines.',
  },
  {
    screen: 'repertoire',
    selector: '[data-tour="line-tabs"]',
    title: 'Multiple lines per opening',
    body: 'Some openings have several prepared lines against different replies \u2014 switch between them here without leaving the board.',
  },
  {
    screen: 'repertoire',
    selector: '[data-tour="study-board"]',
    title: 'Study mode',
    body: 'Step through a line move by move using \u2190 \u2192, or by clicking a move in the list on the right. The board flips automatically for Black openings.',
  },
  {
    screen: 'repertoire',
    selector: '[data-tour="move-list"]',
    title: 'Move list',
    body: 'Every move in the current line is listed here. Click any move in Study mode to jump straight to that position.',
  },
  {
    screen: 'repertoire',
    selector: '[data-tour="idea-panel"]',
    title: 'Why this line?',
    body: 'Each line includes the strategic idea behind it and a short explainer, so you understand the plan \u2014 not just the moves to memorise.',
  },
  {
    screen: 'repertoire',
    selector: '[data-tour="drill-toggle"]',
    title: 'Test yourself',
    body: 'Switch to Drill mode to play the line out yourself against an auto-responding opponent. The moves are hidden \u2014 get it right to advance.',
  },
  {
    screen: 'repertoire',
    selector: '[data-tour="quality-buttons"]',
    title: 'Rate your recall',
    body: 'After drilling a line to the end, rate how well you remembered it. Chessbook uses the SM-2 spaced-repetition algorithm to schedule your next review \u2014 struggle and you\u2019ll see it again sooner.',
  },
  {
    screen: 'import',
    selector: '[data-tour="import-bar"]',
    title: 'Import your games',
    body: 'Enter your Chess.com username, pick how many months of history to pull, and click Import. Chessbook detects deviations from your repertoire and saves everything for next time.',
  },
  {
    screen: 'import',
    selector: '[data-tour="import-analytics"]',
    title: 'Analytics',
    body: 'Once games are imported, see your most-played openings by win rate and rating swing, plus results and rating progression charts over time.',
  },
  {
    screen: 'import',
    selector: '[data-tour="game-list"]',
    title: 'Game history',
    body: 'Every imported game is listed with the result, accuracy, time control, and \u2014 when you left your prepared line \u2014 exactly which move deviated and what the book move was.',
  },
  {
    screen: 'import',
    selector: null,
    title: 'You\u2019re all set!',
    body: 'That\u2019s the full loop: import games \u2192 spot deviations \u2192 drill and review \u2192 close your coverage gaps. Click "? Help" in the topbar any time to replay this tour.',
  },
]
