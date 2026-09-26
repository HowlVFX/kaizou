# KNODES — Master Design Specification
## Master Figma AI Context File
### File: `00-KNODES-Master-Design.md`

---

# 0. PURPOSE OF THIS FILE

This is the master design/context document for the KNODES web application.

Use this file together with the page-specific Markdown files:

```text
00-KNODES-Master-Design.md
01-Brain-Page.md
02-Notes-Page.md
03-Retest-and-Insights.md
04-Landing-Page-and-Profile.md
```

The purpose of this file is to give Figma AI one high-level source of truth for:

- What KNODES is
- What the product is trying to accomplish
- What every page is responsible for
- How pages connect to each other
- What visual language the whole application uses
- What interaction patterns should be shared
- What must stay consistent across all screens
- What the end-to-end user workflow looks like
- What should and should not be designed

The individual page files contain the detailed component-level specifications.

This master file should be uploaded with the other files so the generated prototype feels like one coherent product instead of unrelated screens.

---

# 1. PRODUCT IDENTITY

## Product Name

```text
KNODES
```

## Core idea

KNODES is a knowledge-learning application that turns a learner's notes into structured, connected knowledge.

The system is centered around a knowledge graph.

The learner:

```text
Writes notes
    ↓
Knowledge is structured
    ↓
Concepts and claims are extracted
    ↓
Relationships and prerequisites are mapped
    ↓
The learner's Brain becomes a connected graph
    ↓
Knowledge is reviewed
    ↓
Structural understanding is assessed
    ↓
Insights show what is strong, fading, missing, or developing
```

The product is not simply:

```text
Notes app
```

and not simply:

```text
Quiz app
```

It combines:

```text
Knowledge capture
+
Knowledge graph
+
Memory / recall
+
Structural understanding
+
Assessment
+
Learning insights
```

---

# 2. CORE PRODUCT STATEMENT

Primary product statement:

```text
Build Understanding, Not Just Notes.
```

Alternative supporting line:

```text
Your knowledge, connected.
```

The design should make the product's difference immediately understandable.

The learner should feel:

> "I write something once, and KNODES turns it into a connected model that I can explore, review, and test."

---

# 3. PROJECT PHILOSOPHY

The underlying project distinguishes:

```text
Recall
≠
Understanding
```

Knowing an isolated fact is not necessarily evidence of knowing the mechanism or relationships behind that fact.

Therefore the product should collect different types of evidence:

- Recall
- Application
- Comparison
- Process trace
- Counterfactual / perturbation
- Misconception detection
- Transfer

The design must preserve this distinction.

Do not turn every learning outcome into one simplistic percentage.

---

# 4. STRUCTURAL UNDERSTANDING

KNODES uses structural evidence as a core concept.

A learner may know:

```text
Fact A
Fact B
Fact C
```

without understanding:

```text
A → causes → B
B → leads to → C
```

The interface should therefore visualize:

- Concepts
- Claims
- Relationships
- Prerequisites
- Mechanisms
- Boundaries
- Contrasts
- Applications
- Counterfactual evidence
- Transfer evidence

---

# 5. SOLO-STYLE CONCEPT DEPTH

The project uses structural levels associated with SOLO:

```text
Prestructural
Unistructural
Multistructural
Relational
Extended Abstract
```

Meaning:

## Prestructural

No usable structure yet.

## Unistructural

One isolated fact or idea.

## Multistructural

Several facts, but weakly connected.

## Relational

Facts connected into a meaningful mechanism or structure.

## Extended Abstract

The learner can generalize beyond the original case.

These should be displayed as categorical structural evidence.

Do not replace them with a fake numeric "understanding score."

---

# 6. CORE SYSTEM MENTAL MODEL

The product can be understood as four major pipelines:

```text
INGESTION
    ↓
KNOWLEDGE STRUCTURE
    ↓
DECAY / REVIEW
    ↓
COGNITIVE EVIDENCE
```

The proposal explicitly describes:

```text
Ingestion
→ Linking
→ Decay / Review
→ Cognitive Telemetry
```

The interface turns the outputs of those processes into the user's experience.

---

# 7. PIPELINE 1 — INGESTION

The learner writes a note.

Conceptual flow:

```text
Note
 ↓
LLM extraction
 ↓
Concepts
 ↓
Claims / key statements
 ↓
Prerequisites
 ↓
Structured knowledge
```

The Notes Page is responsible for presenting this transformation.

The original note remains the user's source material.

The structured representation is generated separately.

---

# 8. PIPELINE 2 — KNOWLEDGE LINKING

The system maps knowledge into a graph.

Important relationship types include:

```text
Explicit / Wikilink
Semantic relationship
REQUIRES / Prerequisite
```

Example:

```text
Hoisting
    ↓ REQUIRES
Creation Phase
```

The Brain Page is responsible for making these relationships visible.

---

# 9. MISSING PREREQUISITE MODEL

A prerequisite identified by the system may not already exist as an established concept.

