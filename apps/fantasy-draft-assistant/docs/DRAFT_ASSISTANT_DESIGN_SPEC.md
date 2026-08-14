# Fantasy Draft Assistant Design Specification

**Status:** ACTIVE PRODUCT SPECIFICATION

**Audience:** Product / Engineering / AI implementation

**Primary device:** iPad landscape

**Scope:** Private Fantasy Draft Assistant

> **This specification should be updated when product decisions change. Do not silently contradict it in implementation.**

This document is the single source of truth for future Fantasy Draft Assistant UX and AI/intelligence work. Before implementing a major intelligence feature, consult this specification rather than reconstructing product intent from prior conversations.

## 1. Product Vision

The Fantasy Draft Assistant is a private, iPad-first live fantasy-football draft cockpit. It is not a generic fantasy rankings website. It should feel like a highly informed co-manager sitting beside the user: calm, premium, visually impressive, fast to understand, touch-friendly, conversational, appropriately opinionated, and transparent about uncertainty.

A person looking over the user's shoulder should immediately recognize a sophisticated custom draft tool. Visual sophistication must never compromise draft-day clarity.

### Core principle: calm first, depth on demand

Use progressive disclosure instead of placing every statistic and feature on the main screen. Apply a **three-second rule**: within roughly three seconds of viewing the live draft screen, the user should understand:

1. The best few choices available now.
2. Why the number-one recommendation is currently first.
3. What meaningful opportunity may be lost by waiting.

## 2. Primary iPad Live-Draft Layout

Design primarily for iPad landscape. The conceptual layout is:

- **Left:** roster and team-construction panel.
- **Center:** primary decision area with approximately the top three recommended players or actions.
- **Right:** conversation and AI-interaction panel.
- **Top:** compact draft state and rotating Draft Pulse information.

Conversation is central to the intelligence model, but it must not consume the entire screen. During a live draft, the current decision remains the primary visual emphasis. The interface should feel like a premium cockpit, not a chat application.

## 3. Roster Panel

The left panel defaults to the user's roster. A fast team/manager selector at its top must let the user switch to any manager's current roster with minimal effort. A dropdown, touch selector, swipe gesture, or another iPad-friendly method may be selected during implementation, but switching must be extremely fast.

Every roster uses the same position colors for instant recognition:

- **QB:** blue.
- **RB:** red.
- **WR:** green.
- **TE:** yellow.
- Secondary positions must also remain consistent everywhere; purple for K and orange for D/ST are acceptable starting points, with exact secondary colors open to refinement.

Do not overload this panel with statistics. Emphasize player name, position, NFL team when useful, bye week, and relevant injury, suspension, or status indicators.

## 4. Player Information Density

Default player presentations should show signals that change the decision, not large blocks of conventional fantasy statistics. Do not fill the primary interface with last year's or projected yardage, passing or receiving totals, large statistical tables, or unnecessary projections. Such data may exist in deliberate drill-down views.

Decision-relevant signals include:

- Player, position, NFL team, and bye week.
- Tier and ECR/consensus value.
- Internal Draft Assistant value or rank when useful.
- Injury, suspension, role uncertainty, timeshare risk, or workhorse status.
- Depth-chart changes and meaningful current NFL news.
- Confidence, scarcity, and Cost of Waiting.

Prefer signal over noise.

## 5. Primary Recommendation Area

The center normally presents approximately **three primary recommendations**, not a generic ranked list. Each recommendation must quickly answer:

1. **Who?**
2. **Why now?**
3. **What happens if I wait?**

A compact card may show player, position, bye, tier/ECR, and recommendation confidence, followed by a concise explanation such as “Best combination of value and roster fit,” “Tier drop after this player,” or “Excellent value; comparable RBs should remain available.” Tapping the player or card should reveal detailed reasoning.

## 6. Cost of Waiting

**Cost of Waiting** is a signature Draft Assistant concept. The system must continuously evaluate not only “Who is best?” but also “What happens if we do not take this player now?”

