# KNODES — Retest & Insights Pages
## Figma AI Prototype Specification
### File: `03-Retest-and-Insights.md`

---

# 0. Scope

This specification covers two connected user-facing areas of KNODES:

1. **Retest**
   - Review due knowledge
   - Select a review mode
   - Answer structural probes
   - Receive evidence-based feedback
   - Follow prerequisite detours when necessary
   - Complete a review session

2. **Insights**
   - Understand how the learner's knowledge is developing
   - See recall / decay
   - See structural depth
   - See transfer evidence
   - See misconception patterns
   - See demonstrated capabilities
   - See progress over time

These are not generic quiz and analytics pages.

The purpose is to reinforce the project's central idea:

> Recall is not the same thing as understanding.

The system should collect evidence about whether the learner possesses the structure of a concept rather than presenting a single simplistic "understanding percentage."

---

# 1. Product Philosophy

KNODES Retest is an evidence-gathering learning experience.

The interface should test:

- Recall
- Application
- Comparison
- Process tracing
- Counterfactual reasoning
- Misconception recognition / refutation
- Transfer

The project defines seven probe types. They share a deterministic grading core based on signals such as coverage, ordering, precision, semantic matching, verbatim penalty, branch leakage, and transition-claim weighting.

The UI should never expose the learner to internal grading mathematics unless a later product decision explicitly requires an advanced explanation.

The normal learner experience should be:

```text
Review
  ↓
Think
  ↓
Answer
  ↓
Evidence
  ↓
Feedback
  ↓
Next review
```

---

# 2. Core Design Principle

DO NOT design:

```text
Understanding: 78%
```

as the primary result.

Instead use:

```text
Structural evidence
```

or:

```text
Concept Depth
```

with a categorical or component-based explanation.

The project explicitly uses SOLO-style structural levels:

- Prestructural
- Unistructural
- Multistructural
- Relational
- Extended Abstract

The UI should treat these as levels of structural evidence, not percentages representing objective understanding.

---

# 3. Global App Shell

Reuse the same app shell as Brain and Notes.

Sidebar:

```text
🧠 Brain
📝 Notes
🎯 Retest
📈 Insights
👤 Profile
```

Retest or Insights should become the active item depending on the page.

Top bar:

```text
KNODES
Search
Notifications
User Avatar
```

---

# 4. RETEST PAGE

# 4.1 Retest Purpose

The Retest Page answers:

> "What knowledge in my Brain needs attention, and can I still recall or explain its structure?"

The page should not feel like a conventional exam.

It should feel like a guided review room.

---

# 5. Retest Home Layout

Desktop:

```text
┌─────────────────────────────────────────────────────────────┐
│ RETEST                                                      │
│ Strengthen what you've learned.                             │
│                                                             │
│  Due Today       At Risk       Healthy                      │
│     8               5             21                        │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Review Queue                                            │ │
│ │                                                         │ │
│ │ JavaScript Hoisting          42% Recall      Review     │ │
│ │ TCP Handshake                58% Recall      Review     │ │
│ │ Normalization                81% Recall      Healthy    │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

# 6. Retest Header

Title:

```text
Retest
```

Subtitle:

```text
Recall the facts. Rebuild the understanding.
```

Optional small status:

```text
8 reviews due
```

Primary CTA:

```text
Start Review
```

Secondary:

```text
Choose a concept
```

---

# 7. Review Queue

The queue is generated from knowledge that is due for review.

Display:

- Concept
- Recall probability
- Review status
- Why it is due
- Optional prerequisite warning

Example:

```text
JavaScript Hoisting

42% recall probability

Needs review
Last reviewed 6 days ago
```

---

# 8. Recall Health Indicator

Reuse the Brain Page indicator language.

Green:

```text
75–100%
Healthy
```

Yellow / Orange:

```text
50–74%
Weakening
```

Red:

```text
0–49%
Needs review
```

The Retest page may show a slightly larger indicator than the Brain node.

Use the same colors and status vocabulary across the application.

---

# 9. Queue Priority

Sort by a combination of system review state and urgency.

Visually prioritize:

1. Concepts below the recall threshold
2. Overdue reviews
3. Concepts with decayed prerequisites
4. Other scheduled reviews

Do not expose the internal decay formula as the primary reason.

Use human language:

```text
Due for review
```

```text
Needs attention
```

```text
Prerequisite needs review first
```

---

# 10. Critical Prerequisite Detour

If a prerequisite is more decayed than the target concept, the user must see a visible detour.

Do NOT silently reorder.

Example:

User selects:

```text
Hoisting
```

But:

```text
Creation Phase
Recall: 34%
Hoisting
Recall: 67%
```

Show:

```text
Before we review Hoisting...