Example:

```text
Hoisting
    ↓ REQUIRES
🔒 Creation Phase
```

The locked node means:

```text
The system identified this as a prerequisite,
but the concept is not yet established in the learner's Brain.
```

This must be presented carefully.

Use:

```text
KNODES identified this as a prerequisite.
```

Do not state it as absolute ground truth.

The user can later create/learn the missing concept.

Once established:

```text
Hoisting
    ↓ REQUIRES
Creation Phase
```

The locked representation becomes a normal concept node.

---

# 10. PIPELINE 3 — DECAY / REVIEW

The system tracks recall probability over time.

The Brain Page represents this as a small recall-health indicator on each established node.

Global visual language:

```text
75–100%
Green
Healthy

50–74%
Yellow / Orange
Weakening

0–49%
Red
Needs Review
```

The same status language must be used across:

- Brain
- Retest
- Insights

Do not invent different colors for the same meaning on different pages.

---

# 11. HALF-LIFE / RECALL EXPERIENCE

The recall indicator is intentionally small.

On the Brain node:

```text
○
```

Position:

```text
Top-right of node
```

Hover reveals:

```text
Recall Probability
42%

Needs Review

Last reviewed:
5 days ago

Half-life:
7.3 days
```

Clicking may open the concept panel focused on memory state.

Do not make the Brain graph look like a collection of progress bars.

The indicator is secondary to the concept itself.

---

# 12. PIPELINE 4 — COGNITIVE EVIDENCE

The system records learning evidence through assessment.

The relevant evidence may include:

```text
SOLO level
Transfer
Misconceptions
Recall
Process-trace performance
Counterfactual performance
Concept-sort evidence
```

This feeds Retest and Insights.

---

# 13. GLOBAL PRODUCT LOOP

The entire application should feel like one continuous loop:

```text
LANDING
   ↓
SIGN UP / LOGIN
   ↓
BRAIN
   ↓
NOTES
   ↓
KNOWLEDGE EXTRACTION
   ↓
BRAIN UPDATED
   ↓
RETEST
   ↓
EVIDENCE COLLECTED
   ↓
INSIGHTS
   ↓
BRAIN
   ↺
```

Profile sits alongside this loop as the account/control area.

---

# 14. PAGE RESPONSIBILITIES

Each page has one clear purpose.

---

# 15. FILE 01 — BRAIN PAGE

Filename:

```text
01-Brain-Page.md
```

Purpose:

```text
The learner's living knowledge graph.
```

Primary responsibility:

- Visualize knowledge
- Show concepts
- Show connections
- Show prerequisites
- Show recall state
- Let the user explore a concept
- Let the user move to Retest
- Let the user open source notes
- Let the user discover missing prerequisites

Hero component:

```text
3D Knowledge Graph
```

The graph should dominate the screen.

Key interaction:

```text
Click node
→
Concept Explorer
```

The Brain Page is not a statistics dashboard.

---

# 16. FILE 02 — NOTES PAGE

Filename:

```text
02-Notes-Page.md
```

Purpose:

```text
Turn raw learner notes into structured knowledge.
```

Primary responsibility:

- Write Markdown
- Save notes
- Autosave drafts
- Import content
- Trigger knowledge ingestion
- Show extraction progress
- Show concepts discovered
- Show claims/statements structured
- Show prerequisite mapping
- Show relationship building
- Handle extraction edge cases
- Return the user to Brain

Signature interaction:

```text
SAVE TO BRAIN
```

then:

```text
Note saved
→
Concepts extracted
→
Claims structured
→
Prerequisites identified
→
Connections built
→
Brain updated
```

The Notes Page should feel like a transformation workspace.

---

# 17. FILE 03 — RETEST AND INSIGHTS

Filename:

```text
03-Retest-and-Insights.md
```

Purpose:

```text
Retest knowledge and visualize learning evidence.
```

Retest responsibility:

- Review queue
- Due knowledge
- Recall-focused review
- Understanding-focused review
- Process explanation
- Counterfactual reasoning
- Concept sorting
- Misconception probes
- Transfer
- Prerequisite detours
- Feedback
- Gap reports
- Review completion

Insights responsibility:

- Recall trends
- Decay
- Concept Depth
- SOLO distribution
- Transfer evidence
- Misconceptions
- Demonstrated capabilities
- Review adherence
- Knowledge growth
- Needs-attention concepts

The two areas are related because:

```text
Retest creates evidence.
Insights explains evidence.
```

---

# 18. FILE 04 — LANDING PAGE AND PROFILE

Filename:

```text
04-Landing-Page-and-Profile.md
```

Purpose:

Public introduction + account experience.

Landing Page:

- Explain KNODES
- Show product vision
- Preview the 3D graph
- Explain note → knowledge → graph → retest → insights
- Convert visitors into users

Authentication:

- Login
- Signup
- Validation
- Loading
- Error
- Success
- Navigation into Brain

Profile:

- Identity
- Avatar
- Basic account information
- Personal knowledge snapshot
- Appearance
- Learning preferences
- Account settings
- Sign out

Profile must remain lightweight.

It should not duplicate Insights.

---

# 19. AUTHENTICATED APP TOP BAR

This is a critical global design rule.

Inside the main web application:

```text
TOP BAR = KNODES LOGO / WORDMARK ONLY
```

Nothing else.

No:

```text
Search
Notifications
Settings
Avatar
Breadcrumbs
Buttons
```

Keep the top bar extremely clean.

Example:

```text
┌───────────────────────────────────────────────────────────┐
│ KNODES                                                    │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

Navigation belongs elsewhere.

---

# 20. SIDEBAR NAVIGATION

The primary authenticated navigation is:

```text
🧠 Brain
📝 Notes
🎯 Retest
📈 Insights
👤 Profile
```

The sidebar should be consistent across all authenticated pages.

Brain, Notes, Retest, Insights, and Profile use the same icon positions, spacing, typography, and active-state behavior.

---

# 21. SIDEBAR BEHAVIOR

Desktop:

```text
80–88px collapsed
220–240px expanded
```

Mobile:

Use bottom navigation.

```text
Brain | Notes | Retest | Insights | Profile
```

Tablet:

Use compact sidebar or expandable sidebar.

---

# 22. ACTIVE NAVIGATION

Active page:

- Green accent
- Soft green background
- Strong text/icon contrast
- Minimal motion
- No excessive borders

Inactive:

- Neutral
- Quiet
- Readable

The sidebar must not compete with the Brain graph or Retest question.

---

# 23. GLOBAL COLOR SYSTEM

Primary:

```text
#58CC02
```

Use for:

- Primary CTA
- Active navigation
- Positive progress
- Healthy states

Secondary blue:

```text
#1CB0F6
```

Use for:

- Informational accents
- Secondary visual cues
- Links where appropriate

Warning:

```text
#FF9600
```

Use for:

- Weakening
- Attention needed
- Non-critical warnings

Danger:

```text
#FF4B4B
```

Use for:

- Needs review
- Errors
- Destructive actions

Light background:

```text
#F7F7F7
```

Dark background:

```text
#111827
```

Primary text:

```text
#374151
```

---

# 24. COLOR SEMANTICS

The same meaning must always use the same visual language.

```text
Green
Healthy / completed / successful

Orange
Weakening / attention

Red
Needs review / error

Blue
Information / secondary action

Gray
Inactive / unavailable / neutral
```

Do not use red simply because something is important.

Do not use green as decoration everywhere.

---

# 25. RECALL COLOR LANGUAGE

Global:

```text
75–100%
→ Green
→ Healthy

50–74%
→ Orange / Yellow
→ Weakening

