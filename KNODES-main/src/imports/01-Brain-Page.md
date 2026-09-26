# KNODES — Brain Page
## Figma AI Prototype Specification
### File: `01-Brain-Page.md`

---

# 0. Purpose

The Brain Page is the primary experience of KNODES.

It is not a conventional dashboard.

It is the learner's living knowledge space — a 3D visualization of concepts, relationships, prerequisites, and current recall/decay state.

The page should communicate:

> "I can see what I know, how it connects, and what needs attention."

The knowledge graph is the main visual object.

Every other component exists to help the learner explore or act on the graph.

---

# 1. Product Philosophy

KNODES is designed around structural understanding rather than simple fact collection.

The Brain Page should therefore show:

- Concepts
- Relationships
- Prerequisites
- Knowledge growth
- Current recall state
- Concept-level structural evidence
- Missing prerequisites
- Local concept context

Do not turn the Brain Page into a wall of numerical analytics.

The graph is the hero.

---

# 2. Design Inspiration

Layout inspiration:

- Claude
- Linear
- Arc
- Modern productivity applications

Knowledge visualization inspiration:

- Obsidian Graph
- Roam Research
- Three.js force-directed visualizations
- Neural-network visualization

Color inspiration:

- Duolingo

Overall style:

- Minimal
- Premium
- Academic
- Futuristic
- Calm
- Intelligent
- Slightly playful
- High information density without visual clutter

Avoid making the interface look like a generic LMS.

---

# 3. Global App Shell

Desktop layout:

```text
┌─────────────────────────────────────────────────────────────────┐
│ KNODES      Search concepts...         🔔     ⚙     Avatar      │
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                  │
│ SIDEBAR      │                                                  │
│              │                                                  │
│ 🧠 Brain     │               3D KNOWLEDGE GRAPH                │
│ 📝 Notes     │                                                  │
│ 🎯 Retest    │                                                  │
│ 📈 Insights  │                                                  │
│ 👤 Profile   │                                                  │
│              │                                                  │
│              │                                                  │
│              │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

---

# 4. Sidebar

Collapsed width:

```text
80–88px
```

Expanded width:

```text
220–240px
```

Navigation:

```text
🧠 Brain
📝 Notes
🎯 Retest
📈 Insights
👤 Profile
```

Brain is active.

Active state:

- Duolingo green accent
- Soft green background
- Strong text contrast
- Small icon animation on hover only
- No heavy box treatment

The sidebar should remain visually quiet because the graph is the primary interface.

---

# 5. Top Navigation

Height:

```text
64–72px
```

Left:

```text
KNODES
```

Center:

```text
Search your knowledge...
```

Right:

```text
Notifications
Settings
Avatar
```

The search should search concepts, notes, and graph relationships.

---

# 6. Brain Header

Inside the workspace:

```text
Your Brain
See how your knowledge connects.
```

Secondary metadata:

```text
124 concepts · 318 connections · 6 need review
```

Primary graph controls should remain floating so the graph is not covered by a large header.

---

# 7. Main Knowledge Graph

The knowledge graph is the central component of the Brain Page.

It should occupy most of the available viewport.

The preferred view is fully 3D.

Use a force-directed network.

Concepts float in 3D space.

Connections stretch naturally between related nodes.

The graph may have very subtle continuous movement so it feels alive.

Movement must remain restrained.

Do not make the user feel motion sickness.

---

# 8. 3D Graph Behavior

Users should be able to:

- Orbit
- Rotate
- Zoom
- Pan
- Focus a node
- Search a node
- Filter nodes
- Isolate a concept neighborhood
- Return to default camera
- Switch to an optional 2D fallback

Camera controls:

```text
Rotate
Pan
Zoom
Center
Reset
Fullscreen
```

Optional:

```text
3D
2D
```

3D is the default.

---

# 9. Initial Camera

When the user first opens Brain:

- Start at a readable medium-distance camera
- Show the core graph
- Avoid placing nodes directly over the controls
- Keep enough negative space around major clusters
- Slightly animate the camera into position instead of snapping

For a new user with few nodes:

Center all concepts clearly.

For a dense graph:

Show a meaningful central region and avoid attempting to display every node at unreadably small size.

---

# 10. Node Representation

Every knowledge concept is represented by a circular node.

Default:

```text
40–48px
```

Important/central concepts:

```text
56–72px
```

Selected node:

```text
64–84px
```

Node should contain:

- Concept name
- Optional small concept icon
- Recall indicator

Concept name should appear:

- On hover
- When selected
- For highly important/central nodes if enough space exists

Do not place long descriptions directly inside nodes.

---

# 11. Knowledge Health Indicator

Every established concept node has a small circular indicator positioned at the top-right of the node.

Size:

```text
10–14px
```

The indicator represents:

> Recall probability — how likely the learner is to still recall the knowledge according to the system's decay/review model.

---

# 12. Recall Indicator Thresholds

## Green

```text
75–100%
```

Label:

```text
Healthy
```

Meaning:

Knowledge is currently in a healthy recall range.

---

## Yellow / Orange

```text
50–74%
```

Label:

```text
Weakening
```

Meaning:

Recall is declining and review is recommended.

---

## Red

```text
0–49%
```

Label:

```text
Needs Review
```

Meaning:

The concept has entered a low-recall range.

---

# 13. Recall Indicator Accessibility

Never communicate health through color alone.

Pair each state with:

```text
✓ Healthy
△ Weakening
! Needs Review
```

The indicator may remain circular visually, but the hover/tooltip must expose the text label.

---

# 14. Recall Indicator Hover

Hovering over the small indicator opens a tooltip.

Example:

```text
Recall Probability
42%