Creation Phase needs attention first.

Why?
Hoisting depends on this concept.

[ Review Creation Phase ]
```

This is a visible educational detour.

After the prerequisite review finishes:

```text
✓ Prerequisite refreshed

Continue to Hoisting
```

---

# 11. Locked Prerequisite Detour

If the prerequisite is a locked node rather than an established concept:

```text
🔒 Missing prerequisite

Hoisting depends on:

Creation Phase

This concept isn't established in your Brain yet.

[ Learn Concept ]
[ Continue Later ]
```

Do not generate a review quiz for a locked node because there is no established learner concept to review.

---

# 12. Concept Selection

The user can manually choose:

```text
Choose a concept to review
```

Search:

```text
Search your knowledge...
```

Filters:

- Needs review
- Healthy
- Recently added
- Weak concepts
- Subject
- Topic

Search result:

```text
Hoisting
42% recall
Needs review
```

---

# 13. Review Modes

Before beginning a review, show a mode selector.

Two primary modes:

## Abstract

Surface / recall-focused review.

## Understand

Structural / mechanism-focused review.

Example:

```text
How do you want to review?

┌───────────────────────┐
│ ⚡ Abstract            │
│ Quick recall          │
│ Best for refreshing   │
│ surface knowledge     │
└───────────────────────┘

┌───────────────────────┐
│ 🧠 Understand          │
│ Rebuild the mechanism │
│ Best for checking     │
│ structural knowledge  │
└───────────────────────┘
```

---

# 14. Abstract Mode

Purpose:

Fast recall.

Question styles:

- Plain fact
- Cloze
- Short recall

Example:

```text
During the creation phase,
var declarations are initialized to ______.
```

Input:

```text
[________________________]
```

CTA:

```text
Check answer
```

---

# 15. Abstract Mode Interaction

Use:

- Focused card
- Large question
- Minimal distractions
- Short answer area
- Progress indicator

Example:

```text
Question 2 of 5

What happens to `var` during creation?

[ text input ]

                  [ Check ]
```

---

# 16. Abstract Mode Feedback

After answer:

Do not just say:

```text
Correct
```

Use:

```text
✓ Recall demonstrated
```

or:

```text
△ Partial recall
```

or:

```text
✗ Recall not demonstrated
```

Keep it supportive.

Do not shame the user.

---

# 17. Abstract Answer States

### Empty answer

```text
Enter an answer first.
```

Do not submit.

### Correct

```text
✓ Recall demonstrated

Your answer matches the expected claim.
```

### Semantically equivalent

If the learner uses different wording but expresses the same idea:

```text
✓ Recall demonstrated
```

Do not penalize wording differences.

### Incorrect

```text
Not quite.

Expected idea:
var is initialized to undefined during creation.
```

### Partially correct

```text
△ Partial recall

You remembered:
Initialization happens during creation.

Missing:
The initial value is `undefined`.
```

Do not expose raw semantic-similarity numbers.

---

# 18. Understand Mode

Purpose:

Test whether the learner can reconstruct a mechanism.

This is the project's central differentiator.

Prompt style:

```text
Explain how JavaScript hoisting works
from the beginning of creation to execution.
```

The learner receives a large text area.

Helper:

```text
Focus on what happens, why it happens,
and how the stages connect.
```

---

# 19. Process Trace Prompt

Use for process-trace concepts.

Example:

```text
Trace the process from:

Source Code
     ↓
Creation
     ↓
Initialization
     ↓
Execution

Explain what changes at each stage.
```

The internal Process Template is never shown as the canonical answer.

The UI should only show the learner the task.

---

# 20. Understand Answer State

During typing:

Show:

```text
Characters: 342
```

Optional helper:

```text
Try to explain the relationships, not just the individual facts.
```

Do not display live grading.

Do not tell the learner:

```text
You have covered 72%.
```

before submission.

---

# 21. Submit Understand Answer

Button:

```text
Evaluate explanation
```

Animation:

```text
Evaluating structure...
```

Use a calm 1–2 second transition.

Do not show a fake "AI thinking" animation that implies the LLM is personally judging the answer.

The project's grader is deterministic.

---

# 22. Understand Result

Use categorical result labels:

```text
FULL
```

```text
SHALLOW
```

```text
INCOMPLETE
```

```text
NOT YET ENGAGED
```

Large result label.

Supporting explanation below.

---

# 23. Full Result

Example:

```text
FULL

You reconstructed the main mechanism
and connected the key steps.

