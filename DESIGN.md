Stock Arena — Design System

DESIGN.md is the visual and interaction contract for Stock Arena. It exists so humans and coding
agents extend one product instead of inventing a new design language screen by screen.

The product should feel like a competitive market terminal, not a generic crypto landing page and
not a casino. It should be calm enough to read under pressure, dense enough to show meaningful market
state, and energetic only where the duel itself benefits from it.

When this file conflicts with a security, protocol, or product requirement in code.md, the protocol
requirement wins. Design must expose the truth of the system; it must never conceal or reinterpret it.

Design principles

Dense, not cramped

Stock Arena is an active game surface. Important information should be visible without excessive
scrolling, but density must come from disciplined spacing and hierarchy rather than tiny unreadable
text.

Market first, spectacle second

The benchmark price, round state, predictions, score, stake, time remaining, oracle freshness, and
settlement status matter more than decoration. Arena energy should frame those facts, not compete with
them.

One visual language

Reuse the same spacing scale, typography, controls, badges, surfaces, status treatment, and motion
patterns everywhere. A new page is not permission to invent a new component vocabulary.

Explain state visually

A player should be able to answer these questions within seconds:

What asset am I playing?

Is this a devnet test copy or real mainnet reference data?

What is the live benchmark and how fresh is it?

What round are we in?

What did each agent predict?

Who is currently ahead, and why?

What action is available to me now?

Is a transaction pending, confirmed, failed, refundable, claimable, exercisable, or expired?

Restraint creates quality

Avoid the common AI-generated pattern of a border, shadow, gradient, icon, and rounded container around
everything. Use visual emphasis deliberately.

Product character

Stock Arena should feel:

competitive

precise

fast

trustworthy

technical without being intimidating

crypto-native without looking like a memecoin casino

polished enough for a live demo, but not over-designed

It should not feel like:

a generic admin dashboard

a marketing landing page inside the product

a neon cyberpunk mockup

a sportsbook or slot machine

a collection of shadcn demo cards

a mobile app stretched across desktop

Typography

Editorial research-desk direction (reference: yieldtheory.app, dark variant). Use Newsreader
(serif, weight 400) for page and section titles only, Inter for interface text, and Geist Mono for
values and for numbered uppercase kickers ("01 / Arenas", class `.eyebrow`). Page and section titles
use the shared `.title-page` / `.title-section` classes; never restyle headings per page. A headline
may pair a primary clause with a muted second clause.

Type roles

Role

Size

Weight

Notes

Page title

32px serif

400

Rare; one per primary view

Section title

20px serif

400

Compact section hierarchy

Primary UI

14px

450–550

Default interface text

Secondary UI

13px

450

Metadata and supporting copy

Label

12px

500

Field labels, eyebrow labels

Micro

11px

500

Timestamps, compact status text

Market value

14–24px

500–650

Use mono + tabular numerals

Do not use oversized 40–64px dashboard typography inside the application shell. The one exception is
the landing hero headline (serif, 44–56px). Large numbers are allowed only when the number is
genuinely the primary information on the screen.

Numeric presentation

Use monospaced/tabular numerals for benchmark prices, predictions, token amounts, stakes and payouts,
scores, round countdowns, confidence values, wallet-address fragments, transaction signatures, hashes,
and commitments.

Do not mix different decimal formatting rules across components. Use shared formatters.

Spacing and sizing

Use a 4px base grid. Prefer the following spacing scale:

4, 8, 12, 16, 20, 24, 32, 40, 48

Most interface work should stay within 4–24px. 32px+ is for separation between genuinely distinct
regions, not ordinary component padding.

Control heights

Keep desktop controls compact:

compact icon control: 28px

default button/input/select: 32px

prominent transaction CTA: 36px

avoid 44px+ desktop controls unless touch/mobile context requires them

Touch targets on mobile must remain accessible even when the visible control is visually compact.

Radius

Use a small radius vocabulary:

controls: 6px

ordinary grouped surfaces: 8px

dialogs / major overlays: 12px

pills/badges: fully rounded only when the semantic shape is a pill

Do not randomly mix rounded-md, rounded-lg, rounded-xl, rounded-2xl, and rounded-3xl.

Color system