Needs Review

Last reviewed:
5 days ago

Half-life:
7.3 days

Recommended:
Review this concept
```

Keep it compact.

Do not cover the node or graph excessively.

---

# 15. Recall Indicator Click

Clicking the indicator should open the concept panel focused on memory information.

Example:

```text
Hoisting

Recall
42%

Needs Review

Last reviewed
5 days ago

Next review
Today

Half-life
7.3 days

[ Retest ]
```

---

# 16. Node Hover

When hovering over a node:

- Slight scale increase
- Soft glow
- Name becomes fully visible
- Direct connections become more prominent
- Unrelated nodes reduce opacity

Suggested opacity:

```text
Connected nodes: 100%
Unrelated nodes: 25–40%
```

Do not completely hide unrelated nodes.

The user should still retain spatial context.

---

# 17. Node Selection

Clicking a node does not navigate to a new full page.

Open a Concept Explorer panel.

Preferred desktop behavior:

```text
Graph remains visible
        +
Right-side Concept Explorer
```

This preserves the user's mental map.

---

# 18. Selected Node State

Selected node:

- Enlarges slightly
- Uses a stronger glow/ring
- Connected edges become clear
- Related nodes may subtly highlight
- Camera gently moves toward the selected concept

Do not abruptly move the camera.

---

# 19. Concept Explorer Panel

Width:

```text
400–460px
```

Desktop:

Right-side drawer.

Mobile:

Full-screen sheet/page.

---

# 20. Concept Explorer Header

Example:

```text
JavaScript Hoisting
```

Metadata:

```text
Programming
Concept
```

Right controls:

```text
× Close
⋯ More
```

Primary action:

```text
Retest
```

---

# 21. Concept Summary

Display:

```text
What it is

Hoisting describes how certain declarations
are processed before code execution.
```

The summary should come from stored concept data.

Do not generate fake text in the prototype that contradicts the note source.

---

# 22. Concept Claims

Section:

```text
Key statements
```

Example:

```text
✓ var is registered during creation
✓ var is initialized to undefined
✓ let/const remain uninitialized during the relevant phase
```

Keep claims visually separate from the concept itself.

A concept is a node.

Claims are facts attached to that node.

---

# 23. Concept Depth

Section:

```text
Concept Depth
```

Use the structural dimensions already defined by the project.

Possible evidence roles:

```text
Definition
Mechanism
Contrast
Boundary
Application
Counterfactual
```

Display as horizontal evidence bars.

Example:

```text
Definition
██████████  Strong

Mechanism
████████░░  Strong

Contrast
██████░░░░  Developing

Boundary
████░░░░░░  Weak

Application
███████░░░  Developing

Counterfactual
███░░░░░░░  Weak
```

Do not label the total as:

```text
Understanding = 78%
```

Use structural evidence language.

---

# 24. SOLO Level

Show a compact categorical badge.

Possible values:

```text
Prestructural
Unistructural
Multistructural
Relational
Extended Abstract
```

Example:

```text
Relational
```

Tooltip:

```text
Facts are connected into a mechanism.
```

Do not replace the SOLO label with an invented numeric score.

---

# 25. Prerequisites

Section:

```text
Prerequisites
```

Example:

```text
Hoisting
   ↓ REQUIRES