Strong evidence:
✓ Creation phase
✓ var initialization
✓ execution relationship
✓ why the value is available
```

Do not say:

```text
You understand Hoisting 100%.
```

---

# 24. Shallow Result

```text
SHALLOW

You recalled several important facts,
but the relationships between them were incomplete.
```

Then:

```text
Missing structure

△ Why creation precedes execution
△ How initialization affects later access
```

CTA:

```text
Review missing idea
```

---

# 25. Incomplete Result

```text
INCOMPLETE

Some key parts of the mechanism were missing.
```

Show:

```text
Not addressed

• Creation phase
• Initialization state
• Connection to execution
```

If a gap traces to a prerequisite:

```text
This gap may be related to:
Creation Phase
```

Clickable concept.

---

# 26. Not Yet Engaged

Use when the learner does not meaningfully engage with the task.

Example:

```text
NOT YET ENGAGED

This explanation did not yet demonstrate
usable knowledge of the mechanism.
```

Primary CTA:

```text
Learn this concept
```

Secondary:

```text
Try again
```

---

# 27. Gap Report

This is one of the most important feedback components.

Example:

```text
Your explanation

✓ Covered:
Initialization
Creation phase
Execution

Missing:
→ Why initialization happens before execution
→ Effect of changing `var` to `let`
```

Order gaps by importance.

Do not overwhelm the learner.

Start with the most structurally important missing ideas.

---

# 28. Gap-to-Prerequisite Link

If a missing claim traces back to a prerequisite:

```text
Missing:
Why creation precedes execution

This connects to:
→ Creation Phase
```

Clickable.

Opening it should navigate to Brain / Concept Explorer.

---

# 29. Concept Sort Probe

For comparison-style assessment, create a drag-and-drop interface.

Header:

```text
Group these by how you would explain or debug them.
```

Show 5–6 cards.

Example:

```text
var initialization
let TDZ
function declaration
const initialization
```

Clusters:

```text
Same mechanism
Different mechanism
```

Cards are draggable.

---

# 30. Concept Sort Interaction

Drag card:

```text
card lifts
shadow increases
destination highlights
drop
```

Correct placement:

```text
✓
```

Incorrect placement:

Do NOT immediately mark wrong unless the mode is configured for immediate feedback.

Prefer feedback after submission.

---

# 31. Concept Sort Completion

Result:

```text
Your grouping captured the core distinction.
```

or:

```text
Some mechanisms were grouped together too broadly.
```

Keep explanation concise.

---

# 32. Misconception Probe

Use multiple choice.

Example:

```text
Which statement correctly describes
`let` during the creation phase?
```

Options:

```text
A. It is initialized to undefined
B. It remains uninitialized until execution
C. It is removed
D. It behaves exactly like var
```

Wrong choices map internally to documented misconceptions.

After answer:

```text
✓ Correct distinction
```

or:

```text
△ This choice matches a common misconception.
```

---

# 33. Misconception Feedback

Do not expose internal IDs.

Bad:

```text
MISCONCEPTION_ID_17
```

Good:

```text
You may be conflating `var` initialization
with `let` initialization.
```

Provide:

```text
Review the difference
```

---

# 34. Counterfactual / Perturbation Probe

This is an important signature experience.

Prompt:

```text
What changes if `var` is replaced with `let`?

1. What changes?
2. What remains the same?
```

Two answer boxes:

```text
WHAT CHANGES?

[................................]

WHAT STAYS THE SAME?

[................................]
```

---

# 35. Counterfactual Interaction

Display a small mechanism diagram above the prompt.

Example:

```text
Creation
   ↓
Initialization
   ↓
Execution
```

Highlight the changed component:

```text
var → let
```

Use animation:

- selected component glows
- branch changes
- unaffected path remains visually stable

This teaches the learner to reason about causal relationships.

---

# 36. Counterfactual Feedback

Result:

```text
Perturbation evidence

✓ Correctly identified:
Initialization changes

✓ Correctly preserved:
Creation still precedes execution

△ Missed:
The variable remains uninitialized during the relevant period
```

Do not call this:

```text
80% understanding
```

Use:

```text
Strong perturbation evidence
```

or:

```text
Partial perturbation evidence
```

---

# 37. Transfer Probe

Transfer asks the learner to generalize from a taught case to a near or far application.

Display:

```text
You've learned:
JavaScript variable initialization

Now apply the same reasoning to:

[ novel scenario ]
```

Use two visual labels:

```text
NEAR TRANSFER
```

or:

```text
FAR TRANSFER
```

Do not reveal expected relationships.

---

# 38. Transfer Feedback

Example:

```text
Transfer demonstrated

You applied the mechanism to a new case
without relying on the original wording.
```

Or:

```text
Transfer not yet demonstrated