Stock Arena is dark-first: a warm charcoal canvas (not neutral black), warm off-white text, a soft
cobalt accent, a muted gold for mainnet-reference labels, and a faint 40px grid on the canvas.
Panels are separated by thin `border-subtle` lines rather than heavy fills. A warm light theme
(paper `#fdfcfa`, dark ink, cobalt `#1f40ed`) is available from the header toggle via
`:root[data-theme='light']` in `globals.css`. Both themes define every semantic token; never style a
component for one theme only. Dark stays the default and the demo recording theme.

Use semantic tokens rather than literal colors in components. Exact values belong in the global theme.

Core semantic roles

background: deepest application canvas

surface-1: primary panels

surface-2: raised/interactive areas

surface-3: selected or emphasized neutral state

border-subtle: separators only

text-primary: main readable text

text-secondary: metadata

text-muted: tertiary hints

accent: Stock Arena brand/action accent

bullish: positive market direction

bearish: negative market direction

warning: stale feed / attention state

danger: destructive/error state that is not market direction

info: neutral informational status

Bullish/bearish semantics

Green/red may represent upward/downward market direction, but application status must not become
ambiguous because of it. For example:

a failed transaction should use danger plus an error icon/text, not simply bearish red

a successful transaction may use a check and neutral/accent treatment rather than bullish green

winner/loser treatment should include labels or icons, not only green/red

Accent restraint

Use the brand accent for primary actions, selected navigation, active-round emphasis, focused controls,
and small moments of Arena identity. Do not wash entire panels in the accent color.

Gradients

Default: no decorative gradients. A subtle data-visualization gradient is acceptable if it encodes
information. Marketing-style purple/blue/green background gradients are not part of the product UI.

Surfaces, borders, and cards

Prefer hierarchy in this order:

spacing

typography

tonal surface changes

subtle separators

border

shadow

A border should explain a boundary, not compensate for weak layout.

Every card is wrapped in the shared `Beam` component (`apps/web/src/components/beam.tsx`, the
`border-beam` package): a thin mono beam travelling along the card edge at strength 0.35. This is the
only animated border allowed. Do not raise its strength, switch it to a colourful variant, or use it
on anything that is not a card; it stops under prefers-reduced-motion.

A card should exist only when it groups a distinct interaction, coherent state, self-contained market
datum, participant, transaction/settlement action, or proof artifact.

Avoid cards nested inside cards. If three adjacent cards contain small labels and values, consider a
single structured panel with rows/columns instead.

Shadows should be rare. Dialogs, popovers, and floating menus may use them. Flat application panels
usually should not.

Layout architecture

Application shell

Desktop should prioritize a stable game workspace. Prefer a compact top navigation/product bar, a clear
primary content region, and an optional side rail only when it carries persistent useful state. Do not
put an oversized marketing header inside authenticated or game views.

Maximum width

Data-heavy match screens may use most of the viewport. Text-heavy proof/explanation pages should have a
more constrained readable measure. Do not apply one global max-width to every screen.

Responsive behavior

Desktop is the primary judging/demo surface, but narrow widths must degrade intentionally.

On narrow screens:

stack participant panels

keep the benchmark and countdown visible

make the current action reachable without horizontal scrolling

collapse secondary metadata before hiding primary state

allow hashes/signatures/addresses to wrap or truncate with copy affordances

never shrink critical text below readable sizes to preserve a desktop layout

Primary screens

Arena/lobby

The lobby should make the following immediately clear: the stock Arena asset, that it is a devnet test
copy, benchmark symbol/source, match duration/profile, stake amount, opponent/waiting state, and the
primary join/create action.

Do not overload the lobby with detailed protocol explanation. Link to proof/details instead.

Match screen

The match screen is the product centerpiece. Its layout and behavior must also follow
section 8A (Live battle arena). Its information hierarchy should roughly be:

asset + benchmark price + freshness

match status + round + countdown

player vs player state

current/recent predictions

score progression

strategy status/commitment where relevant

transaction/status actions

secondary technical metadata

The benchmark price should be easy to locate at all times. Current round state and countdown must not
disappear inside secondary cards.

Player comparison

Use a stable two-column comparison on desktop. Each side should use the same structure so differences
are attributable to data, not layout.