0–49%
→ Red
→ Needs Review
```

Always include a textual status or icon.

Never rely only on color.

---

# 26. TYPOGRAPHY

Preferred fonts:

```text
Inter
```

or:

```text
Geist
```

Style:

- Clean
- Modern
- Highly readable
- Minimal
- Academic

Avoid:

- Decorative fonts
- Excessively rounded playful fonts
- Heavy display typography everywhere

---

# 27. TYPOGRAPHIC HIERARCHY

Application title:

```text
28–34px
```

Section heading:

```text
18–24px
```

Body:

```text
14–16px
```

Metadata:

```text
12–13px
```

Marketing hero:

```text
48–72px desktop
```

Mobile hero:

```text
32–40px
```

Retest question:

```text
24–34px
```

---

# 28. SPACING SYSTEM

Use consistent spacing:

```text
4px
8px
12px
16px
20px
24px
32px
48px
64px
```

Do not invent arbitrary spacing on individual pages.

Use whitespace as a design element.

---

# 29. BORDER RADIUS

Use:

```text
8px
12px
16px
20px
24px
```

Typical cards:

```text
16px
```

Large panels:

```text
20–24px
```

Do not turn everything into pills.

---

# 30. BUTTON SYSTEM

Primary:

```text
Green filled
```

Secondary:

```text
Neutral outlined / soft
```

Tertiary:

```text
Text action
```

Danger:

```text
Red
```

Typical height:

```text
40–48px
```

Buttons should use precise verbs.

Good:

```text
Save to Brain
Retest
View in Brain
Review now
Create Account
```

Avoid vague:

```text
Submit
Continue
Action
Proceed
```

unless context makes the action obvious.

---

# 31. DRAWER / PANEL SYSTEM

Concept Explorer:

```text
400–460px desktop
```

Use:

- Rounded corners
- Soft border
- Subtle shadow
- Clear close button
- Sticky header
- Scrollable content

On mobile:

```text
Bottom sheet or full-screen panel
```

The selected object should remain visually connected to the panel when possible.

---

# 32. CARD DESIGN

Cards should feel lightweight.

Use:

- Thin borders
- Subtle shadow
- Generous padding
- Clear hierarchy
- Moderate radius

Avoid:

- Heavy gradients
- Excessive glassmorphism
- Huge shadows
- Overly decorative UI

---

# 33. GRAPH VISUAL LANGUAGE

The Brain graph is the most distinctive visual system in KNODES.

Default:

```text
3D force-directed graph
```

Concept:

```text
Circle node
```

Relationship:

```text
Edge
```

Prerequisite:

```text
Directional edge
```

Locked prerequisite:

```text
Muted node + lock + dashed edge
```

---

# 34. GRAPH MOTION

The 3D graph may have subtle movement.

Movement should communicate:

```text
The Brain is alive.
```

But avoid:

- Constant rapid rotation
- Camera spinning
- Excessive particles
- Strong motion sickness
- Distracting neon effects

Respect reduced motion.

---

# 35. GRAPH INTERACTIONS

Core interactions:

```text
Hover
Click
Search
Filter
Zoom
Pan
Rotate
Focus
Reset
Fullscreen
```

Hover:

- Highlight node
- Highlight direct relationships
- Reduce unrelated node opacity

Click:

- Open Concept Explorer

Focus:

- Show local neighborhood
- De-emphasize distant/unrelated concepts

---

# 36. GRAPH SEARCH

Search should work consistently with the rest of the application.

Placeholder:

```text
Search your knowledge...
```

Potential matches:

- Concepts
- Notes
- Claims
- Related knowledge

When searching:

```text
matching nodes = prominent
non-matching nodes = low opacity
```

Camera gently centers on a strong match.

---

# 37. CONCEPT EXPLORER

Shared concept detail component.

Used primarily from:

```text
Brain
```

May be reached from:

```text
Retest
Insights
```

Contains:

```text
Concept title
Recall state
Summary
Claims
Concept Depth
SOLO
Prerequisites
Related Concepts
Process
Assessment evidence
Source
```

Order:

```text
Header
↓
Recall
↓
Summary
↓
Claims
↓
Concept Depth
↓
SOLO
↓
Prerequisites
↓
Related Concepts
↓
Process
↓
Recent Evidence
↓
Source
```

---

# 38. NOTE-TO-BRAIN TRANSFORMATION

This is a central visual concept.

The product should make this transformation understandable:

```text
MESSY NOTE
      ↓
KNODES
      ↓
STRUCTURED KNOWLEDGE
      ↓
CONNECTED BRAIN
```

The Notes Page is where this transformation is animated.

The Brain Page is where the final structure is explored.

---

# 39. EXTRACTION ANIMATION LANGUAGE

Use stages:

```text
Note saved
↓
Analyzing
↓
Concepts extracted
↓
Claims structured
↓
Prerequisites mapped
↓
Connections built
↓
Brain updated
```

Completed step:

```text
✓
```

Current step:

```text
● animated
```

Future step:

```text
○
```

Animation should be meaningful rather than decorative.

---

# 40. EXTRACTION VISUALIZATION

During processing:

A miniature graph can appear.

Start:

```text
●
```

Then:

```text
●──●
```

Then:

```text
   ●
  /
 ●──●
  \
   ●
```

Finally:

```text
Structured knowledge graph
```

This animation should reinforce the product's main story.

---

# 41. INVALID / INCOMPLETE NOTE HANDLING

Never punish the learner for messy notes.

Possible states:

```text
Structured
Incomplete
Ambiguous
Skipped
Partially structured
Failed
```

Preferred language:

```text
This statement didn't contain enough information
to establish a useful knowledge claim.
```

Avoid:

```text
Invalid input.
```

Always preserve the original note.

---

# 42. AUTOMATED VALIDATION PRINCIPLE

The product may show:

```text
Checking extracted statements...
```

but the learner should not be turned into a manual claim-certification system.

Do not create:

```text
Approve claim
Reject claim
Accept extraction
Verify statement
```

as a required normal workflow.

The original note is the source.

The structured representation is generated by the system.

---

# 43. RETEST DESIGN PRINCIPLE

Retest is not a normal quiz.

It should feel like:

```text
A guided investigation of what the learner can demonstrate.
```

Primary modes:

```text
Abstract
Understand
```

---

# 44. ABSTRACT MODE

Fast surface recall.

Examples:

- Cloze
- Plain fact
- Short recall

UI:

```text
Question
↓
Input
↓
Check answer
↓
Recall evidence
```

---

# 45. UNDERSTAND MODE

Structural explanation.

The learner may need to:

- Explain a mechanism
- Trace a process
- Connect steps
- Explain causal relationships
- Describe why something happens

UI:

```text
Prompt
↓
Large explanation editor
↓
Evaluate explanation
↓
Structural result
↓
Gap report
```

---

# 46. UNDERSTAND RESULT VOCABULARY

Use:

```text
FULL
SHALLOW
INCOMPLETE
NOT YET ENGAGED
```

Do not use:

```text
Understanding = 83%
```

These labels represent the available structural evidence.

---

# 47. GAP REPORT

After structural assessment:

```text
Strong evidence:
✓ Creation phase
✓ Initialization