Creation Phase
```

If prerequisite exists:

```text
● Creation Phase
```

If prerequisite is locked:

```text
🔒 Creation Phase
```

---

# 26. Locked Prerequisite Node

A locked prerequisite indicates that the system identified a prerequisite concept, but the learner does not yet have an established knowledge node for it.

Visual style:

- Muted node
- Lock icon
- Reduced opacity
- Dashed relationship
- Neutral gray rather than green/red recall state

Do not assign a recall percentage to a locked prerequisite because it is not yet an established learner concept.

---

# 27. Locked Prerequisite Panel

Click:

```text
🔒 Missing prerequisite

Creation Phase

KNODES identified this concept as a prerequisite
for Hoisting, but it is not established in
your Brain yet.

[ Learn this concept ]
```

Secondary:

```text
View relationship
```

Do not phrase it as an objectively verified fact.

Use:

```text
KNODES identified...
```

rather than:

```text
This is definitely required.
```

---

# 28. Related Concepts

Section:

```text
Related concepts
```

Display compact chips/list:

```text
Execution Phase
Variable Scope
Temporal Dead Zone
Function Declarations
```

Clicking one focuses that node in the graph.

---

# 29. Relationship Types

Use distinct visual treatment for relationships.

Current core relationship categories include:

```text
Explicit / Wikilink
Semantic similarity
REQUIRES / Prerequisite
```

If additional relationship types are supported by the backend, they may be represented later.

Do not invent relationship semantics in the prototype without backend support.

---

# 30. Relationship Visual Language

Recommended:

### Explicit connection

Solid edge.

### Semantic relationship

Soft/thinner edge.

### REQUIRES

Directional edge with arrow.

### Locked prerequisite

Dashed directional edge.

The same visual language must be reused anywhere relationship data appears.

---

# 31. Graph Legend

Provide a small collapsible legend.

Example:

```text
Graph

● Concept
━━ Related
→ Requires
- - - Locked prerequisite
```

Do not leave the graph unexplained.

---

# 32. Graph Filters

Floating filter control.

Filters:

```text
Subject
Topic
Recall Health
Concept Depth
Needs Review
Recently Added
```

Recall filter:

```text
All
Healthy
Weakening
Needs Review
```

---

# 33. Search

Search field:

```text
Search your knowledge...
```

Search matches:

- Concept names
- Notes
- Claim text
- Subjects/topics

When search begins:

Matching node:

```text
100% opacity
```

Non-matching nodes:

```text
10–25% opacity
```

Camera:

Gently centers the best match.

---

# 34. Search With No Results

Display unobtrusive overlay:

```text
No concept found.