Relevant outcomes include:

- The player is likely to be gone before the user's next pick.
- Similar alternatives should remain.
- This is the final player in a meaningful tier.
- A positional run is likely.
- Passing costs little because equivalent players should remain.
- Passing creates substantial replacement-value loss.

This is especially important in snake drafts. Recommendations must consider both the current pick and the expected board state at the user's next pick.

## 7. Next-Turn Forecasting

Forecasting should prioritize current draft state over historical manager behavior. For managers selecting before the user's next turn, analyze current roster construction, missing starters, positional depth, positional scarcity, remaining tiers, current runs, and likely needs.

Useful reasoning sounds like: “Five of the next seven managers do not have a TE, and only two Tier-2 tight ends remain.” It should not default to simplistic history such as: “Manager X drafted a QB early last year.” Historical tendencies may eventually supplement forecasts, but immediate state must dominate.

## 8. Draft Pulse

Use a small, calm, rotating **Draft Pulse**, not a large dashboard. Cycle through roughly two or three highly actionable observations, such as:

- “Tier-2 TEs are likely to disappear before your next pick.”
- “WR value is falling to you.”
- “Four RBs have gone in the last six picks.”
- “QB pressure remains low.”
- “Two managers before your next turn still need TE.”

Messages may rotate every few seconds or use another subtle presentation. Draft Pulse must show the most important competing board dynamics, not steer toward a position merely because it has interesting data.

## 9. Master Player Board

A complete player board must remain available behind the calm live interface and open only when deliberately requested. It should support filtering or sorting by overall rank, position, tier, bye week, availability/drafted status, ECR, Draft Assistant ranking, and potentially status/news indicators.

The user should be able to ask “Show me every remaining quarterback” or manually open and filter the board. This is the deliberate exploration surface; it must not clutter the primary screen.

## 10. AI-Aware Player Watching and Tagging

Personal player interest is not a traditional queue and does not mean “Draft this player next.” Support lightweight interest states such as Interested, Favorite, Curious, Watch, Fade, Concerned, Risky, and Avoid; exact labels may be refined later.

These tags are **context, not commands**. Interest must not automatically promote a player to recommendation number one. The assistant should use it intelligently, for example:

- “You marked this player as interesting earlier. He is now near fair value and probably will not return to you.”
- “You have been watching this player, but I still think this is too early. Similar upside should be available later.”

Individual player tags belong naturally on the master player board.

## 11. Conversational Strategic Intent

Conversation should accept temporary strategic instructions such as: “I am worried about quarterback. I want one in the next two or three rounds. Keep an eye on it.” This is strategic context, not an order to draft a QB immediately.

The assistant should monitor availability, tiers, upcoming manager needs, Cost of Waiting, and relative value, then surface the concern when actionable: “You said you wanted a QB soon. This is probably the last turn where waiting is cheap.”

Broader strategic intent belongs in conversation. Player tags and conversational intent feed the same decision engine.

## 12. Conversational Draft-Philosophy Profile

The assistant should learn the user's draft philosophy through conversation, not a long onboarding form. On first meaningful use, it should invite a discussion such as: “Before we draft, let me learn how you like to build a team.”

Preferences may include waiting on QB, taking no kicker until the final round, upside versus floor, avoided players, handcuff philosophy, willingness to reach for favorites, injury-risk tolerance, rookie preference, and other positional philosophies.

Conversation should create or update a structured profile that the user can review. The assistant must not silently reinterpret major preferences. Future visits should offer a quiet **Review / Update Draft Philosophy** entry point, using the same conversation experience rather than a disconnected settings wizard.

## 13. Objective Analysis Versus User Preference

The assistant must clearly distinguish objective/model-driven analysis from user preference and must not distort rankings merely to agree. It should be transparent and decisive, for example:

> Pure value favors Player A. Your preference for upside makes Player B closer than consensus suggests. I still recommend Player A.