Missing:
△ Relationship to execution
△ Effect of changing var to let
```

If a missing idea traces to a prerequisite:

```text
This may connect to:
Creation Phase
```

Clickable.

---

# 48. COUNTERFACTUAL DESIGN

Counterfactual testing should visibly alter one element of a mechanism.

Prompt:

```text
What changes if X changes?
What stays the same?
```

Two fields:

```text
WHAT CHANGES?

WHAT STAYS THE SAME?
```

Show the relevant mechanism above the prompt.

The altered element should be visually highlighted.

---

# 49. MISCONCEPTION DESIGN

Misconception probes should not shame the user.

Instead:

```text
This choice may indicate a common confusion
between X and Y.
```

Use:

```text
Review distinction
```

instead of:

```text
Wrong!
```

---

# 50. TRANSFER DESIGN

Transfer asks the user to use a learned principle in a new case.

Distinguish:

```text
Near Transfer
```

and:

```text
Far Transfer
```

Use evidence language.

Example:

```text
Transfer demonstrated.
```

or:

```text
Transfer not yet demonstrated.
```

---

# 51. PREREQUISITE DETOUR

Critical rule:

If a prerequisite is more decayed than the target concept, the detour must be visible.

Example:

```text
You selected:
Hoisting

Before we continue:

Creation Phase needs review first.

[ Review Creation Phase ]
```

Do not silently reorder the review.

---

# 52. INSIGHTS DESIGN PRINCIPLE

Insights should explain evidence, not produce a giant score.

Primary sections:

```text
Recall & Decay
Concept Depth
Transfer
Misconceptions
Demonstrated Capabilities
Knowledge Growth
Needs Attention
```

---

# 53. RECALL INSIGHTS

Show:

```text
Average recall probability
Concepts below threshold
Reviews due
Reviews overdue
Average half-life
Recall trend
```

Only show metrics that actually exist in the backend.

Do not fabricate data.

---

# 54. CONCEPT DEPTH INSIGHTS

Show distribution:

```text
Prestructural
Unistructural
Multistructural
Relational
Extended Abstract
```

Then show detailed evidence components.

The UI should explain:

```text
What structural evidence exists?
What is missing?
```

---

# 55. MISCONCEPTION INSIGHTS

Show:

```text
Active
Resolved
Recurring
```

Then:

```text
Misconception
Affected concepts
Occurrences
Current status
Recent evidence
```

A recurring misconception should create an actionable path to review.

---

# 56. DEMONSTRATED CAPABILITIES

A running capability log can show:

```text
✓ Distinguishes TDZ from function hoisting
✓ Explains creation → execution transition
✓ Applies mechanism to a novel case
△ Counterfactual reasoning developing
```

This is more meaningful than a generic achievement score.

---

# 57. PROFILE DESIGN PRINCIPLE

Profile is not another analytics center.

Profile owns:

```text
Identity
Account
Preferences
Basic personal snapshot
```

Brain owns:

```text
Knowledge graph
```

Retest owns:

```text
Assessment
```

Insights owns:

```text
Learning analytics
```

Notes owns:

```text
Knowledge capture
```

This separation prevents feature duplication.

---

# 58. LANDING PAGE DESIGN PRINCIPLE

The Landing Page is a single-page story.

It should communicate:

```text
Problem
↓
KNODES idea
↓
How it works
↓
Graph
↓
Understanding
↓
Retest
↓
Insights
↓
CTA
```

The actual application visual language should be previewed rather than invented separately.

The visitor should see the same:

- Graph style
- Recall indicators
- Colors
- Typography
- Concept visuals

that appear after login.

---

# 59. LANDING PAGE HERO

Primary headline:

```text
Build Understanding,
Not Just Notes.
```

Supporting:

```text
KNODES turns what you learn into a connected knowledge graph,
then helps you remember, explain, and test how that knowledge works.
```

Primary CTA:

```text
Start Building Your Brain →
```

Secondary:

```text
Sign In
```

Hero visual:

```text
3D KNODES graph
```

---

# 60. AUTHENTICATION DESIGN

Login and Signup should be:

- Simple
- Centered
- Branded
- Calm
- Accessible

No unnecessary marketing UI.

Login:

```text
Welcome back.
Continue building your Brain.
```

Signup:

```text
Build your Brain.
Start turning what you learn into connected knowledge.
```

Successful authentication:

```text
→ Brain
```

---

# 61. EDGE-CASE DESIGN PRINCIPLES

Across the entire product:

## Always preserve user data

If something fails:

```text
Your note is safe.
```

when that is actually true.

## Never blame the user

Use:

```text
We couldn't complete that.
```

instead of:

```text
You entered invalid data.
```

unless there is a genuine user-correctable validation error.

## Never fabricate information

Do not invent:

- Claims
- Relationships
- Sources
- Recall data
- Structural evidence

when it does not exist.

## Distinguish no data from poor data

```text
Not enough evidence
```

is not the same as:

```text
Poor evidence
```

---

# 62. ERROR LANGUAGE

Preferred pattern:

```text
What happened
+
What is safe
+
One next action
```

Example:

```text
We couldn't finish structuring this note.