Try another search.
```

Do not replace the graph with a blank screen.

---

# 35. Graph Controls

Bottom-right floating control group:

```text
+
−
◎ Center
↻ Reset
⛶ Fullscreen
3D / 2D
```

Use circular or compact controls.

Each control must have a tooltip.

---

# 36. Fullscreen Graph

Fullscreen hides secondary UI while keeping:

- Search
- Graph controls
- Close fullscreen
- Node selection

available.

Ideal for exploring large knowledge graphs.

---

# 37. Focus Mode

When a node is selected, optional action:

```text
Focus
```

This isolates:

```text
Selected concept
Direct relationships
Prerequisites
Immediate related concepts
```

All other nodes become low-opacity but remain visible.

Button:

```text
Exit Focus
```

---

# 38. Neighborhood Depth

Optional filter:

```text
1 hop
2 hops
3 hops
```

Example:

1 hop = direct connections.

2 hops = direct + connections of direct neighbors.

Default:

```text
All
```

or automatically selected based on graph density.

If the graph becomes unreadable, suggest:

```text
Graph is dense.
Try Focus mode.
```

---

# 39. Large Graph Handling

When the graph contains many nodes:

Do not render all labels.

Use:

- Node clustering
- Distance-based label visibility
- Level-of-detail rendering
- Focus mode
- Search centering

The user should never see a wall of overlapping labels.

---

# 40. Dense Graph State

Display:

```text
Dense knowledge area
```

Optional action:

```text
Focus this area
```

Do not use a warning/error color.

A dense graph is not necessarily a problem.

---

# 41. Graph Cluster Visualization

Concepts belonging to a broad subject may naturally form clusters.

Do not put thick artificial boundaries around clusters unless the backend supplies subject/topic grouping.

Subtle spatial grouping is preferred.

---

# 42. Newly Added Nodes

After returning from Notes:

New concepts should have a temporary highlight.

Animation:

- Node appears at scale 0.6
- Grows to normal size
- Soft pulse
- New edges draw outward

Duration:

```text
1–2 seconds
```

Then return to normal.

Optional label:

```text
New
```

Temporary only.

---

# 43. Updated Existing Nodes

If a note adds claims/relationships to an existing concept:

The existing node pulses.

Example:

```text
Hoisting
●
```

Animation:

```text
● → glow → ●
```

Do not create duplicate nodes.

---

# 44. New Connections

New relationships should animate by drawing their edge from source to target.

Do not animate every historical edge.

Only newly created relationships need the entrance animation.

---

# 45. Recall State Animation

When a review changes recall probability:

The indicator transitions smoothly.

Example:

```text
42% → 78%
```

The color transitions:

```text
Red → Green
```

Do not flash red/green rapidly.

The change should feel like a state update.

---

# 46. Due-for-Review Highlight

Optional graph state:

Concepts requiring review may receive a very subtle outer pulse.

Example:

```text
🔴 small recall indicator
+
soft pulse
```

Do not make every weak node flash continuously.

---

# 47. Brain Quick Summary

A compact floating card may appear above the graph:

```text
YOUR BRAIN

124 concepts
318 connections

Healthy        86
Weakening      24
Needs review   14
```

This is secondary.

The graph remains visually dominant.

---

# 48. Today's Attention Card

Small floating panel:

```text
Needs attention

🔴 Hoisting
42% recall

🟠 TCP Handshake
61% recall

🔴 Normalization
37% recall

[ Review now ]
```

Keep it limited to 3–5 items.

Do not turn the Brain into a review dashboard.

---

# 49. Quick Actions

Floating bottom-left or near header:

```text
+ Add Note
🎯 Retest Weak Concepts
🔍 Search Brain
```

Primary:

```text
Add Note
```

These actions connect directly to other app sections.

---

# 50. Empty Brain State

If the learner has zero established concepts:

Do not show a blank 3D canvas.

Show a beautiful empty neural-space scene.

Center:

```text
Your Brain starts here.
```

Subtext:

```text
Add your first note and KNODES will turn it
into connected knowledge.
```

CTA:

```text
Add your first note
```

Secondary:

```text
Explore demo
```

if demo mode exists.

---

# 51. Single Node State

If the learner has only one concept:

Center the node.

Show:

```text
1 concept

Add more notes to start building connections.
```

Do not make the node tiny just because the graph engine expects a network.

---

# 52. Two-Node State

Show both nodes clearly.

If there is no relationship:

```text
No connection detected yet.
```

Do not invent one.

If relationship exists:

Render it normally.

---

# 53. Unresolved Prerequisites

If a graph contains locked prerequisite nodes:

Place them near their dependent concepts.

Use:

```text
🔒
```

and dashed links.

Optional graph filter:

```text
Show missing prerequisites
```

This makes gaps in the knowledge structure visible.

---

# 54. Missing / Deleted Concept State

If a relationship references a concept that has been removed or is unavailable:

Do not display a broken link silently.

Represent it as:

```text
Missing concept
```

with a muted placeholder if backend data supports this state.

Do not fabricate the concept's contents.

---

# 55. Node Context Menu

Right-click or three-dot menu:

```text
View concept
Retest
View prerequisites
Focus neighborhood
Open source note
```

Optional:

```text
Copy concept link
```

Do not add destructive actions until backend behavior is fully specified.

---

# 56. Open Source Note

Inside Concept Explorer:

```text
Source

JavaScript Fundamentals.md
```

Click:

```text
Open source note
```

This navigates to the original note.

The relationship between:

```text
Note → Concept → Claims
```

should be understandable.

---

# 57. Claims vs Concept Visual Separation

Use:

```text
CONCEPT
Hoisting
```

and:

```text
KEY STATEMENTS
• ...
• ...
```

The UI must not make claims look like separate top-level graph nodes unless they actually are nodes in the data model.

---

# 58. Process Template Preview

If the concept has a process/mechanism model:

Display:

```text
Process
```

Example:

```text
Read source
     ↓