Or:

> Consensus prefers Player A, but given your stated strategy and current roster, I prefer Player B.

The user may arrive with less preseason research and rely heavily on the assistant. The assistant therefore must make genuine recommendations rather than constantly defer to preference.

## 14. Argue With Me

Provide a fast **Argue With Me** action. It presents the strongest reasonable case against the assistant's current recommendation, exposing hidden risk, alternative roster construction, consensus disagreement, positional opportunity cost, injury uncertainty, and important assumptions. It must not merely repeat the original recommendation.

## 15. Explain Like I Skipped the Offseason

Provide a one-tap or similarly fast **Explain this player like I skipped the offseason** action. It gives a concise football-context briefing rather than a statistical dump—enough to catch the user up intelligently in about 20 seconds.

Relevant context includes team and depth-chart changes, expected role, a new coordinator or system, rookie status, touch competition, major injury recovery, suspension, camp role, meaningful coach comments, why fantasy managers are excited or concerned, and why ECR moved.

## 16. Real-World NFL Context

Recommendations must eventually combine:

1. Consensus and ranking information.
2. League scoring and settings.
3. Roster construction.
4. Positional scarcity.
5. Next-turn forecast.
6. Player availability.
7. Real-world NFL context.
8. The user's stated philosophy.
9. The user's current player interests.

Real-world context includes projected timeshares, workhorse roles, depth-chart battles, coach comments, managed workloads, injuries, suspensions, holdouts, trades, role changes, camp reports, official depth charts, and meaningful team transactions. Do not build an intelligence system that merely wraps FantasyPros ECR.

## 17. News Quality, Freshness, and Uncertainty

The assistant must never pretend to possess perfect real-time knowledge. **Show what we know, how fresh it is, and how confident we are.** Where practical, context should carry freshness and provenance such as “News checked 12 minutes ago,” “Official injury report updated today,” “Multiple reports indicate…,” “Coach comment—speculative,” or “Camp report—low confidence.”

Distinguish primary/official information, reporting, analyst interpretation, and speculation. When sources disagree, preserve the uncertainty rather than collapsing it into false certainty. If data is stale or unavailable, say so; never manufacture freshness.

A material development may change a recommendation. A breaking update must explain both **what changed** and **why the recommendation moved**.

## 18. Structured Recommendation Reasoning

When deeper explanation is requested, organize it into understandable categories rather than an opaque AI paragraph:

- **Value:** consensus, ECR, and tier information.
- **NFL Context:** role, injury, team situation, and current reporting.
- **Roster Fit:** how the player fits the user's roster.
- **Scarcity:** what remains at the position.
- **Cost of Waiting:** likelihood that the player or tier survives.
- **Next-Turn Forecast:** likely picks before the user's next selection.
- **User Preference:** relevant philosophy or player-interest signals.
- **Uncertainty:** what could make the recommendation wrong.

## 19. Confidence

Recommendations may use a simple confidence indicator. Prefer **High / Medium / Low** to fake precision unless the underlying model supports calibrated percentages. Confidence should reflect uncertainty in projections, role, injury, news freshness, positional forecasts, and disagreement among sources or models.

## 20. What Changed?

Material recommendation changes must be explainable and must not feel arbitrary. Examples include: “Player A moved ahead of Player B because three RBs were selected and the remaining RB tier is now much thinner,” or “New injury information materially changed Player X's outlook.” The user should always be able to inspect why a recommendation moved.

## 21. Players You'll Regret Missing

Explore a lightweight, secondary **Players You'll Regret Missing** concept distinct from Best Available. It identifies players whose upside is unusually high, whose connection to expressed user interest is meaningful, whose next tier drop is large, whose market price appears favorable, or for whom waiting is especially dangerous. It must not clutter the primary screen.

## 22. Handcuff and Correlated-Player Awareness