Your original note is safe.

[ Retry extraction ]
```

---

# 63. LOADING LANGUAGE

Avoid generic:

```text
Loading...
```

where meaningful language can be used.

Examples:

```text
Building your Brain...
```

```text
Finding the ideas that matter...
```

```text
Connecting this to what you already know...
```

```text
Preparing your review...
```

---

# 64. EMPTY STATE LANGUAGE

Empty states should explain what the user can do next.

Example Brain:

```text
Your Brain starts here.

Add your first note and KNODES will turn it
into connected knowledge.

[ Add your first note ]
```

Example Retest:

```text
You're all caught up.

Your Brain is healthy for now.
```

Example Insights:

```text
Your insights will appear as your Brain grows.
```

---

# 65. NO-EVIDENCE LANGUAGE

When there is not enough evidence:

```text
Not enough evidence yet.
```

Do not use:

```text
Weak
```

unless evidence actually supports weakness.

---

# 66. NO-RECALL-DATA LANGUAGE

If a concept has no recall calculation yet:

```text
Recall not available yet
```

Do not show:

```text
0%
```

because that would imply complete forgetting.

---

# 67. NO-PREREQUISITES LANGUAGE

If no prerequisite relationship is recorded:

```text
No prerequisite relationships recorded.
```

Do not claim:

```text
This concept has no prerequisites.
```

The system may simply have no recorded relationship.

---

# 68. ACCESSIBILITY

All pages must support:

- Keyboard navigation
- Visible focus
- Screen-reader labels
- Sufficient contrast
- Text alternatives for graph states
- Color-independent status
- Reduced motion
- Accessible form validation
- Accessible drag/drop alternatives

The 3D Brain must have a semantic fallback such as a concept list.

---

# 69. REDUCED MOTION

Respect:

```text
prefers-reduced-motion
```

For reduced motion:

- Remove floating graph movement
- Disable continuous pulses
- Replace camera transitions with fades
- Remove particle effects
- Keep state changes visually understandable

---

# 70. DARK MODE

Dark mode should be especially effective for Brain.

Base:

```text
#111827
```

Primary:

```text
#58CC02
```

Blue:

```text
#1CB0F6
```

Orange:

```text
#FF9600
```

Red:

```text
#FF4B4B
```

Use luminous accents carefully.

The product should remain academic and premium.

---

# 71. LIGHT MODE

Base:

```text
#F7F7F7
```

Surfaces:

```text
#FFFFFF
```

Text:

```text
#374151
```

Use thin borders and subtle elevation.

---

# 72. ANIMATION SYSTEM

Animations should communicate:

```text
Progress
Discovery
State changes
Relationships
Success
Navigation
```

Important animations:

### Brain

- Node hover
- Node selection
- New node creation
- New edge creation
- Camera focus
- Recall update

### Notes

- Saving
- Extraction
- Concept discovery
- Claim discovery
- Prerequisite mapping
- Graph building
- Completion

### Retest

- Question transition
- Answer feedback
- Result reveal
- Review completion

### Insights

- Chart transitions
- Metric updates
- Status changes

### Profile

- Save confirmation
- Minor state transitions only

---

# 73. ANIMATION SPEED

General interaction:

```text
150–300ms
```

Small state transitions:

```text
200–400ms
```

Large graph/extraction sequences:

```text
1–3 seconds
```

Do not force users to wait for decorative animation.

Allow skip on longer processing presentations where practical.

---

# 74. RESPONSIVE SYSTEM

## Desktop

Primary design target.

Use:

- Sidebar
- Large graph
- Drawers
- Split layouts

## Tablet

Use:

- Compact sidebar
- Overlay drawers
- Reduced graph density

## Mobile

Use:

- Bottom navigation
- Full-width layouts
- Full-screen concept panels
- Single-question Retest
- Simplified graph interactions

---

# 75. MOBILE PRIORITY

Do not attempt to reproduce desktop density exactly.

Mobile should prioritize:

```text
Content
Action
Navigation
```

rather than showing every secondary detail at once.

---

# 76. PERFORMANCE PRINCIPLES

The 3D graph can become expensive.

Design for:

- Level-of-detail rendering
- Limited labels
- Clustering
- Focus mode
- Search centering
- Progressive loading

The Landing Page graph should be a small demonstration graph, not a full knowledge graph.

---

# 77. DATA HONESTY

The visual design must never imply a metric exists when the backend has not established it.

Examples:

Do not fabricate:

```text
Recall 83%
```

if there is no recall calculation.

Do not fabricate:

```text
SOLO Relational
```

if no relevant evidence exists.

Do not fabricate:

```text
No prerequisites
```

just because no relationships were loaded.

Use:

```text
Not available yet
```

or:

```text
No recorded evidence
```

where appropriate.

---

# 78. TECHNICAL BOUNDARY FOR THE DESIGN

The UI is not responsible for implementing learning logic.

The architecture uses:

```text
React
Express
FastAPI
PostgreSQL + pgvector
```

with the agreed dual-backend structure.

Conceptually:

```text
React
  ↓