8A. Live battle arena — retro handheld PvP direction

Scope and intent

The live agent-versus-agent match is the one intentionally playful part of Stock Arena. Take
inspiration from the clarity, framing, limited palettes, character sprites, compact stat panels,
and turn announcements of late-1980s/1990s handheld monster-battle games. Translate those ideas
into an original stock-prediction duel; do not recreate Pokémon screens, sprites, creatures,
logos, fonts, menus, sound effects, dialogue, or exact compositions. The goal is a recognizable
retro game feeling, not a franchise imitation. Prefer original pixel-art agent avatars.

Apply the retro treatment principally to the live battle view, its round transitions, and
shareable match highlights. Keep the lobby, wallet transactions, settings, holdings, proof,
and settlement screens in the existing restrained market-terminal design language. The battle
must still feel like the same app through its shared color tokens, typography, formatting,
controls, and status components.

Core composition: agents compete around the market

The benchmark price graph is the center of the battlefield, not a decorative widget. Place
one agent on each side on desktop, with mirrored information hierarchy and original small
pixel-art avatars. In the top, persistent match strip show the Arena asset and prominent
DEVNET TEST COPY label, benchmark symbol and source, latest benchmark price, freshness,
match state, round number, and countdown. Under it, the center chart gets the most visual
space. The bottom of the battle surface is a concise retro dialogue/event log. Keep stake,
score, latest prediction, and each agent's actual state legible near its avatar.

Conceptual desktop layout (illustrative, not fixed pixel dimensions):

┌─────────────────────────────────────────────────────────────────────┐
│ OPENAI · DEVNET TEST COPY    Benchmark: NVDA/USD    ROUND 3   01:42 │
│ Benchmark $XXX.XX  ·  Oracle fresh  ·  Solana devnet                 │
├────────────────┬────────────────────────────────┬───────────────────┤
│ AGENT A        │      SHARED MARKET GRAPH       │ AGENT B           │
│ [pixel avatar] │                                │ [pixel avatar]    │
│ Strategy name  │  — A prediction target         │ Strategy name     │
│ Prediction     │  · actual/live price ───╮      │ Prediction        │
│ Score / status │  — B prediction target  ╰──    │ Score / status    │
│                │  round start → time → close     │                   │
├────────────────┴────────────────────────────────┴───────────────────┤
│ > ROUND 3: Both predictions received.                              │
│ > Waiting for the observed benchmark and on-chain round result.     │
└─────────────────────────────────────────────────────────────────────┘

Treat this diagram as hierarchy, not a mandate for card-heavy layout. Use spacing, tonal
surfaces, and pixel-inspired framing at the outer battle boundary. Avoid a thick outlined
box around every stat. The graph must remain large enough to compare both targets and the
observed price at a glance. On narrow screens, keep the graph first and sufficiently large;
place smaller participant summaries above/below or side by side if they still fit. Keep the
benchmark, timer, freshness, and essential action reachable without horizontal scrolling.

The graph is the battlefield

Use a clear, real time-series graph for the authenticated benchmark data that the game
actually uses. It may show a recent-price window and visible round boundaries. Mark the
round's start observation, each player's prediction target when disclosure is permitted,
the actual observed benchmark price once verified, and the round-end observation. Distinguish
live, provisional presentation from accepted on-chain facts. Use one consistent time axis
and price axis; prediction targets must use the same units, scale, and reference point as
the actual benchmark. Label each overlay directly or provide a concise, accessible legend.

A prediction marker is not an executed trade, order, position, P&L, or guaranteed future
price. Never draw invented candles, interpolate nonexistent observations as though they are
published ticks, or animate a fabricated price path. A line may connect actual observations
for legibility, but show its sampling/latency honestly. Keep timestamps and feed freshness
available. For sparse or stale data, show the last actual point and an explicit stale or
waiting state instead of simulating movement. A charting library is an implementation choice:
prefer existing repo tooling, and introduce a new dependency only if it materially improves
the battle graph without compromising correctness, performance, or MVP scope.

Prediction disclosure and round chronology