The answer matched the original example
but did not establish the generalized principle.
```

---

# 39. Review Progress

Top progress bar:

```text
3 / 5 concepts
```

For question-level probes:

```text
2 / 4
```

Use small segmented progress.

Do not use a stressful countdown timer unless a future product requirement explicitly adds one.

---

# 40. Pause Review

Top-right:

```text
Pause
```

When clicked:

```text
Review paused

Your progress is saved.

[Resume]
[Exit Review]
```

---

# 41. Exit Review

If answers are already recorded:

```text
Leave this review?

Your completed answers will be saved.
The current unanswered item will be left unfinished.

[Leave]
[Keep reviewing]
```

Do not lose completed evidence.

---

# 42. Review Completion Screen

Use a positive but academically mature finish.

```text
Review complete

You reviewed 5 concepts.

Structural evidence
3 strengthened
1 partial
1 needs another pass
```

Also:

```text
Recall refreshed
4 concepts
```

Secondary:

```text
Concepts still needing attention
Hoisting
Creation Phase
```

Primary:

```text
View Insights
```

Secondary:

```text
Back to Brain
```

---

# 43. Review Completion Animation

Sequence:

1. Progress reaches 100%.
2. Segments resolve.
3. Small graph pulse.
4. Reviewed nodes briefly glow.
5. Recall indicators update.
6. Summary appears.

Keep it under 2–3 seconds.

No excessive confetti.

---

# 44. Recall Update Visualization

After successful review:

Show a small before/after indicator.

Example:

```text
Recall probability

Before   42%
After    78%
```

Use an animated circular ring.

If the system updates half-life:

```text
Half-life
6.2 days → 8.1 days
```

Only show this if the backend actually supplies the values.

---

# 45. Failed Review

Do not punish.

Show:

```text
This concept still needs work.

That's useful evidence — now we know where to focus.
```

Then:

```text
Main gap:
Creation → Execution relationship
```

Actions:

```text
Review gap
Try again later
```

---

# 46. Repeated Failure

If the same concept repeatedly fails:

Show:

```text
This concept is staying difficult.

Consider reviewing its prerequisite first:
Creation Phase
```

Do not say:

```text
You are bad at this.
```

---

# 47. Misconception Persistence

If a misconception continues across attempts:

```text
Recurring misconception

You may be conflating:
var initialization
and
let initialization
```

CTA:

```text
Review distinction
```

This should connect to Insights later.

---

# 48. Retest Empty State

If nothing is due:

```text
You're all caught up.

Your Brain is healthy for now.
```

Then:

```text
Next review
Tomorrow
```

Optional:

```text
Review a concept anyway
```

This allows voluntary practice.

---

# 49. Retest Loading State

Skeleton cards for review queue.

Do not show an empty page during data fetching.

---

# 50. Retest Error State

```text
We couldn't load your review queue.

Your knowledge is safe.

[Try again]
```

Do not fabricate review data.

---

# 51. RETEST MOBILE

Mobile review should use a focused single-card experience.

Top:

```text
2 / 5
```

Center:

```text
Question
```

Bottom:

```text
Answer
```

CTA:

```text
Check
```

Swipe gestures should not be required.

Keyboard accessibility remains available.

---

# 52. INSIGHTS PAGE

# 52.1 Purpose

Insights explains what the learner's evidence is showing over time.

It should answer:

> "What is becoming stronger, what is fading, and where is my understanding becoming more structural?"

This is not a generic productivity analytics page.

---

# 53. Insights Header

```text
Insights
See how your knowledge is changing over time.
```

Top controls:

```text
7D    30D    90D    All time
```

Optional:

```text
Filter by subject
```

---

# 54. Insights Overview

First section:

```text
Knowledge at a glance
```

Cards:

```text
Concepts learned
Concepts needing review
Average recall probability
Current structural level
Misconceptions to revisit
```

Keep these cards compact.

---

# 55. Important Metric Wording

Do NOT use:

```text
Understanding Score
```

as a single dominant number.

Prefer:

```text
Structural Depth
```

```text
Recall Probability
```

```text
Transfer Evidence
```

```text
Misconception Status
```

These are separate forms of evidence.

---

# 56. Recall & Decay Section

Title:

```text
Recall & Decay
```

Display a line chart over time.

X-axis:

```text
Time
```

Y-axis:

```text
Recall probability
```

Example:

```text
100% ──────────╮
               ╲
75%             ╲
                 ╲
50%               ╲
                   ╲
25%                 ╲
                    ╲