Express
  ↓
PostgreSQL + pgvector

React
  ↓
FastAPI
  ↓
ML / LLM / grading / decay
  ↓
PostgreSQL + pgvector
```

The current project discussion intentionally excludes Redis/Celery from the initial implementation.

FastAPI BackgroundTasks are used for background processing initially.

These are engineering concerns; Figma AI should not expose them as learner-facing UI.

---

# 79. WHAT FIGMA AI SHOULD REUSE

Across every page, reuse:

```text
App Shell
Sidebar
Minimal Top Bar
Typography
Colors
Buttons
Cards
Drawer
Status Chips
Recall Indicator
Node styling
Empty states
Error states
Loading states
Animation language
```

Do not redesign common components independently for every page.

---

# 80. WHAT FIGMA AI SHOULD NOT DO

Do not create:

- Different navigation systems per page
- A separate visual language for Landing
- Multiple unrelated graph designs
- Fake dashboard metrics
- Fake AI-generated content
- Excessive gradients
- Heavy glassmorphism
- Excessive neon
- Large header navigation inside the authenticated app
- Manual claim approval screens
- Developer logs
- Prompt editors
- Database screens
- Internal model controls
- Raw JSON views
- Internal embedding/vector screens
- Fake mastery percentages
- Leaderboards

---

# 81. CONSISTENCY CHECK

Before considering any screen complete, verify:

```text
Does it use the same KNODES colors?
Does it use the same typography?
Does it use the same sidebar?
Does it follow the minimal top-bar rule?
Does it use the same recall colors?
Does it use consistent terminology?
Does it preserve the source/evidence distinction?
Does it distinguish no evidence from weak evidence?
Does it handle loading?
Does it handle errors?
Does it handle empty data?
Does it work on mobile?
Does it respect reduced motion?
```

---

# 82. MASTER COMPONENT RELATIONSHIP

The final product can be visualized as:

```text
                           LANDING
                              │
                         Login / Signup
                              │
                              ▼
                           BRAIN
                     ┌────────┼────────┐
                     │        │        │
                     ▼        ▼        ▼
                   NOTES    RETEST   PROFILE
                     │        │
                     │        ▼
                     │     INSIGHTS
                     │        │
                     └────────┴───────┐
                                      ▼
                                    BRAIN
```

Brain is the center.

Notes feeds Brain.

Retest creates evidence.

Insights explains evidence.

Profile manages the account.

Landing introduces the entire product.

---

# 83. PRIMARY USER JOURNEY

```text
Visitor
 ↓
Landing Page
 ↓
Understand KNODES
 ↓
Sign Up
 ↓
Brain
 ↓
No knowledge yet
 ↓
Notes
 ↓
Write first note
 ↓
Save to Brain
 ↓
Extraction animation
 ↓
Concepts / claims / prerequisites
 ↓
Brain updated
 ↓
Explore graph
 ↓
Click concept
 ↓
See recall + structure
 ↓
Retest
 ↓
Complete assessment
 ↓
Insights
 ↓
See learning evidence
 ↓
Return to Brain
```

This is the most important prototype journey to demonstrate.

---

# 84. SECONDARY USER JOURNEYS

## Weak concept

```text
Brain
 ↓
Red recall indicator
 ↓
Concept Explorer
 ↓
Retest
 ↓
Review
 ↓
Recall updated
```

## Missing prerequisite

```text
Brain
 ↓
Locked prerequisite
 ↓
Learn concept
 ↓
Notes
 ↓
Create missing knowledge
 ↓
Brain
 ↓
Prerequisite unlocked
```

## Structural gap

```text
Retest
 ↓
Incomplete / Shallow
 ↓
Gap Report
 ↓
Missing prerequisite or concept
 ↓
Brain / Notes
```

## Misconception

```text
Retest
 ↓
Misconception detected
 ↓
Feedback
 ↓
Insights records misconception
 ↓
Future Retest targets it
```

---

# 85. PROTOTYPE DEMO DATA

Use a consistent demonstration knowledge area across screens.

Primary concept:

```text
JavaScript Hoisting
```

Related concepts:

```text
JavaScript
Creation Phase
Execution Phase
Variable Scope
var
let
const
Temporal Dead Zone
```

Example relationship:

```text
Hoisting
   ↓ REQUIRES
Creation Phase
```

Additional:

```text
Creation Phase
   ↓
var initialization

Creation Phase
   ↓
let / const initialization

let
   ↓