Parse
     ↓
Creation Phase
     ↓
Initialization
     ↓
Execution
```

Use compact vertical flow.

Branches:

```text
Creation Phase
   ├── var
   ├── let / const
   └── function declaration
```

The process template represents the mechanism structure rather than a flat claim list.

---

# 59. Process Template Interaction

Click:

```text
Explore mechanism
```

Expand the process structure inside the Concept Explorer.

Do not open a separate page unless the rest of the app requires it.

---

# 60. Counterfactual Context

If the concept has perturbation/counterfactual evidence:

Show:

```text
Counterfactual evidence

Last tested:
2 days ago

Status:
Developing
```

CTA:

```text
Retest
```

Do not display this if no such evidence exists.

---

# 61. Assessment Snapshot

Compact section:

```text
Recent evidence

Recall             ✓
Process trace      ✓
Counterfactual     △
Transfer           —
```

Meaning:

```text
✓ Demonstrated
△ Developing
— No evidence yet
```

This connects Brain with Retest without turning the graph node into a score dashboard.

---

# 62. Concept Memory Section

Inside Concept Explorer:

```text
Recall

42% 🔴

Needs Review

Last reviewed:
5 days ago

Half-life:
7.3 days
```

CTA:

```text
Retest this concept
```

---

# 63. Concept Action Priority

For red recall:

Primary:

```text
Retest
```

For yellow:

Primary:

```text
Review soon
```

For green:

Primary:

```text
Explore
```

The rest of the panel should remain the same.

---

# 64. Green Concept UX

Avoid telling users:

```text
Perfect
```

Instead:

```text
Healthy recall
```

This does not imply permanent mastery.

---

# 65. Red Concept UX

Use:

```text
Needs Review
```

not:

```text
Forgotten
```

The system estimates recall probability; it should not overclaim certainty about what the learner remembers.

---

# 66. Tooltip Rules

Tooltips may explain:

- Recall probability
- Half-life
- SOLO level
- Relationship type
- Graph controls

Tooltip text should be short.

Example:

```text
Relational
Facts are connected into a mechanism.
```

---

# 67. Graph Interaction Animation Language

### Hover

```text
scale: 1.05–1.15
```

### Select

```text
scale + soft glow
camera ease
```

### New node

```text
fade + scale + pulse
```

### New edge

```text
draw-on animation
```

### Focus

```text
unrelated nodes fade
```

### Reset

```text
camera eases back
```

Avoid hard snapping wherever possible.

---

# 68. Performance Principle

The visual design must remain usable as the graph grows.

Prefer:

- Progressive node loading
- Level-of-detail labels
- Clustering
- Focus mode
- Search centering
- WebGL-friendly visuals

Do not require every node to render a text label continuously.

---

# 69. Loading State

When loading the Brain:

Show a low-detail animated neural field.

Example:

```text
·    ·
  ·──·