0% ─────────────────────
```

Do not overdecorate.

---

# 57. Recall Cards

Show:

```text
Average recall
76%
```

```text
Concepts below threshold
6
```

```text
Reviews due
8
```

```text
Overdue
2
```

```text
Average half-life
8.4 days
```

Only show half-life if it exists in backend data.

---

# 58. Recall Color System

Use the same:

Green:
75–100

Yellow/orange:
50–74

Red:
0–49

The user should learn this visual language once and recognize it everywhere.

---

# 59. Recall Timeline Interaction

Hover a point:

```text
Aug 24

Average recall: 72%

12 concepts reviewed
3 due next
```

Clicking a concept line may open its Concept Explorer.

If only aggregate data is available, do not imply individual concept precision.

---

# 60. Concept Depth Section

This is a centerpiece.

Title:

```text
Concept Depth
```

Subtitle:

```text
How structurally developed your knowledge is.
```

Use a distribution visualization:

```text
Prestructural        ███
Unistructural        █████
Multistructural      ███████
Relational           ████████
Extended Abstract    ███
```

Do not convert this into a fake percentage of understanding.

---

# 61. SOLO Levels

Display five levels:

### Prestructural

No usable structure yet.

### Unistructural

One isolated fact.

### Multistructural

Several facts, but weakly connected.

### Relational

Facts connected into a mechanism.

### Extended Abstract

Generalizes beyond the original case.

These definitions should be available in a small info tooltip.

---

# 62. SOLO Distribution Interaction

Hover:

```text
Relational

27 concepts

+6 this month
```

Click:

```text
View concepts
```

The user can inspect the concepts associated with that level.

---

# 63. Concept Depth Detail

When a concept is selected:

```text
Hoisting
```

Show structural evidence components:

```text
Definition       Strong
Mechanism        Strong
Relationships    Moderate
Contrast         Strong
Boundary         Weak
Application      Moderate
Counterfactual   Weak
```

These are evidence dimensions, not grades of a person's intelligence.

---

# 64. Structural Gap Visualization

Use a radar or horizontal component visualization.

Preferred:

Horizontal bars are easier to read than a flashy radar chart.

Example:

```text
Mechanism
████████░░

Relationships
██████░░░░

Counterfactual
███░░░░░░░
```

---

# 65. Transfer Section

Title:

```text
Transfer
```

Show:

```text
Near transfer
Strong

Far transfer
Developing
```

Explain:

```text
Near transfer
Applying knowledge to a similar but new situation.

Far transfer
Applying the underlying principle in a more distant context.
```

This should be shown through evidence categories, not a single "transfer score" unless the backend explicitly provides one.

---

# 66. Transfer Trend

Chart:

```text
Near transfer
   ↗

Far transfer
   ↗ slowly
```

Allow timeframe control.

Empty state:

```text
Not enough transfer evidence yet.

Complete more application and transfer probes.
```

---

# 67. Misconceptions Section

Title:

```text
Misconceptions
```

Show three counts:

```text
Active
5

Resolved
12

Recurring
2
```

Then list:

```text
var / let initialization
Recurring
4 occurrences

TCP vs UDP behavior
Resolved
3 occurrences

Normalization vs denormalization
Active
2 occurrences
```

---

# 68. Misconception Detail

Clicking one opens a panel:

```text
var / let initialization

Status:
Recurring

First detected:
Aug 18

Latest detection:
Aug 29

Affected concepts:
Hoisting
Scope
TDZ

Recent evidence:
Detected in 2 of the last 4 relevant probes.
```

Do not expose raw internal classifier IDs.

---

# 69. Misconception Resolution

When later evidence indicates the misconception has been refuted:

```text
✓ Refuted in recent review

You correctly distinguished:
var initialization
from
let initialization
```

This should appear in a capability timeline.

---

# 70. Capability / Refutation Log

Create a section:

```text
Demonstrated capabilities
```

Examples:

```text
✓ Distinguishes TDZ from function hoisting
✓ Explains creation → execution transition
✓ Applies variable initialization rules to new code
△ Can explain mechanism but struggles with perturbations
```

This reflects the project's cognitive telemetry concept.

---

# 71. Knowledge Growth

Section:

```text
Your Brain over time
```

Show:

```text
Concepts
↗

Connections
↗

Claims
↗
```

Use a single combined chart if readable.

Do not make five different charts when one tells the story better.

---

# 72. Knowledge Graph Growth

Optional visualization:

```text
Nodes created
Connections created
```

The graph should visually become denser over time.

Tooltip:

```text
Aug 29
+8 concepts
+19 connections
```

Only show metrics that the backend provides.

---

# 73. Review Adherence

Display:

```text
Review adherence