The intelligence layer should understand meaningful relationships including RB handcuffs, ambiguous backfields, direct workload competition, QB/WR stacks where relevant, keeper implications, and roster correlation.

Handcuff logic must not be simplistic. Consider whether a backup has standalone value, whether the backfield would consolidate after an injury, and whether a different player might actually inherit the role.

## 23. Live-Draft Learning

For Year 1, prioritize learning from the **current draft** over sophisticated long-term opponent profiling. Observe roster construction, positional runs, current manager needs, unusual reaches, filled positions, open starting positions, and bench construction, and use those observations in next-turn forecasts.

Recurring leagues may eventually support cross-season tendencies, but historical behavior must never override obvious current-state evidence.

## 24. Progressive Disclosure and Visual Clutter

Do not expose every feature simultaneously. Keep the primary screen to roster on the left, top recommendations in the center, conversation on the right, and compact draft status plus Draft Pulse at the top.

Reveal everything else deliberately:

- Tap a player for a detailed intelligence drawer.
- Open Board for the master player list.
- Tap Why for structured reasoning.
- Tap Argue for the counterargument.
- Tap the offseason explanation for a concise briefing.
- Open the manager selector for another roster.

This preserves depth without creating an airplane dashboard covered in gauges.

## 25. Voice and Dictation

The experience must work comfortably with iPad dictation. The user should be able to speak natural instructions into the conversation field through iPad voice-to-text instead of typing extensively during a draft. Inputs and conversation interactions must not require tiny controls or complicated keyboard workflows. Native or browser speech capabilities may be explored later; basic iPad dictation compatibility is a core expectation.

## 26. Touch Design

Everything important must be comfortable on iPad. Avoid hover-only interactions, tiny icons, dense desktop tables as the primary interaction, and controls requiring mouse precision. Prefer generous touch targets, clear selected states, large player cards, simple drawers, obvious close/back behavior, and minimal modal stacking.

## 27. League-Specific Intelligence

Reason from the actual selected league. Believeland and RoboCop must not share generic assumptions where their rules differ. Inputs may include scoring, roster slots, position maximums, keepers, draft order, traded picks, starting round, and manager/team state. Player value and scarcity must be league-specific.

### Believeland

Believeland's authoritative settings already exist in the project and remain the authoritative implementation source. Intelligence must use the actual persisted league configuration, not generic ESPN defaults. This specification does not replace or restate those settings.

### RoboCop

RoboCop has distinct keeper and draft characteristics and must be independently modeled. Its future intelligence should account for keepers, the removed player pool, keeper cost/context where applicable, traded pick ownership, actual draft order, and IDP/defensive roster implications when present in authoritative settings. Do not assume Believeland logic applies unchanged.

## 28. Pre-Draft Experience

The application must be useful hours, days, or weeks before draft night. The user should be able to review rankings, explore positions, discuss strategy, build or update draft philosophy, tag or fade players, ask player questions, inspect news, review league settings, understand scarcity, rehearse strategies, and potentially simulate scenarios in later phases. First meaningful use must not be forced to draft day.

## 29. Draft-Day AI Role

During a live draft, the assistant should behave like a research department and strategic co-manager rather than a passive chatbot. It should proactively notice meaningful changes without constant interruption. Elevate information only when it materially affects a decision—for example, “Three TEs just went. Waiting now carries much more risk,” not “Another player was drafted.”

## 30. User Control

The user always makes the pick. The assistant recommends, explains, monitors, forecasts, and challenges. It must never silently draft players or alter historical draft state. Manual correction and undo remain essential when recorded information is wrong.

## 31. AI Transparency

Never present speculation as fact, stale data as current, ECR as proprietary AI insight, user preference as objective analysis, heuristic probability as mathematical precision, or a claim as sourced when the source does not support it. The assistant earns trust by clearly explaining uncertainty.

## 32. Deterministic State and AI Interpretation