·   /  ·
```

Then nodes gradually resolve into actual concepts.

Text:

```text
Building your Brain...
```

Avoid:

```text
Loading 47%
```

unless real progress is available.

---

# 70. Graph Loading Failure

```text
We couldn't load your Brain.
```

Secondary:

```text
Your knowledge is safe.
```

CTA:

```text
Try again
```

Do not show a blank graph with no explanation.

---

# 71. Partial Graph Loading

If some nodes load before the rest:

Show them normally.

Small status:

```text
Loading more knowledge...
```

Do not hide the successfully loaded graph.

---

# 72. Slow Graph Rendering

If graph rendering is slow:

Offer:

```text
Simplify graph
```

which can switch to:

- 2D fallback
- reduced visual effects
- clustered view

Do not force 3D effects on lower-powered devices.

---

# 73. Mobile Design

The application shell becomes:

```text
Top bar
Graph
Bottom navigation
```

Bottom navigation:

```text
Brain | Notes | Retest | Insights | Profile
```

The 3D graph remains the default experience if device performance supports it.

---

# 74. Mobile Node Explorer

When a node is clicked:

Open a bottom sheet or full-screen panel.

Recommended:

```text
60–90% viewport height
```

Header remains sticky.

Graph can be visible behind the sheet or blurred slightly.

---

# 75. Mobile Graph Controls

Use compact floating controls:

```text
Zoom
Center
Reset
Fullscreen
```

Do not cover the bottom navigation.

---

# 76. Tablet Design

Keep:

- Compact sidebar
- Large graph
- Right-side Concept Explorer drawer

If drawer causes the graph to become too narrow, overlay the drawer rather than shrinking the graph aggressively.

---

# 77. Dark Mode

Dark mode should feel particularly strong for the 3D Brain.

Suggested background:

```text
#111827
```

Use softer neutral surfaces around it.

Green:

```text
#58CC02
```

Blue:

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

Do not use pure black everywhere.

---

# 78. Light Mode

Suggested background:

```text
#F7F7F7
```

Graph space can use:

```text
white / very light neutral
```

Nodes should have enough contrast to remain readable.

---

# 79. Typography

Use:

- Inter
- Geist

Page title:

```text
28–34px
```

Section title:

```text
18–22px
```

Body:

```text
14–16px
```

Metadata:

```text
12–13px
```

Concept name in explorer:

```text
24–30px
```

Avoid decorative fonts.

---

# 80. Graph Background

Prefer:

- very subtle gradient/noise
- soft particles if performance allows
- restrained grid only if it improves spatial orientation

Do not use a strong sci-fi starfield.

The product should look academic and premium, not like a video-game HUD.

---

# 81. Graph Node Styling

Default:

- simple filled circle
- subtle border/glow
- readable text nearby when needed

Avoid complex 3D spheres with intense reflections.

The graph should remain legible.

---

# 82. Node Importance

If backend supports centrality/importance:

Larger node size may represent importance.

But only use this if the metric is actually available.

Do not imply that a large node is "more important" if size is merely decorative.

---

# 83. Node Type Styling

If concept types/shapes are available, they may use subtle shape variations.

However:

Do not create a complicated visual taxonomy unless backend data provides meaningful types.

Primary meaning should remain:

```text
This is a concept.
```

---

# 84. Graph Selection Context

When a node is selected:

Optionally show:

```text
3 prerequisites
7 related concepts
2 source notes
```

This helps the learner understand why the node exists in the graph.

---

# 85. Concept Explorer Scroll Structure

Recommended order:

```text
Header
↓
Recall
↓
Summary
↓
Key statements
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

The most actionable information should appear first.

---

# 86. Concept Explorer Empty States

If concept description is missing:

```text
No description available yet.
```

If no claims:

```text
No structured statements available.
```

If no process:

```text
No mechanism model available for this concept.
```

If no assessment evidence:

```text
No review evidence yet.
```

Do not fabricate missing information.

---

# 87. No Recall Data

If the node exists but recall/decay is not yet calculated:

```text
Recall not available yet
```

Do not show:

```text
0%
```

because 0% would falsely imply forgetting.

---

# 88. No SOLO Evidence

If no learner evidence exists:

```text
Structural level not established yet.
```

Do not choose a SOLO level merely because the concept exists.

---

# 89. No Prerequisites

Show:

```text
No prerequisite relationships recorded.
```

Do not interpret this as:

```text
This concept has no prerequisites.
```

The wording must distinguish "none recorded" from "none exist."

---

# 90. Source Missing

If source metadata is unavailable:

```text
Source unavailable
```

Do not invent a source title.

---

# 91. Relationship Conflict

If the backend ever reports conflicting relationships:

Represent carefully:

```text
Relationship needs attention
```

Do not silently choose one.

Detailed resolution belongs to a future explicitly designed workflow.

---

# 92. Orphan Node Visualization

If a concept is isolated:

Optional subtle badge:

```text
Isolated
```

Inside Concept Explorer:

```text
No relationships found yet.

Add more connected notes to help your Brain grow.
```

Do not call it "broken."

---

# 93. New User Greeting

Optional first-load greeting:

```text
Welcome to your Brain.
```

Then immediately give the user control.

Do not display a large onboarding carousel.

---

# 94. Brain Microcopy

Use:

```text
Your Brain
```

```text
Explore your knowledge
```

```text
Needs Review
```

```text
Healthy recall
```

```text
Weakening
```

```text
Missing prerequisite
```

```text
Explore mechanism
```

Avoid technical language unless necessary.

---

# 95. Accessibility

Support:

- Keyboard navigation
- Visible focus
- Screen-reader labels
- Color-independent status
- Reduced motion
- Accessible tooltips
- Accessible node-selection controls