████████░░ 82%
```

Meaning:

Percentage of scheduled reviews completed in the selected period.

Use supportive copy:

```text
You're keeping most scheduled reviews on track.
```

---

# 74. Weak Areas

Create a useful action-oriented panel:

```text
Needs attention
```

Example:

```text
🔴 Hoisting
Recall 42%
Counterfactual evidence weak

🟠 TCP Handshake
Recall 61%
Process trace incomplete

🟠 Normalization
Recall 53%
Boundary evidence weak
```

Each item:

```text
Review
```

or:

```text
Explore
```

---

# 75. Strong Areas

Optional panel:

```text
Growing strong
```

Example:

```text
🟢 Data Structures
Relational
Strong transfer evidence

🟢 HTTP Methods
Extended Abstract
```

Avoid turning Insights into a leaderboard.

The learner is competing with forgetting, not other users.

---

# 76. Concept-Level Insight Card

Every concept can have:

```text
Concept
Hoisting

Recall
42% 🔴

SOLO
Relational

Weakest evidence
Counterfactual

Next action
Review
```

Click opens the Brain Concept Explorer.

---

# 77. Insights Empty States

## New user

```text
Your insights will appear here as your Brain grows.

Start by adding notes and completing your first review.
```

## No review data

```text
Not enough review evidence yet.
```

## No misconceptions

```text
No recurring misconceptions detected.
```

## No transfer data

```text
Transfer evidence will appear after application and transfer probes.
```

Do not show fake zero-value graphs if the user has no meaningful data.

---

# 78. Insights Loading State

Use chart skeletons.

Cards:

```text
████████
████
```

Do not animate every skeleton aggressively.

---

# 79. Insights Error State

```text
We couldn't load your insights.

Your knowledge is safe.

[Try again]
```

---

# 80. Time Range Selector

Options:

```text
7 days
30 days
90 days
All time
```

Use active green underline/background.

Charts should update with a smooth transition.

---

# 81. Subject Filter

Dropdown:

```text
All subjects
Computer Science
Networking
Databases
Programming
```

If the learner has no subjects:

```text
All knowledge
```

---

# 82. Insights Animation Language

Use data-driven motion:

- Bars grow into place
- Line chart draws in
- Recall rings animate from previous value
- SOLO distribution transitions smoothly
- Misconception status changes with subtle checkmark
- Concept card appears with a slight upward fade

Avoid random floating animations.

---

# 83. Review Result → Insights Connection

After a Retest completion:

Insights should update.

Examples:

```text
Recall refreshed
```

```text
Structural evidence strengthened
```

```text
Misconception refuted
```

The user should feel that reviews actually change the state of their Brain.

---

# 84. Brain → Retest Connection

When clicking a weak node in Brain:

```text
42% recall

Needs review
```

CTA:

```text
Retest this concept
```

This should open Retest with the concept already selected.

---

# 85. Insights → Retest Connection

Weak concept card:

```text
Hoisting
42% recall
```

CTA:

```text
Review now
```

This creates a direct loop:

```text
Brain
 ↓
Retest
 ↓
Insights
 ↓
Brain
```

---

# 86. Accessibility

Never rely only on:

- Green
- Yellow
- Red

Use labels/icons:

```text
✓ Healthy
△ Weakening
! Needs review
```

Charts need accessible summaries.

Keyboard navigation.

Visible focus states.

Screen-reader-friendly labels.

Drag/drop concept sort must have keyboard alternatives.

---

# 87. Reduced Motion

When reduced motion is requested:

- Remove graph movement
- Disable chart drawing animations
- Replace node transitions with fades
- Keep state changes clearly visible

---

# 88. Responsive Design

## Desktop

Use split layouts and spacious cards.

## Tablet

Collapse secondary side panels.

## Mobile

Retest:

Single focused question.

Insights:

Vertical card stack.

Charts become horizontally scrollable when needed.

---

# 89. Mobile Retest Navigation

Top:

```text
← Retest
```

Question:

```text
2 / 5
```

Bottom fixed CTA:

```text
Check answer
```

Avoid sidebars.

---

# 90. Mobile Insights

Order:

```text
Overview
↓
Recall
↓
Concept Depth
↓
Transfer
↓
Misconceptions
↓
Weak Areas
```

This ensures the important information is seen first.

---

# 91. Design System

Use the same global KNODES design system.

Primary:

```text
#58CC02
```

Secondary:

```text
#1CB0F6
```

Warning:

```text
#FF9600
```

Danger:

```text
#FF4B4B
```

Background:

```text
#F7F7F7
```

Dark:

```text
#111827
```

Text:

```text
#374151
```

Use green as a positive action/progress color, not as decoration everywhere.

---

# 92. Typography

Use:

- Inter
- Geist

Sizes:

Page title:
28–34px

Section:
18–22px

Body:
14–16px

Metadata:
12–13px

Question text:
24–34px depending on viewport

Answer text:
16px

---

# 93. Card Design

Cards:

- 12–20px radius
- Thin neutral border
- Very subtle shadow
- Spacious padding
- Clear hierarchy

Avoid excessive glassmorphism.

Avoid excessive gradients.

---

# 94. Result State Vocabulary

Use consistent state language across the product.

```text
Healthy
Weakening
Needs Review