Future architecture must separate **deterministic draft state** from **AI/intelligence interpretation**. Draft history, roster ownership, pick order, available players, keeper state, and similar facts remain deterministic and authoritative outside the AI. AI may analyze those facts, but it must not become their authoritative database.

## 33. Implementation Priorities

Before implementing each major intelligence feature, future work must consult this specification. When implementation pressure conflicts with this document, preserve these priorities in order:

1. Correct draft state.
2. Fast decision-making.
3. Transparency.
4. Calm UI.
5. League-specific reasoning.
6. User-preference awareness.
7. Real-world context.
8. Visual polish.

Do not sacrifice the first four for feature count.

## 34. Non-Goals for This Documentation Milestone

This milestone documents product direction only. It does **not** implement:

- OpenAI API calls or AI endpoints.
- Rankings feeds, FantasyPros integration, news feeds, or scraping.
- Projections, scarcity algorithms, or return-probability algorithms.
- A player queue, player tags, Draft Pulse, or recommendation UI.
- Database tables, migrations, Supabase functions, or secrets.
- Deployment changes or changes to the deployed `/draft-assistant/` build.

Phase 4 implementation begins only in separately scoped future work.

## Product Decision Log

The following decisions are locked unless this specification is explicitly updated:

| Decision | Locked direction |
| --- | --- |
| Primary device | iPad landscape first. |
| Experience principle | Calm first; depth on demand. |
| Decision speed | Apply the three-second rule. |
| Primary layout | Roster left, recommendations center, conversation right, compact state and Draft Pulse at top. |
| Roster inspection | Default to the user's roster and support extremely fast switching among manager rosters. |
| Position colors | QB blue, RB red, WR green, and TE yellow, consistently throughout the application. |
| Recommendations | Present approximately three primary recommendations, each explaining who, why now, and what happens if the user waits. |
| Cost of Waiting | Treat Cost of Waiting as a signature recommendation input. |
| Forecast horizon | Forecast the board at the user's next turn, especially in snake drafts. |
| Draft Pulse | Rotate a small set of calm, competing, actionable observations. |
| Player board | Keep a complete, filterable master player board behind the primary UI. |
| Player-interest tags | AI-aware interest states provide context, not commands or automatic ranking promotion. |
| Strategic intent | Capture temporary strategic intent through conversation and surface it when actionable. |
| Draft philosophy | Learn and update a reviewable structured profile through conversation, not a long settings wizard. |
| Analytical integrity | Separate objective/model-driven analysis from user preference and explain their effects. |
| Challenge action | Provide Argue With Me to make the strongest reasonable countercase. |
| Player briefing | Provide Explain Like I Skipped the Offseason as a concise football-context briefing. |
| NFL context | Combine real-world roles, injuries, transactions, reports, and team context with rankings and draft state. |
| Freshness and uncertainty | Display what is known, its freshness, provenance where practical, and confidence; never manufacture recency or certainty. |
| Explanation model | Structure reasoning by Value, NFL Context, Roster Fit, Scarcity, Cost of Waiting, Next-Turn Forecast, User Preference, and Uncertainty. |
| Recommendation movement | Provide What Changed explanations for material recommendation changes. |
| Secondary opportunities | Explore Players You'll Regret Missing as a lightweight secondary concept. |
| Player relationships | Understand nuanced handcuffs, workload competition, stacks, keeper implications, and roster correlation. |
| Learning priority | Prioritize current-draft evidence over opponent-history assumptions. |
| Information architecture | Use progressive disclosure and protect the primary screen from clutter. |
| Input method | Maintain iPad dictation compatibility and touch-friendly interactions. |
| League modeling | Use actual persisted league configurations and model Believeland and RoboCop independently where rules differ. |
| Authority boundary | Keep deterministic draft state separate from AI interpretation; AI never becomes the source of truth for draft facts. |

## Broadcast War Room Visual System