Respect the protocol's strategy-commitment rules and actual round publication timing. Do
not leak private strategies, salts, hidden predictions, or unaccepted outcomes through chart
overlays, logs, animation state, preloaded payloads, or client-side data. Until a prediction
is legitimately public, use a neutral status such as "Agent prediction pending" rather
than drawing its value. Display historical price observations only after they are available
from the authorized feed; do not imply both agents were predicting from a data point they
could not have seen. A displayed timeline must distinguish round start, prediction
submission/acceptance, subsequent observations, round close, and on-chain result confirmation.

Round results and score presentation

When a verified round result is available, freeze or highlight the relevant chart window,
reveal both permitted prediction targets, mark the actual observed price, and visually
compare prediction errors where the documented scoring rules make that comparison valid.
Use the program's accepted scoring and outcome data for the awarded points and winner;
never declare a winner from local chart math, inferred closeness, model confidence, or a
provisional feed tick. If a round ends in a tie, a defined penalty, an oracle failure, or
another documented state, show the literal state rather than forcing a victory animation.
Score bars may borrow the readability of retro battle stat meters, but they represent real,
labeled Arena scores or round progress—not arbitrary HP, fabricated probability, or
unstated win odds. Avoid a generic Bull-vs-Bear assignment: agents are players who may each
use any permitted strategy, including making forecasts in the same direction.

Retro visual vocabulary

Build original pixel-art avatars or deterministic silhouettes with a consistent native
sprite grid, crisp integer scaling, and image-rendering: pixelated where appropriate.
Keep avatars expressive but secondary to market data. Provide an intentional fallback for
players or agents without a sprite, and meaningful accessible labels.

Reserve a more characterful pixel-style typeface, if used at all, for very short battle
headings or round announcements. Keep prices, charts, long labels, logs, and actions in
the product's existing Geist/Geist Mono system. Never sacrifice numeric readability for
nostalgia.

Use a restrained retro accent palette derived from the shared semantic theme; do not
introduce a second, unrelated page-wide theme or confuse player identity colors with
bullish/bearish, success/failure, or status semantics.

Apply pixel-inspired corners, stepped separators, limited-frame sprite animations, and
subtle handheld-like panel treatments selectively. Avoid fake scanlines over the graph,
noisy dithering behind numbers, CRT distortion, neon glows, and pixelated chart labels.

Keep the market graph modern and crisp. The retro look belongs mainly to the surrounding
battle frame, original sprites, round label, score treatment, and event log.

Do not reuse copyrighted game assets or reproduce a recognizable Pokémon battle screen.

Battle log and text

Use a compact, bottom-anchored event log that is sourced from real match state. Favor
short chronological entries such as "Round 3 started", "Both predictions submitted",
"Benchmark observed", "Round 3 confirmed: Agent A +2 points", and "Oracle stale".
When authorized and useful, reveal the numeric predictions and the actual benchmark value
alongside the result. Optional short game-like lines may accompany confirmed battle
moments, but they may not replace literal protocol state or claim an action occurred before
it happened. Keep essential state visible outside the log: users must not have to wait for
text to type out to learn what happened. Provide a full accessible log/history if the
compact log truncates older entries.

Motion and sound

At round start, allow a brief round-label transition and 2–4 frame original avatar idle or
reaction animation. On a confirmed outcome, emphasize the relevant chart observation and
prediction-error distance, then briefly animate the correctly labeled score change and
winner or tie state. Prefer short, deterministic, cancelable transitions; ordinary UI
motion still follows section 16. Never delay a wallet action or oracle update to finish an
animation. Do not apply perpetual chart jitter, random price ticks, dramatic camera motion,
flashing red/green screens, or an unskippable reveal. Default to no sound; any later sounds
must be original, optional, muted by default, and never necessary to understand state.
Respect reduced-motion preferences by replacing flourishes with instant state changes.

Battle-specific component boundaries

First inspect existing UI primitives. Introduce focused shared components only if needed,
for example BattleArena, AgentBattlePanel, BenchmarkChart, PredictionMarker,
RoundResultOverlay, and BattleEventLog; reuse actual repository names where available.
The chart consumes normalized, typed market/round data from the established shared and
integration layers. Presentation components must not fetch paid feeds directly, decide
scoring or settlements, hold secrets, or duplicate the worker/program's business logic.
Keep the battle UI usable before any optional avatar/art or bespoke animation is finished.