Full
Shallow
Incomplete
Not Yet Engaged

Strong Evidence
Developing Evidence
Partial Evidence
Not Yet Demonstrated
```

Do not randomly invent synonyms on different screens.

---

# 95. Privacy of Internal Grading

Do not show:

- Internal grader IDs
- Prompt text
- LLM generation details
- Raw embeddings
- Vector similarity values
- Internal scoring formula by default
- Branch leakage numeric penalties
- Verbatim penalty numeric values

The learner needs meaningful feedback, not implementation details.

---

# 96. Technical-to-Human Translation

Internal:

```text
coverage
```

Learner-facing:

```text
Key ideas covered
```

Internal:

```text
ordering
```

Learner-facing:

```text
Mechanism sequence
```

Internal:

```text
precision
```

Learner-facing:

```text
Relevant explanation
```

Internal:

```text
branch leakage
```

Learner-facing:

```text
You may be mixing related mechanisms
```

Internal:

```text
semantic matching
```

Learner-facing:

```text
Your explanation expresses the expected idea
```

---

# 97. Deterministic Grading Principle

The UI should communicate:

```text
Your response was evaluated against
the structure expected for this concept.
```

Avoid:

```text
AI thinks your answer is...
```

The project intentionally separates knowledge extraction from deterministic assessment.

---

# 98. Review Session Component Tree

Create reusable components:

```text
RetestPage
ReviewQueue
ReviewQueueItem
ReviewModeSelector
ReviewSession
ReviewProgress
ProbeCard

AbstractProbe
RecallInput
RecallFeedback

UnderstandProbe
ExplanationEditor
StructuralResult
GapReport

ConceptSortProbe
SortableSnippet
ClusterArea

MisconceptionProbe
AnswerOption
MisconceptionFeedback

CounterfactualProbe
ChangeInput
InvariantInput
PerturbationFeedback

TransferProbe
TransferContext

ReviewComplete
ReviewPaused
ReviewError
PrerequisiteDetour
LockedPrerequisite
```

---

# 99. Insights Component Tree

```text
InsightsPage
InsightsHeader
TimeRangeSelector
SubjectFilter

InsightOverview
RecallCard
ReviewDueCard
DepthCard
MisconceptionCard

RecallDecayChart
ConceptDepthDistribution
ConceptDepthDetail
TransferSection
TransferTrend

MisconceptionOverview
MisconceptionItem
MisconceptionDetail
CapabilityLog

GrowthChart
ReviewAdherence
NeedsAttention
StrongAreas

InsightEmptyState
InsightLoadingState
InsightErrorState
```

---

# 100. Figma Prototype Screens — Retest

Create these variants:

## Retest 01
Review Queue — Healthy + Due Items

## Retest 02
Review Queue — Nothing Due

## Retest 03
Choose Concept

## Retest 04
Prerequisite Detour

## Retest 05
Locked Prerequisite

## Retest 06
Mode Selection

## Retest 07
Abstract Probe

## Retest 08
Abstract — Correct

## Retest 09
Abstract — Partial

## Retest 10
Abstract — Incorrect

## Retest 11
Understand Probe

## Retest 12
Understand — Full

## Retest 13
Understand — Shallow

## Retest 14
Understand — Incomplete

## Retest 15
Understand — Not Yet Engaged

## Retest 16
Concept Sort

## Retest 17
Misconception Probe

## Retest 18
Counterfactual Probe

## Retest 19
Transfer Probe

## Retest 20
Review Complete

## Retest 21
Review Paused

## Retest 22
Review Error

## Retest 23
Mobile Review

---

# 101. Figma Prototype Screens — Insights

Create:

## Insights 01
Overview

## Insights 02
Recall & Decay

## Insights 03
Concept Depth

## Insights 04
Concept Depth Detail

## Insights 05
Transfer

## Insights 06
Misconceptions

## Insights 07
Misconception Detail

## Insights 08
Demonstrated Capabilities

## Insights 09
Knowledge Growth

## Insights 10
Needs Attention

## Insights 11
Empty State

## Insights 12
Loading State

## Insights 13
Error State

## Insights 14
Mobile Insights

---

# 102. Demo Scenario

Use one consistent concept for the prototype:

```text
JavaScript Hoisting
```

Related concepts:

```text
Creation Phase
Execution Phase
var
let
const
Temporal Dead Zone
```

This makes the Retest and Insights prototypes visually connect to the Brain Page.

---

# 103. Complete Prototype Story

A strong Figma prototype should demonstrate this flow:

```text
Brain
 ↓