Option A — **Broadcast War Room** — is the approved and locked visual direction. The balance is approximately 75% premium sports-broadcast energy and 25% Executive Draft Room restraint. A deep near-black/navy foundation, subtly elevated surfaces, restrained borders, and selective illumination must support fast decisions without becoming a game HUD or generic dashboard.

Use a deployment-safe condensed system-font stack for athletic display moments and a modern system sans-serif stack for readable supporting content. Position identity is semantic and consistent: QB blue, RB red, WR green, TE yellow, D/ST orange, and K purple; text labels always accompany color. `TeamMark` is the single stable team-identity surface. It renders a cohesive set of 32 original internal vector badges, with an accessible abbreviation fallback for unknown identifiers. Team color is a secondary accent and must never override player identity or semantic position color.

Recommendation cards remain the visual center: three options, with rank one clearly identified as the assistant pick through hierarchy, border strength, and restrained illumination. Compact categorical confidence rings use HIGH, MED, or LOW for fixture intelligence; numeric confidence is reserved for future defensible data and any numeric demonstration must say PREVIEW. Cost of Waiting remains prominent but subordinate to the player name, and all fixture intelligence remains explicitly labeled.

Microinteractions must be short, purposeful, touch-safe, and disabled by `prefers-reduced-motion`. Spacing is engineered iPad-landscape first so roster, three recommendations, conversation, and Draft Pulse remain legible without horizontal page scrolling. The calm-first, depth-on-demand requirement and three-second decision rule remain authoritative over decorative intensity.

### Dimensional styling decisions

Dimensional Broadcast War Room styling is approved. Environmental lighting may use restrained CSS gradients, vignette, edge light, and tonal separation, but calm-first and the three-second rule remain authoritative. Major cockpit panels use a shared elevation hierarchy; recommendation cards use layered physical depth, and recommendation number one receives one additional restrained elevation step so rank remains immediately legible without changing the information architecture.

Confidence rings use a dimensional broadcast-gauge treatment while continuing to communicate truthful categorical **HIGH / MED / LOW** confidence. Primary and secondary controls use tactile press feedback, with the DRAFT action maintaining the strongest action hierarchy. Interaction depth comes from lighting, surface, edge, elevation, shadow, and short press response. Exaggerated cursor-following 3D tilt is not desired.

Official NFL team logo artwork remains a long-term product desire, but its implementation status is **DEFERRED — APPROVED ASSET SOURCE REQUIRED**. The current approved solution is a complete set of 32 non-official, original internal team identity badges built from a common geometric shield, abstract motif, initials, and broad color-family cues. These local inline SVG marks are intentionally visually distinct from official trademarks: they use no official artwork, mascots, helmets, wordmarks, or recognizable protected compositions. They remain secondary to player identity and position semantics. Future approved official assets may replace them through the same `TeamMark` abstraction without redesigning any consuming UI. Do not download, hotlink, trace, recreate, or bundle official team artwork without that approval.

## Phase 4B implementation note — Personal context layer

Phase 4B adds three deliberately separate, league-and-season-scoped local context types: a durable `DraftPhilosophy`, per-player `PlayerInterest`, and temporary `StrategicIntent`. Typed conversation messages retain onboarding, user text, intent events, argument requests, briefing requests, and explicit intelligence placeholders. IndexedDB version 4 adds only new object stores; existing setup, session, event, and snapshot stores are preserved. This scope is intentionally local-first and does not claim cloud synchronization.

`ArgumentRequestContext` and `OffseasonBriefingContext` capture IDs and compact references rather than copying deterministic draft state. `DraftUserContext` packages philosophy, interests, intents, and recent conversation so a future intelligence layer can combine personal context with the separately authoritative deterministic engine. Player context never changes ranking, availability, roster ownership, or picks.

No OpenAI integration, external data request, NFL news, language inference, or generated football analysis exists in Phase 4B. Argue With Me and offseason briefing actions persist typed requests and present fixed, clearly labeled placeholders. Free text is retained verbatim and becomes an intent only after explicit user confirmation.