The raw 3D canvas must have a usable semantic fallback.

Provide an alternate node list/explorer for users unable to interact effectively with 3D.

Example:

```text
Knowledge List
```

which can show:

```text
Hoisting
Creation Phase
Scope
...
```

Clicking an item selects that node.

---

# 96. Reduced Motion

Respect:

```text
prefers-reduced-motion
```

Disable:

- continuous floating movement
- pulsing indicators
- camera fly-ins

Replace with:

- static node position
- short fades
- simple focus transitions

---

# 97. Color-Blind Accessibility

Use:

```text
✓ Healthy
△ Weakening
! Needs Review
```

alongside colors.

Do not make green/yellow/red the sole semantic signal.

---

# 98. Data Freshness

When values update:

Show subtle:

```text
Updated just now
```

or:

```text
Synced 2 min ago
```

Do not constantly animate data values.

---

# 99. Graph Refresh

When new knowledge is created:

Do not completely rebuild the visual scene with a jarring restart.

Preserve existing node positions where possible.

Only add/update the affected region.

The user should feel that their Brain is growing, not disappearing and reappearing.

---

# 100. Navigation From Brain

Brain should provide direct paths to:

```text
Add Note
Retest
Insights
```

Examples:

Weak node:

```text
[ Retest ]
```

Locked prerequisite:

```text
[ Learn ]
```

Node source:

```text
[ Open Note ]
```

Concept depth gap:

```text
[ Practice ]
```

---

# 101. Brain → Retest Flow

```text
Click node
   ↓
Concept Explorer
   ↓
Recall 42%
   ↓
Needs Review
   ↓
Retest this concept
   ↓
Retest Page
```

Retest should open with the selected concept already chosen.

---

# 102. Brain → Notes Flow

Locked prerequisite:

```text
Creation Phase
```

CTA:

```text
Learn this concept
```

This opens Notes with:

```text
Suggested topic:
Creation Phase
```

The user can write their own explanation.

Do not automatically fill the source note with fabricated content.

---

# 103. Brain → Insights Flow

Inside Concept Explorer:

```text
View deeper insights
```

opens the concept-focused Insights state.

Example:

```text
Hoisting
Recall trend
Concept Depth
Transfer evidence
Misconceptions
```

---

# 104. Graph-to-Concept Animation

When the Concept Explorer opens:

1. Node enlarges
2. Camera eases toward it
3. Panel slides from the right
4. Connected edges brighten
5. Content fades in

Do not cover the selected node completely.

---

# 105. Concept Panel Close

On close:

1. Panel slides away
2. Camera gently returns
3. Node returns to normal scale
4. Other graph nodes restore opacity

If focus mode was active, preserve the user's mode.

---

# 106. Full Interaction Flow

```text
OPEN BRAIN
   ↓
GRAPH LOADS
   ↓
EXPLORE / SEARCH
   ↓
HOVER NODE
   ↓
SEE LOCAL RELATIONSHIPS
   ↓
CLICK NODE
   ↓
CONCEPT EXPLORER
   ↓
READ RECALL + STRUCTURAL EVIDENCE
   ↓
CHECK PREREQUISITES
   ↓
OPTIONAL RETEST
   ↓
RETURN TO GRAPH
```

---

# 107. Recommended Prototype Demo

Use one connected knowledge area.

Example:

```text
JavaScript
   |
   ├── Hoisting
   │      |
   │      ├── var
   │      ├── let / const
   │      └── TDZ
   |
   ├── Scope
   |
   └── Execution Context
```

Add:

```text
Hoisting → REQUIRES → Creation Phase
```

If Creation Phase is missing:

```text
Hoisting → REQUIRES → 🔒 Creation Phase
```

This demonstrates:

- 3D knowledge visualization
- prerequisite structure
- locked node UX
- recall indicator
- concept drill-down

---

# 108. Example Node States For Prototype

Create at least these:

### Healthy

```text
Hoisting
🟢 82%
```

### Weakening

```text
Scope
🟠 64%
```

### Needs Review

```text
TDZ
🔴 37%
```

### Locked

```text
🔒 Creation Phase
```

### Selected

```text
Hoisting
42%
Concept Explorer open
```

---

# 109. Example Tooltip

For a red node:

```text
Temporal Dead Zone

Recall Probability
37%

Needs Review

Last reviewed 6 days ago
```