Temporal Dead Zone
```

Use this same concept family for:

- Brain
- Notes
- Retest
- Insights
- Landing graph demo

This creates continuity throughout the prototype.

---

# 86. PROTOTYPE STORYBOARD

Figma AI should support this sequence:

### Scene 1

Landing Page

User sees:

```text
Build Understanding, Not Just Notes.
```

3D graph preview.

### Scene 2

Signup.

### Scene 3

Empty Brain.

### Scene 4

Notes Page.

User writes:

```text
JavaScript Hoisting...
```

### Scene 5

Save to Brain.

### Scene 6

Extraction animation.

### Scene 7

Concepts appear.

### Scene 8

Prerequisite appears.

### Scene 9

Brain graph updates.

### Scene 10

User clicks Hoisting.

### Scene 11

Concept Explorer opens.

### Scene 12

Recall is shown as:

```text
42%
Needs Review
```

### Scene 13

User clicks:

```text
Retest
```

### Scene 14

Prerequisite detour appears.

### Scene 15

Understand mode.

### Scene 16

User explains mechanism.

### Scene 17

Gap report appears.

### Scene 18

Counterfactual probe.

### Scene 19

Review completes.

### Scene 20

Insights update.

### Scene 21

User returns to Brain.

This complete journey should feel like one product.

---

# 87. MASTER UX PRINCIPLES

## Principle 1 — Graph First

The knowledge graph is the visual identity of KNODES.

## Principle 2 — Action Over Decoration

Every visual element should help the learner understand, navigate, review, or act.

## Principle 3 — Evidence Over Claims

Never overstate what the system knows about the learner.

## Principle 4 — Preserve Source

Never silently rewrite the user's original note.

## Principle 5 — Explain, Don't Blame

Errors should be understandable and actionable.

## Principle 6 — Same Meaning, Same Visual

Recall colors, statuses, buttons, and terminology must remain consistent.

## Principle 7 — No Fake Precision

If evidence is incomplete, say so.

## Principle 8 — Connected Experience

Every page should naturally lead to another part of the system.

---

# 88. TERMINOLOGY STANDARD

Use these exact terms consistently.

```text
Brain
Notes
Retest
Insights
Concept
Claim / Key Statement
Prerequisite
REQUIRES
Recall Probability
Half-life
Concept Depth
SOLO
Structural Evidence
Process Template
Counterfactual
Transfer
Misconception
```

Preferred status terms:

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

Do not randomly replace these with synonyms.

---

# 89. FINAL PRODUCT HIERARCHY

The product has five major experiences:

```text
1. LANDING
   "Why should I use KNODES?"

2. BRAIN
   "What does my knowledge look like?"

3. NOTES
   "How do I add knowledge?"

4. RETEST
   "Can I still demonstrate it?"

5. INSIGHTS
   "What is my evidence telling me?"
```

Profile is the support/account layer:

```text
6. PROFILE
   "Who am I and how do I control my account?"
```

---

# 90. FINAL DESIGN DIRECTION

KNODES should look like:

```text
Claude
    +
Linear
    +
Obsidian
    +
Duolingo
    +
3D Knowledge Visualization
```

But it should NOT look like a copy of any one product.

Use:

Claude:
- calmness
- whitespace
- writing-oriented clarity

Linear:
- precision
- hierarchy
- clean interactions

Obsidian:
- graph mental model

Duolingo:
- positive color energy
- accessible feedback
- friendly interaction

KNODES:
- combine these into a unique knowledge-learning identity.

---

# 91. FINAL EMOTIONAL EXPERIENCE

The user should feel:

## Landing

"I understand why this is different."

## Brain

"This is my knowledge."

## Notes

"I can put anything I learn into my Brain."

## Extraction

"KNODES is transforming my notes into structure."

## Retest

"I am actually testing whether I understand this."

## Insights

"I can see what is strengthening and what needs work."

## Profile

"This is my personal learning system."

---

# 92. FINAL ONE-LINE PRODUCT FLOW

```text
CAPTURE → STRUCTURE → CONNECT → RECALL → UNDERSTAND → TRANSFER → INSIGHT
```

Then:

```text
↺ REVIEW
```

This loop is the core of the KNODES product experience.

---

# 93. FINAL Figma AI INSTRUCTION

Use this master file as the context layer for all KNODES screens.

The page-specific files provide the detailed screen requirements.

Build the prototype as ONE SYSTEM.

Do not treat the files as independent website designs.

Use:

```text
01-Brain-Page.md
```

for the living 3D knowledge graph.

Use:

```text
02-Notes-Page.md
```

for knowledge ingestion and the note-to-graph transformation.

Use:

```text
03-Retest-and-Insights.md
```

for review, structural assessment, evidence, and learning analytics.

Use:

```text
04-Landing-Page-and-Profile.md
```

for public introduction, authentication, and account management.

This master file defines the shared visual language, architecture of the experience, terminology, interaction model, and end-to-end product workflow.

The result should feel like:

> One coherent learning operating system for personal knowledge — not six unrelated pages.