Battle acceptance checklist

The center chart is visually primary and uses actual benchmark observations.

Both agents are visibly comparable, without implying Bull-vs-Bear roles or real trading.

Round, countdown, benchmark price, oracle freshness, and devnet label remain visible.

Prediction markers appear only when protocol-safe and use the chart's real price scale.

The confirmed on-chain result, not local inference, drives score and victory treatment.

Missing, stale, failed, penalized, tied, and terminal states have literal presentations.

Desktop and narrow layouts preserve graph readability, keyboard use, and reduced motion.

Original retro art/framing adds character without copying Pokémon assets or obscuring data.

Proof page

The proof page should feel verifiable, not decorative. Favor rows, code-like values, copy controls,
transaction links, timestamps, commitments, revealed strategy/salt data, oracle evidence, request IDs,
and round records.

Use progressive disclosure for deep technical detail, but never hide information required to verify the
match.

Status language

Use concise, literal labels such as:

Waiting for opponent

Round 2 of 5

Oracle stale

Submitting round

Settlement confirmed

Claim available

Refund available

Expired

Avoid vague AI-generated copy such as Something went wrong when the failure is known, Processing your
experience..., or flavor text like The arena is heating up! for ordinary state transitions.

Game flavor can exist in names and select moments (particularly the live battle in section 8A),
but operational states must remain literal.

Devnet and real-asset labeling

This is a hard trust requirement. Any place that shows an Arena token derived from a real PreStocks
asset must make the distinction visible.

Preferred labels:

NVDA — DEVNET TEST COPY

Reference asset: PreStocks NVDA (mainnet data)

Game network: Solana devnet

Do not rely on a tooltip or documentation page to clarify this distinction. Real-mainnet metadata and
devnet-game values must not be visually merged in a way that suggests the devnet token is the genuine
PreStocks asset.

Oracle and freshness states

The UI follows the product rule that feed staleness is the availability guard. Do not invent market
hours, reopening estimates, holiday messages, or session calendars.

Show the benchmark symbol, latest price, publish timestamp or relative age, fresh/stale state, and an
unavailable/error state when appropriate.

If stale, clearly explain that a match action is unavailable because the benchmark is stale. Do not
claim the market is closed unless an authoritative upstream source explicitly provides that fact and the
product specification changes to support it.

Buttons and actions

Every screen should have an obvious action hierarchy.

Primary

Use one primary action per local decision region: for example Create match, Join match, Deposit,
Claim winnings, Exercise option, or Refund.

Secondary

Use for reversible/supporting actions such as View proof, Copy address, View transaction, or
Cancel.

Destructive

Reserve destructive visual treatment for genuinely destructive or irreversible actions.

Do not make two adjacent actions look equally primary unless they truly have equal importance.
Transaction buttons must expose pending, confirmed, and failed state. Prevent accidental duplicate
submission while a wallet request or transaction is in flight.

Inputs and strategy entry

Strategy entry is important but should remain visually simple.

Show the length limit.

Preserve user-entered whitespace only when it has meaning.

Make commitment/reveal status visible after submission.

Do not expose the salt before the protocol says it can be revealed.

Do not decorate the text area like a chat interface.

Explain in one concise sentence that the strategy guides the battle agent; detailed mechanics belong
in supporting documentation or proof views.

Tables, feeds, and round history

Prefer aligned rows or tables for repeated structured data. A round history should not be a vertical
stack of visually unrelated cards.

Recommended round fields: round, observed benchmark, player A prediction/outcome, player B
prediction/outcome, score delta, and transaction/confirmation status.

Use sticky headers only when the list is actually long enough to benefit.

Icons

Use one primary icon library across the product. Do not mix icon families casually. If an existing
component library already establishes the icon set, keep it.

default icon: 16px

compact icon: 14px

prominent status icon: 18–20px

Icons should support comprehension, not decorate every label. Text-only actions are often preferable
when the icon would be ambiguous.

Motion

Motion communicates transitions; it does not provide entertainment by itself. Brief original
retro battle reactions are allowed only under section 8A and must not delay or obscure state.

Suggested timing:

hover/focus feedback: 100–140ms

enter/expand: 160–200ms

exit/collapse: 120–160ms

Prefer opacity and small transform changes. Avoid springy physics for ordinary financial actions.

Good uses include score updates, round transitions, expandable proof sections, toast/dialog entry, and
an opponent joining.

Avoid pulsing backgrounds forever, continuously floating cards, animated gradients, bouncing
transaction buttons, and spinning decorative logos. Respect prefers-reduced-motion.

Loading, empty, and error states

Do not ship only the happy path. Every data-dependent region should deliberately support initial/slow
loading, empty and partial data, stale oracle data, upstream errors, wallet rejection, transaction
pending/failed/confirmed, worker waiting, agent failure/penalty outcomes, and terminal match states.

Skeletons should approximately match the final layout and should not create large shifting blocks.

Errors should say what failed and what the user can do next. Do not expose raw upstream bodies, stack
traces, secrets, or implementation-only identifiers unless the proof/debug view intentionally requires
a safe identifier.

Accessibility

Minimum requirements:

semantic buttons/links/inputs

visible keyboard focus

usable keyboard navigation

sufficient text/background contrast

no state communicated by color alone

labels for icon-only controls

dialogs trap focus and restore it on close

reduced-motion support

meaningful loading/status announcements where appropriate

Do not remove focus outlines without replacing them with an equally visible focus treatment.

Copy style

Copy should be short, factual, and confident.

Prefer:

Benchmark stale — new rounds are temporarily unavailable.

Over:

Uh oh! It looks like the market data might be taking a little break right now.

Prefer:

Waiting for opponent

Over:

Your challenger is on the way...

Prefer domain terminology already established in code.md. Do not create synonyms for the same state.

Component ownership

Before introducing a new component, search for an existing one. Shared patterns should live in shared
UI modules rather than being copied between routes.

Create a shared component when at least one is true:

the pattern occurs in multiple places

it encodes a design-system rule

it owns non-trivial interaction behavior

it standardizes formatting or semantic state

it prevents future drift

Do not create a shared component solely to wrap one div with a class name.

Illustrative reusable product primitives include MarketPrice, OracleFreshnessBadge,
MatchStatusBadge, RoundCountdown, WalletAddress, TransactionLink, TokenAmount, PlayerPanel,
ScoreDisplay, DevnetAssetBadge, and ProofRow. Reuse existing repository names if equivalents
already exist.

Anti-patterns

Do not introduce:

giant hero sections in app views

gradients for visual interest alone

glassmorphism

glowing neon borders (the subtle `Beam` card edge is the one exception)

nested cards

excessive badges

a different radius on every component

arbitrary one-off hex values in components

multiple icon libraries for convenience

unexplained custom spacing such as 13px, 19px, or 27px

oversized empty-state illustrations

emoji as core UI icons

confetti for normal match completion or unskippable retro victory sequences

animated number rolling that makes prices harder to read

generic AI copy or filler text

comments in JSX that merely name obvious sections

Agent workflow for UI tasks

Before editing:

Read AGENTS.md, code.md, and this file completely. For battle-screen tasks, read section
8A before touching layout, charts, avatars, round motion, or logs.

Inspect the current screen and related shared components.

Search for existing tokens, formatters, badges, buttons, and layout primitives.

Identify the smallest design-system-compliant change.

While editing:

Reuse existing primitives first.

Keep state and formatting logic out of purely visual components where practical.

Add semantic tokens centrally instead of local literal styles.

Handle pending, error, empty, stale, and terminal states.

Keep devnet/mainnet distinctions explicit.

Before finishing:

Run the repository formatter/linter/typecheck/build required by AGENTS.md.

Inspect desktop and narrow layouts.

Check keyboard focus and interaction states.

Check long addresses, hashes, strategy text, errors, and empty states.

Verify no new style duplicates an existing primitive or token.

Verify the screen still communicates protocol truth accurately.

Decision rule

When uncertain between two visual implementations, choose the one that is:

easier to scan

more consistent with existing Stock Arena screens

more literal about protocol state

less visually noisy

easier to maintain through shared primitives

The goal is not to make every surface look impressive in isolation. The goal is to make the entire
product feel like one deliberate system.