CTA inside tooltip should be optional.

Prefer an action in the Concept Explorer for a cleaner graph.

---

# 110. Brain Page Do Not Design

Do not design:

- A giant metric wall
- Spreadsheet-style node data
- Raw JSON
- Prompt inspection
- LLM configuration
- Database details
- Developer logs
- Manual claim approval
- Internal grading formulas
- Internal embedding values
- Fake mastery percentages
- Overly gamified leaderboards
- Excessive sci-fi effects
- Excessive animations
- 3D objects with no semantic meaning

---

# 111. Design Tokens

Spacing:

```text
4
8
12
16
20
24
32
48
64
```

Radius:

```text
8
12
16
20
24
```

Controls:

```text
40–48px
```

Drawer radius:

```text
20–24px
```

Keep visual rhythm consistent with Notes, Retest, and Insights pages.

---

# 112. Prototype Screen Variants

Figma AI should create:

## Brain 01
Empty Brain

## Brain 02
Single Concept

## Brain 03
Small Knowledge Graph

## Brain 04
Dense Knowledge Graph

## Brain 05
3D Default View

## Brain 06
Node Hover

## Brain 07
Node Selected

## Brain 08
Recall Tooltip — Healthy

## Brain 09
Recall Tooltip — Weakening

## Brain 10
Recall Tooltip — Needs Review

## Brain 11
Concept Explorer

## Brain 12
Concept Explorer — Structural Evidence

## Brain 13
Concept Explorer — Prerequisites

## Brain 14
Locked Prerequisite

## Brain 15
Graph Search

## Brain 16
No Search Result

## Brain 17
Graph Focus Mode

## Brain 18
Graph Fullscreen

## Brain 19
New Nodes Added

## Brain 20
Loading

## Brain 21
Partial Loading

## Brain 22
Graph Error

## Brain 23
Mobile Brain

## Brain 24
Tablet Brain

## Brain 25
Dark Mode Brain

---

# 113. Component Tree

```text
BrainPage
│
├── AppShell
│   ├── Sidebar
│   └── TopNavigation
│
├── BrainHeader
│
├── KnowledgeGraph3D
│   ├── GraphNode
│   │   ├── ConceptLabel
│   │   └── RecallIndicator
│   ├── GraphEdge
│   └── LockedPrerequisiteNode
│
├── GraphLegend
├── GraphControls
├── GraphFilters
├── SearchOverlay
│
├── BrainSummary
├── AttentionPanel
│
└── ConceptExplorer
    ├── ConceptHeader
    ├── RecallCard
    ├── ConceptSummary
    ├── ClaimsList
    ├── ConceptDepth
    ├── SOLOBadge
    ├── PrerequisiteList
    ├── RelatedConcepts
    ├── ProcessPreview
    ├── AssessmentSnapshot
    └── SourceLink
```

---

# 114. Final Figma AI Instruction

Design the KNODES Brain Page as a living 3D knowledge environment, not as a conventional dashboard.

The 3D graph must dominate the experience.

Each established concept is a circular node with a small top-right recall-probability indicator:

- Green: 75–100%, Healthy
- Yellow/orange: 50–74%, Weakening
- Red: 0–49%, Needs Review

Hovering the indicator shows recall percentage, status, last review, and half-life.

Hovering the node highlights its local neighborhood.

Clicking a node opens a right-side Concept Explorer without taking the learner away from the graph.

The Concept Explorer should show:

- Concept summary
- Key statements/claims
- Recall state
- Concept Depth
- SOLO level
- Prerequisites
- Related concepts
- Process template
- Recent assessment evidence
- Source note

Missing prerequisites should appear as locked nodes with dashed prerequisite relationships.

The graph must support:

- Search
- Filters
- Zoom
- Rotation
- Pan
- Focus mode
- Fullscreen
- Reset
- Optional 2D fallback

The UI must support:

- Empty state
- Single-node state
- Dense graph
- Loading
- Partial loading
- Errors
- Missing recall data
- Missing structural evidence
- Locked prerequisites
- New-node animations
- Updated-node animations
- Mobile/tablet layouts
- Dark mode
- Reduced-motion mode
- Accessibility

Keep the visual language consistent with the Notes, Retest, and Insights specifications.

The emotional goal is:

> "This is my knowledge, and I can explore it like a living map."