Click weak node
 ↓
Retest this concept
 ↓
Prerequisite warning
 ↓
Review prerequisite
 ↓
Return to target concept
 ↓
Select Understand mode
 ↓
Explain mechanism
 ↓
Receive structural result
 ↓
See missing gap
 ↓
Complete counterfactual probe
 ↓
Review complete
 ↓
Open Insights
 ↓
Recall improves
 ↓
Structural evidence improves
 ↓
Misconception is updated
 ↓
Return to Brain
```

This should feel like one continuous product rather than disconnected screens.

---

# 104. Important Edge Cases

The prototype must represent:

- No reviews due
- One review due
- Many reviews due
- User chooses an optional review
- Prerequisite more decayed than target
- Locked prerequisite
- Empty answer
- Very short answer
- Long explanation
- Semantically equivalent answer
- Partially correct answer
- Incorrect answer
- Mixed mechanisms
- Branch leakage
- Missing transition explanation
- Repeated misconception
- Refuted misconception
- No transfer evidence
- Insufficient evidence
- Review interrupted
- Review resumed
- Review request failure
- Insight data unavailable
- No historical data
- Mobile layout
- Reduced-motion mode

---

# 105. "Not Enough Evidence" State

This is important.

Never infer mastery from absence of data.

Use:

```text
Not enough evidence yet
```

instead of:

```text
Weak understanding
```

when the system simply has not collected enough relevant evidence.

This distinction prevents the UI from claiming something the evidence does not establish.

---

# 106. No Evidence vs Poor Evidence

Separate:

## No evidence

```text
Not yet engaged
```

Meaning:

Not enough demonstrated evidence.

## Poor evidence

```text
Incomplete
```

Meaning:

The learner attempted the task, but important structural elements were missing.

## Mixed evidence

```text
Shallow
```

Meaning:

Facts were present but relationships/mechanisms were not sufficiently established.

## Strong evidence

```text
Full
```

Meaning:

The available evidence supports a strong structural explanation.

---

# 107. Advanced Feedback Drawer

Optional expandable section:

```text
How was this evaluated?
```

Only show if the learner wants detail.

Example:

```text
Key ideas covered
Mechanism order
Relevant explanation
Relationship evidence
```

Do not show raw mathematical equations by default.

---

# 108. Review Session Tone

Tone should be:

- Encouraging
- Calm
- Intelligent
- Serious enough for academic learning
- Never childish

Duolingo's color language can be reused without making the whole product look like a children's game.

---

# 109. Gamification Boundaries

Use:

- Small streak indicator
- Positive completion animation
- Progress indicators
- Capability milestones

Avoid:

- Leaderboards
- Hearts/lives
- Punishment animations
- Excessive confetti
- Fake XP economy
- Loud sound-oriented reward UI

The project's value is understanding, not gamified points.

---

# 110. Final Design Principle

Retest should answer:

> "Can I still recall this?"

Then go one level deeper:

> "Can I explain how it works?"

Then deeper:

> "Do I know what changes when the mechanism changes?"

Insights should answer:

> "What is my evidence telling me over time?"

The full product loop is:

```text
KNOWLEDGE
   ↓
RECALL
   ↓
UNDERSTANDING
   ↓
PERTURBATION
   ↓
TRANSFER
   ↓
INSIGHT
   ↓
REVIEW
   ↺
```

---

# 111. Figma AI Final Instruction

Design Retest as a focused, intelligent learning environment rather than a traditional quiz application.

Design Insights as an evidence dashboard rather than a simplistic score dashboard.

The interface must preserve the project's distinction between:

- surface recall
- structural explanation
- process understanding
- counterfactual reasoning
- misconception detection
- transfer

Use the same KNODES visual identity as Brain and Notes.

Prioritize clarity over decoration.

Make weak areas actionable.

Make feedback explain what was demonstrated and what remains missing.

Never tell the learner that a concept is "78% understood" as the primary truth.

Use structural evidence, categorical results, recall probability, and specific missing evidence.

The emotional goal is:

> "KNODES doesn't just tell me whether I got an answer right. It shows me what part of my understanding is actually present — and what I should strengthen next."
