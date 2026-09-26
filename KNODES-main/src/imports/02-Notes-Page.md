# KNODES — Notes Page
## Figma AI Prototype Specification
### File: `02-Notes-Page.md`

---

# 0. Purpose

The Notes Page is the entry point where a learner puts knowledge into KNODES.

This page is not a generic note-taking application.

The core purpose is:

> Write or paste knowledge → save it → KNODES analyzes it → extracts concepts and claims/statements → identifies prerequisites and relationships → builds/updates the knowledge graph → reports the result through a clear visual processing experience.

The experience should make the user feel that they are feeding information into a living knowledge system rather than simply saving a document.

The interface must communicate progress without overwhelming the learner with technical ML/LLM terminology.

The UI should make the ingestion process feel:

- Intelligent
- Fast
- Transparent
- Trustworthy
- Calm
- Interactive
- Slightly futuristic
- Easy to understand

The user should never need to understand embeddings, cosine similarity, model calls, databases, background tasks, or internal grading mathematics.

Those are implementation details.

---

# 1. Important Product Constraint

The current project specification describes a Markdown-based note editor using plain Markdown and `[[wikilink]]` syntax.

The note save action triggers ingestion.

The project design does NOT include a user-facing manual verification/approval step for extracted claims.

Therefore:

- The user may edit their original note before saving.
- The system may visually show what it extracted.
- The system may visually show automated processing/validation states.
- The user should NOT be asked to manually approve every extracted claim.
- Extracted claims should not become a second editable document inside the Notes Page.
- The UI should never make it appear that the user is personally certifying the extracted ground truth.

The validation experience is therefore an automated system-status experience, not a human approval workflow.

---

# 2. Overall Page Philosophy

The Notes Page should have two major states:

## State A — Writing

The learner is creating the source material.

## State B — Processing / Knowledge Extraction

The learner has saved the note and KNODES is turning it into structured knowledge.

The user should be able to understand the complete journey:

```text
WRITE
  ↓
SAVE
  ↓
ANALYZE
  ↓
EXTRACT
  ↓
STRUCTURE
  ↓
LINK
  ↓
BUILD / UPDATE GRAPH
  ↓
DONE
```

---

# 3. Desktop Layout

Use a Claude-inspired application shell.

```text
┌───────────────────────────────────────────────────────────────┐
│ KNODES        Search                 Notification   Avatar    │
├───────────────┬───────────────────────────────────────────────┤
│               │                                               │
│   SIDEBAR     │                 NOTES WORKSPACE               │
│               │                                               │
│   🧠 Brain    │   New Note                                    │
│   📝 Notes    │                                               │
│   🎯 Retest   │   ┌────────────────────────────────────────┐  │
│   📈 Insights │   │ Note title                            │  │
│   👤 Profile  │   ├────────────────────────────────────────┤  │
│               │   │                                        │  │
│               │   │ Markdown editor                        │  │
│               │   │                                        │  │
│               │   │                                        │  │
│               │   └────────────────────────────────────────┘  │
│               │                                               │
│               │   Word count       Save to Brain              │
└───────────────┴───────────────────────────────────────────────┘
```

---

# 4. Main Navigation

Use the same global navigation language as the Brain Page.

Sidebar:

```text
🧠 Brain
📝 Notes
🎯 Retest
📈 Insights
👤 Profile
```

Notes is the active section.

Active indicator:

- Duolingo green
- Soft green background
- Strong text contrast
- Minimal animation

The active navigation item should have a subtle left/side accent rather than a heavy filled rectangle.

---

# 5. Notes Page Header

Header:

```text
Notes
Turn what you learn into structured knowledge.
```

Secondary helper text:

```text
Write naturally. KNODES will extract concepts,
claims, prerequisites and relationships automatically.
```

Top-right actions:

```text
Drafts
Import
New Note
```

Primary action:

```text
Save to Brain
```

Do not use a generic "Submit" label.

"Save to Brain" communicates what actually happens.

---

# 6. Note Editor

## Editor style

Use a premium Markdown editor.

Do NOT design it like Microsoft Word.

Do NOT use a large ribbon toolbar.

Use a minimal writing surface.

Visual references:

- Claude
- Notion
- Obsidian
- Linear writing surfaces

---

# 7. Editor Structure

Top:

```text
Untitled Note
```

Below title:

```text
Subject / optional topic
```

Main body:

```text
# JavaScript Hoisting

JavaScript declarations are processed during
the creation phase before execution begins.

Variables declared using `var` are initialized
to `undefined`.
```

Bottom editor bar:

```text
Markdown     124 words     3 min read
                                      Save to Brain
```

---

# 8. Markdown Support

The prototype should communicate support for:

- Headings
- Paragraphs
- Bullet lists
- Numbered lists
- Code blocks
- Inline code
- Bold
- Italic
- Links
- `[[wikilinks]]`

Do not create a complex rich-text editor.

The visual experience should remain lightweight.

---

# 9. Wikilink Experience

When the user types:

```text
[[JavaScript Hoisting]]
```

show a subtle autocomplete popup.

Example:

```text
Link to concept

🔵 JavaScript Hoisting
🟢 Hoisting Mechanism
⚪ Variable Scope

Create new concept
```

Existing graph concepts should appear first.

If no match exists:

```text
No existing concept found.

Create concept link
```

Do not force the user to select a concept.

---

# 10. Draft System

The Notes Page should automatically maintain a draft state.

Top-left or bottom status:

```text
Saved locally
```

or:

```text
Unsaved changes
```

or:

```text
Saving...
```

Use subtle status animation.

Avoid disruptive save modals.

---

# 11. Draft Edge Cases

## Empty note

If the title and body are empty:

Disable:

```text
Save to Brain
```

Show:

```text
Start writing something first.
```

Do not show an error toast immediately.

---

## Title only

If the title exists but no body exists:

Allow draft save.

Do not send to ingestion until there is meaningful content.

---

## Very short note

Example:

```text
Hoisting
```

Save button can work, but ingestion should display:

```text
Not enough information to extract meaningful structure yet.

Your note was saved safely.
Add more explanation and process detail for better knowledge extraction.
```

Do not fabricate concepts from a one-word note.

---

# 12. Auto-Save

Auto-save should happen silently.

Indicator states:

```text
Saving...
Saved just now
Saved 12 sec ago
Offline — saved locally
```

Never display technical API errors in the main editor.

---

# 13. Character / Word Limit

Show a calm counter:

```text
1,284 words
```

Avoid aggressive limits.

If a maximum input size exists:

```text
4,820 / 10,000 words
```

When nearing the limit:

```text
8,900 / 10,000
```

Use an amber warning.

At maximum:

```text
You've reached the note limit.
Split this note into smaller concepts for better extraction.
```

Do not delete or truncate the user's content.

---

# 14. Save-to-Brain Action

Primary CTA:

```text
Save to Brain →
```

On click:

1. Validate the note input locally.
2. Save the original note.
3. Lock the ingestion snapshot.
4. Start background processing.
5. Immediately transition the UI into an extraction experience.
6. Keep the user informed of progress.
7. Return to the completed-note state when processing finishes.

The save action should feel immediate.

Do not leave the user staring at a frozen button.

---

# 15. Save Animation

On click:

Button becomes:

```text
Saving...
```

Then:

```text
✓ Note saved
```

The button transforms into a progress indicator:

```text
● Analyzing note
```

The transition should be fluid.

Recommended animation:

- Button compresses slightly
- Checkmark appears
- Button expands into progress state
- Small particles/lines travel toward a simplified brain icon

Do NOT use excessive confetti.

This is a learning tool, not a game victory screen.

---

# 16. Extraction Experience

After saving, show an extraction panel.

Preferred design:

Centered modal/drawer over the page.

The editor remains visible in the background with reduced opacity.

Example:

```text
┌─────────────────────────────────────────────┐
│ Building your knowledge                     │
│                                             │
│ ✓ Note saved                                │
│ ● Reading your note                         │
│ ○ Extracting concepts                       │
│ ○ Identifying claims                        │
│ ○ Finding prerequisites                     │
│ ○ Connecting knowledge                      │
│ ○ Updating your Brain                       │
│                                             │
│        [ animated knowledge graph ]         │
└─────────────────────────────────────────────┘
```

---

# 17. Extraction Pipeline Visualization

This is one of the most important animations of the page.

Represent the pipeline visually:

```text
NOTE
  ↓
ANALYZE
  ↓
CONCEPTS
  ↓
CLAIMS
  ↓
PREREQUISITES
  ↓
RELATIONSHIPS
  ↓
BRAIN
```

Each stage should activate sequentially.

Current stage:

- animated pulse
- moving indicator
- subtle green glow

Completed stage:

- green check
- becomes stable

Future stage:

- muted gray

---

# 18. Animated "Thinking" State

When the LLM/processing is working:

Do not show:

```text
Loading...
```

Show meaningful language.

Examples:

```text
Reading your note...
```

```text
Finding the important ideas...
```

```text
Separating concepts from statements...
```

```text
Mapping prerequisites...
```

```text
Connecting this knowledge to your Brain...
```

Rotate between phrases every few seconds if processing takes time.

---

# 19. Concept Extraction Animation

When concepts are discovered, animate them appearing.

Example:

```text
              JavaScript
                  ●
                 / \
                /   \
          Hoisting   Scope
              ●        ●
```

Concepts should appear one by one.

Animation:

- Node scale from 0.6 → 1
- Fade from 0 → 1
- Small glow on creation
- Connections draw from source toward target

Avoid fast flashing.

---

# 20. Concept Extraction Result

Display a small card:

```text
Concepts found

4 concepts

JavaScript
Hoisting
Creation Phase
Variable Scope
```

Do not turn every concept into a giant card.

Use compact chips/nodes.

---

# 21. Statement / Claim Extraction

The system should distinguish concepts from claims/statements.

Example note:

```text
JavaScript declarations are processed
during the creation phase.

var variables are initialized to undefined.
```

Extraction result:

```text
CONCEPT
Hoisting

STATEMENTS
✓ Declarations are processed during creation.
✓ var variables are initialized to undefined.
```

Use the word:

```text
Claims
```

as the technical label where appropriate, but the learner-friendly label can be:

```text
Key statements
```

Suggested display:

```text
Key statements
2 extracted
```

Clicking expands the list.

---

# 22. Statement Extraction Animation

Animate each statement as a horizontal card entering from the right.

Example:

```text
+-----------------------------------------+
| ✓ var variables are initialized to      |
|   undefined during creation.            |
+-----------------------------------------+
```

Each card should briefly glow when added.

---

# 23. Automated Validation

This stage is a visual system process.

Use:

```text
Checking extracted statements...
```

For each statement, possible statuses:

### Valid / usable

```text
✓ Structured
```

Meaning:

The system successfully converted the content into a claim.

---

### Incomplete

```text
△ Incomplete statement
```

Example:

```text
"Variables are handled..."
```

System message:

```text
This statement does not contain enough information
to establish a meaningful claim.
```

UX behavior:

- Keep the original note untouched.
- Do not create a strong knowledge claim from it.
- Continue processing other valid information.
- Show a non-blocking notice in the result summary.

---

### Ambiguous

```text
? Ambiguous
```

Example:

```text
"Hoisting happens first."
```

Possible reason:

```text
The statement does not clearly identify what
"first" refers to.
```

UX behavior:

- Do not block ingestion of other valid claims.
- Do not invent context.
- Mark this extraction result as unresolved internally.
- Show it only as a processing warning if the backend supports this status.

---

### Question rather than claim

Example:

```text
Why does hoisting happen?
```

Display:

```text
Not a claim
```

Meaning:

The content is a question, not factual knowledge by itself.

UX behavior:

- Preserve it in the original note.
- Do not create a knowledge claim from the question alone.
- Continue extraction.

---

### Instruction rather than claim

Example:

```text
Run this code and observe the result.
```

Status:

```text
Not a knowledge claim
```

Do not convert instructions into claims unless the extraction system identifies meaningful knowledge.

---

### Heading only

Example:

```text
# Hoisting
```

Status:

```text
Context only
```

Do not create an unsupported factual claim.

---

# 24. Invalid / Unusable Statement Handling

The system must NOT punish the user because their notes are messy.

The user should see:

```text
Some content could not be structured.
Your original note is safe.
```

Then:

```text
2 statements structured
1 statement skipped
```

Use language like:

```text
Skipped because it did not contain enough information.
```

Never say:

```text
Your knowledge is wrong.
```

The Notes Page is about ingestion, not assessment.

---

# 25. Critical UX Rule for Invalid Content

Never automatically rewrite the user's note.

Never silently alter their source material.

The original note remains the user's source record.

The extraction system creates a structured representation separately.

---

# 26. Duplicate Statement Handling

If two sentences express the same claim using different wording:

Example:

```text
var starts with undefined.
```

and:

```text
var is initialized to undefined during creation.
```

The system should treat them as semantically related rather than creating two separate claims.

UI result:

```text
2 statements
→ 1 structured claim
```

Animation:

The duplicate-looking cards gently move together and merge into one card.

Display:

```text
Merged similar statements
```

Do not make the learner perform the merge manually.

---

# 27. Duplicate Concept Handling

If the graph already contains:

```text
JavaScript Hoisting
```

and the new note mentions:

```text
hoisting
```

The system should prefer linking to the existing concept rather than visually creating an obviously duplicated concept.

UI animation:

A new temporary concept node travels toward the existing node and merges into it.

Example:

```text
New note concept
      ●
       \
        \ merge
         ● Existing Hoisting
```

Result:

```text
Existing concept updated
+ 2 new claims
```

---

# 28. New Concept Handling

If a concept does not exist:

```text
New concept discovered

Creation Phase
```

Animation:

A new node grows from the extraction panel and then flies toward the Brain icon.

Then:

```text
Added to Brain
```

---

# 29. Prerequisite Detection

The system may identify prerequisite concepts during ingestion.

Example:

```text
Hoisting
REQUIRES
Creation Phase
```

Show this as:

```text
Prerequisite found

Hoisting
   ↓ requires
Creation Phase
```

Use a directed relationship line.

Make this visually distinct from a normal semantic connection.

---

# 30. Existing Prerequisite

If the prerequisite already exists:

```text
✓ Existing prerequisite connected

Hoisting
   ↓ REQUIRES
Creation Phase
```

Animation:

Draw the edge from the new concept toward the existing concept.

Do not create a duplicate node.

---

# 31. Missing Prerequisite / Locked Node

If the system identifies a prerequisite that does not exist in the user's knowledge graph:

Create a locked prerequisite representation.

Example:

```text
Hoisting
   ↓ REQUIRES
🔒 Creation Phase
```

Meaning:

```text
This concept appears necessary,
but it has not been established in your Brain yet.
```

This should be visually represented as a locked node.

The locked node should use:

- Muted neutral node color
- Small lock icon
- Dashed connection
- Slightly reduced opacity
- No recall ring yet because it is not an established learner concept

---

# 32. Locked Prerequisite Result

Display:

```text
1 prerequisite needs to be learned

🔒 Creation Phase

Recommended next step:
Learn this concept before relying on Hoisting.
```

Button:

```text
Learn this concept
```

Secondary:

```text
View in Brain
```

Do not imply that the LLM is objectively correct.

Use wording:

```text
KNODES identified this as a prerequisite.
```

Not:

```text
This is definitely required.
```

---

# 33. Locked Node Interaction

Clicking the locked prerequisite:

Open Concept Preview.

Display:

```text
Creation Phase
Locked prerequisite
```

Message:

```text
This concept was identified as relevant,
but it is not yet established in your knowledge graph.
```

CTA:

```text
Add notes about this concept
```

After the user provides content later:

```text
🔒 Creation Phase
```

becomes:

```text
● Creation Phase
```

and the prerequisite relationship becomes normal.

---

# 34. Relationship Discovery

The extraction flow can show:

```text
Building connections...
```

Then show:

```text
2 prerequisites
4 related connections
1 existing concept updated
2 new concepts
```

The exact relationship types may include:

- explicit wikilink
- semantic similarity
- REQUIRES / prerequisite

These should be visually distinct.

---

# 35. Graph-Building Animation

Use a miniature graph during processing.

Start:

```text
●
```

Then:

```text
●────●
```

Then:

```text
     ●
    /
●──●
    \
     ●
```

Then:

```text
        ●
       / \
      /   ●
     /
●───●
     \
      ●
```

The animation should communicate that knowledge is becoming connected.

---

# 36. Embedding / Semantic Processing

Do NOT expose technical terminology in the primary UI.

Avoid:

```text
Generating vector embeddings...
```

Instead show:

```text
Finding connections to existing knowledge...
```

Optional secondary technical tooltip for demo/expert mode:

```text
Semantic matching in progress
```

This can exist as hidden detail, but should not dominate the normal learner experience.

---

# 37. Extraction Complete Screen

When processing finishes:

```text
✓ Your knowledge is now in KNODES
```

Then summary:

```text
1 note processed
4 concepts found
8 key statements structured
2 prerequisites identified
5 connections created
1 existing concept updated
```

Primary button:

```text
View in Brain
```

Secondary:

```text
Continue writing
```

---

# 38. Completion Animation

The final extraction animation should connect directly into the Brain experience.

Suggested sequence:

1. Final processing stage turns green.
2. Extracted nodes gather together.
3. They form a miniature knowledge graph.
4. Graph zooms outward.
5. Graph transitions toward a Brain icon.
6. "Added to Brain" appears.
7. CTA appears.

Keep the animation under approximately 2–3 seconds.

The user should never be forced to watch a long animation.

Allow:

```text
Skip
```

for repeated users.

---

# 39. Processing Timeline

A visible progress timeline can show:

```text
✓ Note saved
✓ Concepts extracted
✓ Claims structured
✓ Prerequisites mapped
✓ Connections built
✓ Brain updated
```

Each completed step becomes quieter after completion.

The current step remains visually prominent.

---

# 40. Background Processing State

Because ingestion can run in the background, the user must not be trapped inside the processing view.

After a reasonable period, show:

```text
This is taking a little longer than usual.

Your note is safely saved.
You can continue using KNODES while we finish processing it.
```

Buttons:

```text
Continue to Brain
Stay here
```

---

# 41. Processing Notification

If the user leaves the Notes Page before extraction completes:

Show a subtle notification when done:

```text
✓ "JavaScript Fundamentals" finished processing.
```

Click:

```text
Open result
```

The notification should never block normal navigation.

---

# 42. Extraction Failure

If the LLM or extraction service fails:

DO NOT delete the note.

Show:

```text
Your note was saved,
but we couldn't finish structuring it yet.
```

Status:

```text
Processing failed
```

Actions:

```text
Retry extraction
View note
```

Secondary informational text:

```text
Your original note is safe.
```

---

# 43. Temporary Network Failure

If the save request itself fails:

```text
Couldn't reach KNODES.
Your draft is still here.
```

Button:

```text
Try again
```

Do not clear the editor.

Do not navigate away automatically.

---

# 44. Backend Timeout

If processing times out:

```text
Still processing in the background.
```

The note should appear in:

```text
Processing
```

within the Notes list.

Possible status:

```text
● Processing
```

Do not call it failed immediately if the backend has not confirmed failure.

---

# 45. Partial Extraction Failure

Example:

- Concepts extracted successfully
- Claims partially extracted
- Relationship generation fails

Show:

```text
Partially structured

4 concepts found
6 statements structured
Connections are still being built
```

Allow the user to continue.

The system should not present the entire ingestion operation as a total failure.

---

# 46. No Concepts Found

If the note contains information but no distinct concept can be extracted:

```text
No clear concepts found yet.

Your note was saved, but KNODES couldn't
identify a stable concept structure from it.
```

Button:

```text
Edit note
```

Secondary:

```text
Keep note
```

Do not fabricate a concept simply to make the graph look populated.

---

# 47. No Claims Found

If a concept is detected but no meaningful claims are extracted:

```text
Concept detected
Hoisting

No structured claims could be established from this note yet.
```

Action:

```text
Add more explanation
```

Do not represent empty concepts as fully understood.

---

# 48. Conflicting Information

The current project specification does not define a complete user-facing contradiction-resolution workflow.

Therefore, if contradiction detection is implemented in the backend, design the prototype as a non-blocking warning.

Example:

```text
Potential conflict detected

A statement in this note may conflict with
existing knowledge associated with "Hoisting".
```

Status:

```text
Needs attention
```

Do not give the user a fake "Resolve" workflow unless the backend team defines what resolution means.

Optional future CTA:

```text
View related knowledge
```

Do not silently overwrite existing knowledge.

---

# 49. Unsupported Content

If the note contains content that is difficult to structure:

Examples:

- Raw URLs
- Huge pasted logs
- Random fragments
- Screenshots represented as pasted text
- Code without explanatory context
- Personal reminders
- Non-knowledge metadata

The system should preserve it in the note.

Processing result:

```text
Some content remained unstructured.
```

This is not an error.

---

# 50. Code Block Handling

When users include code:

```javascript
const x = 10;
console.log(x);
```

The editor should visually preserve syntax highlighting.

During extraction, the UI may display:

```text
Code detected
```

If the code itself supports an explainable concept, the extraction process may use surrounding prose to identify knowledge.

Do not assume code alone represents a concept.

---

# 51. Long Notes

For long notes, show:

```text
Analyzing a larger note
This may take a little longer.
```

Behind the scenes the backend may process chunks.

The UI should NOT expose chunk IDs, token counts, embeddings, or implementation details.

The note should still appear as a single user-owned note.

---

# 52. Multiple Concepts in One Note

Example:

```text
Networking
TCP
UDP
Three-way handshake
Ports
```

The result should show:

```text
5 concepts discovered
```

Then:

```text
Primary concept
Networking

Related concepts
TCP
UDP
Three-way Handshake
Ports
```

Use hierarchy visually.

Avoid presenting every concept as equal if the extracted structure contains obvious relationships.

---

# 53. Existing Knowledge Update

If the user writes more information about an existing concept:

```text
Concept already exists

TCP Handshake

+ 3 new claims
+ 2 relationships
```

Animation:

Existing node pulses.

New claims enter the concept.

Related edges draw outward.

The user's Brain should visibly evolve rather than duplicate itself.

---

# 54. Note Versioning

The source note should have a visible last-updated time:

```text
Updated just now
```

If re-saved:

```text
Updated 2 min ago
```

If versioning exists in the backend, the UI may show:

```text
3 versions
```

Do not add a complicated version browser unless the project implements it.

---

# 55. Notes List

The page should include a compact notes browser.

Suggested layout:

```text
Your Notes

[ Search notes... ]

All     Processing     Completed

────────────────────────────────

JavaScript Fundamentals
8 concepts · 14 claims
Updated 5 min ago
✓ In Brain

Networking Basics
5 concepts · 9 claims
Processing...

Operating Systems
12 concepts · 22 claims
✓ In Brain
```

---

# 56. Note Search

Search by:

- title
- note text
- concept name

Search state:

```text
Searching...
```

No results:

```text
No notes match "TCP".
```

CTA:

```text
Create a new note
```

---

# 57. Notes List Statuses

Use these statuses:

```text
Draft
Processing
Completed
Partially structured
Failed — retry available
```

Use icons + text, not color alone.

---

# 58. Processing Badge

Processing:

```text
● Processing
```

with a subtle moving dot.

Completed:

```text
✓ In Brain
```

Failed:

```text
! Retry
```

Draft:

```text
Draft
```

---

# 59. Mobile Layout

Desktop editor:

Two-column optional layout.

Mobile:

Single-column writing interface.

Structure:

```text
Header
Title
Subject
Editor
Editor status
Save to Brain
```

The extraction process becomes a bottom sheet or full-screen status screen.

Do not use a fixed sidebar on mobile.

Use bottom navigation:

```text
Brain | Notes | Retest | Insights | Profile
```

---

# 60. Tablet Layout

Use:

- compact sidebar
- large editor
- extraction drawer instead of centered modal

Keep the editor readable.

---

# 61. Visual Design Language

Use the KNODES visual identity established for the Brain Page.

Primary:

Duolingo-inspired green.

Suggested:

```text
#58CC02
```

Secondary blue:

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

Dark background:

```text
#111827
```

Neutral text:

```text
#374151
```

Use dark text on light backgrounds.

Avoid overusing bright green.

Green should communicate:

- progress
- successful processing
- healthy structure
- active primary action

---

# 62. Card Design

Cards should be:

- rounded
- lightweight
- soft borders
- subtle elevation
- generous internal spacing

Do not create a dashboard full of heavy rectangular cards.

The Notes Page should feel like a workspace.

---

# 63. Typography

Use:

- Inter
- Geist

Hierarchy:

Page title:
28–34px

Section title:
18–22px

Body:
14–16px

Metadata:
12–13px

Buttons:
14–15px

Avoid decorative typography.

---

# 64. Animation Language

Animations should communicate state.

Use animation for:

- saving
- extraction
- concept discovery
- claim discovery
- relationship formation
- graph update
- completion
- error recovery

Avoid animation for:

- static metadata
- every hover
- every card
- every text transition

The interface should feel alive, not noisy.

---

# 65. Reduced Motion

Respect `prefers-reduced-motion`.

For users who prefer reduced motion:

- replace graph animations with fades
- disable floating movement
- remove particle effects
- keep status transitions understandable

---

# 66. Accessibility

Every processing state must be understandable without color.

Examples:

Instead of:

```text
Green = complete
Red = failed
```

also use:

```text
✓ Complete
! Failed
```

Buttons must have clear labels.

Tooltips should not contain the only important information.

Keyboard focus should be visible.

Editor should be keyboard friendly.

---

# 67. Error Messaging Principles

Never blame the user.

Bad:

```text
Invalid input.
```

Better:

```text
We couldn't structure this part of the note yet.
```

Bad:

```text
LLM extraction failed.
```

Better:

```text
We couldn't finish structuring this note.
Your original note is safe.
```

Bad:

```text
Invalid statement.
```

Better:

```text
This statement didn't contain enough information
to establish a reliable knowledge claim.
```

---

# 68. Trust Design

The Notes Page should visually distinguish:

## Source

The user's original note.

## Structured Knowledge

What KNODES extracted from the note.

This distinction is critical.

Use labels:

```text
YOUR NOTE
```

and:

```text
STRUCTURED BY KNODES
```

Never make the extracted representation look like the user wrote it.

---

# 69. Extraction Result Layout

Recommended final structure:

```text
┌─────────────────────────────────────────────┐
│ ✓ Knowledge added to Brain                  │
│                                             │
│ JavaScript Fundamentals                     │
│                                             │
│ Concepts                         4           │
│ Claims                           8           │
│ Prerequisites                    2           │
│ Connections                      5           │
│ Existing concepts updated        1           │
│                                             │
│ ─────────────────────────────────────────── │
│                                             │
│ New concepts                                   │
│ ● Hoisting                                  │
│ ● Creation Phase                            │
│                                             │
│ Key statements                              │
│ ✓ Declaration phase...                      │
│ ✓ var initializes...                        │
│                                             │
│ Prerequisites                               │
│ Hoisting → Creation Phase                   │
│                                             │
│ [ View in Brain ]   [ Continue writing ]    │
└─────────────────────────────────────────────┘
```

---

# 70. Extraction Result "Confidence" Language

Do not show arbitrary confidence percentages to the learner unless the backend explicitly provides and justifies them.

Avoid:

```text
Extraction confidence: 97%
```

Prefer categorical system states:

```text
Structured
Partially structured
Unresolved
Skipped
```

This avoids creating a misleading precision signal.

---

# 71. Processing State Machine

The prototype should be prepared to represent:

```text
DRAFT
  ↓
SAVED
  ↓
PROCESSING
  ↓
EXTRACTING_CONCEPTS
  ↓
EXTRACTING_CLAIMS
  ↓
MAPPING_PREREQUISITES
  ↓
LINKING
  ↓
UPDATING_GRAPH
  ↓
COMPLETED
```

Error branches:

```text
PROCESSING
  ↓
PARTIAL
```

or:

```text
PROCESSING
  ↓
FAILED
  ↓
RETRYING
  ↓
PROCESSING
```

---

# 72. Retry Animation

When retrying:

Button:

```text
Retrying...
```

Timeline:

```text
✓ Note saved
✓ Previous attempt completed
● Retrying extraction
○ Rebuilding structure
```

Do not restart the visual timeline in a way that makes it look like the note disappeared.

---

# 73. Duplicate Retry Protection

If the user presses Retry multiple times quickly:

Disable the button while retrying.

Do not create duplicate processing jobs.

Button:

```text
Retrying...
```

with disabled state.

---

# 74. Browser Refresh During Processing

If the user refreshes the page while processing:

When returning:

```text
Processing status restored
```

Show:

```text
"JavaScript Fundamentals"
● Still processing
```

The status must come from the backend or persisted app state rather than relying only on local UI state.

---

# 75. Closing the Extraction Modal

If processing is active and the user clicks close:

Do NOT cancel ingestion unless cancellation is actually supported.

Show:

```text
Processing will continue in the background.

You can safely continue using KNODES.
```

Buttons:

```text
Continue
Stay
```

---

# 76. Browser Tab Close

Do not warn the user just because a background task exists if the backend supports it.

If the implementation does not guarantee background continuation, display a lightweight warning:

```text
Your note is saved.
Processing may continue when you return.
```

---

# 77. Offline Mode

If the user loses internet connection while editing:

Banner:

```text
You're offline.
Your draft is saved locally.
```

Restore automatically when connection returns.

Show:

```text
Back online
Syncing draft...
```

then:

```text
✓ Draft synced
```

Do not lose typed content.

---

# 78. Duplicate Note Submission

If the same note is submitted twice:

The UI should avoid making the user wonder whether they now have duplicate knowledge.

Possible result:

```text
Similar note already exists
```

Then:

```text
Updated existing knowledge
```

rather than visually creating identical duplicates.

Exact behavior depends on the final backend deduplication rules.

---

# 79. Import Flow

If Import is included in the prototype:

Primary import choices:

```text
Paste Markdown
Upload Markdown
```

Avoid building a huge file import marketplace.

The imported content should enter the same editor before final save.

Use:

```text
Import → Review note → Save to Brain
```

Do not bypass the user's source preview.

---

# 80. Import Failure

Example:

```text
Couldn't import this file.
```

Reason:

```text
The file format isn't supported.
```

Action:

```text
Choose another file
```

Keep the user on the Notes Page.

---

# 81. Paste Formatting

When pasting:

Preserve useful Markdown structure where possible.

Avoid automatically making the pasted content beautiful.

The user should remain in control of the source note.

---

# 82. Note Completion Microcopy

Useful messages:

```text
Ready to build your Brain.
```

```text
Your note is saved.
```

```text
Finding the ideas that matter...
```

```text
Turning statements into structured knowledge...
```

```text
Looking for prerequisite concepts...
```

```text
Connecting this to what you already know...
```

```text
Your Brain just grew.
```

Use the final line sparingly.

---

# 83. The "Brain Just Grew" Animation

Optional finishing animation.

After completion:

```text
+1 Knowledge Area
```

then a tiny graph pulse.

This is the Notes Page equivalent of a Duolingo-style positive reinforcement moment.

It should be subtle.

Do not turn every note into an achievement ceremony.

---

# 84. Empty Notes List

When the user has no notes:

```text
Your Brain starts here.
```

Subtext:

```text
Write your first note and KNODES will turn it
into connected knowledge.
```

CTA:

```text
Create your first note
```

Use a minimal illustration showing a few connected nodes.

---

# 85. First-Time Onboarding

On the first visit, display a compact 3-step hint:

```text
1. Write naturally
2. Save to Brain
3. Explore what KNODES discovered
```

Dismissible.

Never block the editor.

---

# 86. Processing Demo for Figma Prototype

Figma AI should create one complete believable demo flow.

Example input:

```text
# JavaScript Hoisting

JavaScript declarations are processed during
the creation phase before execution.

var variables are initialized to undefined.
let and const remain uninitialized until execution.
```

Animation should produce:

Concepts:

```text
JavaScript
Hoisting
Creation Phase
Variable Initialization
```

Claims:

```text
Declarations are processed during creation.
var is initialized to undefined.
let and const remain uninitialized until execution.
```

Prerequisite:

```text
Hoisting → REQUIRES → Creation Phase
```

Graph result:

```text
Creation Phase
      ↑
   requires
      |
   Hoisting
    /    \
 var    let/const
```

Use this as the primary prototype walkthrough.

---

# 87. Demo Invalid Statement Flow

Also create a prototype state for:

Input:

```text
Hoisting happens first.
Variables...
```

Result:

```text
2 statements found

✓ Variables are...
△ "Hoisting happens first."

Skipped:
The second statement did not contain enough
context to establish a useful claim.
```

Button:

```text
View note
```

Not:

```text
Fix automatically
```

---

# 88. Demo Missing Prerequisite Flow

Create a second prototype state:

```text
Concept:
Hoisting

Prerequisite:
🔒 Creation Phase
```

Display:

```text
KNODES identified a prerequisite that
isn't in your Brain yet.
```

CTA:

```text
Learn Creation Phase
```

This should connect naturally to the Brain page.

---

# 89. Demo Existing Concept Update Flow

Create another prototype state:

```text
Existing concept found

Hoisting

+2 new claims
+1 relationship
```

Animate a new extraction node merging into the existing graph node.

This demonstrates that KNODES grows a connected system rather than collecting isolated notes.

---

# 90. Editor vs. Extraction Separation

During processing:

The editor should become visually secondary.

Use:

```text
opacity: 0.45–0.65
```

Do not make it completely disappear.

The user should still recognize:

```text
This is my note.
This is what KNODES is doing with it.
```

---

# 91. Extraction Drawer Variant

An alternative to a modal is a right-side drawer.

Recommended when the viewport is wide.

Drawer:

```text
width: 420–480px
```

Left:

Original note.

Right:

Processing result.

This makes the source-to-knowledge transformation visible simultaneously.

This is a strong option for the Figma prototype.

---

# 92. Recommended Preferred Desktop Composition

Use a split transformation view:

```text
┌────────────────────────┬──────────────────────────────┐
│                        │                              │
│      YOUR NOTE         │       KNODES PROCESSING      │
│                        │                              │
│  Markdown              │ ✓ Note saved               │
│  content               │ ● Extracting concepts       │
│                        │ ○ Structuring claims        │
│                        │ ○ Mapping prerequisites     │
│                        │ ○ Building connections      │
│                        │                              │
│                        │      miniature graph        │
│                        │                              │
└────────────────────────┴──────────────────────────────┘
```

This layout communicates the project's entire concept extremely well.

---

# 93. Information Hierarchy During Processing

Priority 1:

```text
What is happening?
```

Priority 2:

```text
What has already completed?
```

Priority 3:

```text
What did KNODES discover?
```

Priority 4:

```text
Can I continue using the app?
```

Do not prioritize technical implementation details.

---

# 94. What NOT To Design

Do NOT design:

- Manual claim approval queues
- "Accept claim" buttons
- "Reject claim" buttons
- Editable extracted-ground-truth tables
- LLM chat conversation inside Notes
- Huge analytics dashboards
- Complex rich-text formatting
- Database/debug information
- Embedding/vector visualizations
- Raw JSON outputs
- Developer logs
- Model temperature/settings
- Prompt editing

Those belong to engineering/admin tooling, not this user-facing screen.

---

# 95. Relationship to Brain Page

After completion, the primary CTA is:

```text
View in Brain
```

The Brain Page should open with:

- newly created nodes highlighted
- new relationships highlighted
- updated existing concepts pulsing briefly
- locked prerequisites highlighted separately

Example:

```text
Your new knowledge is highlighted.
```

Then fade the highlights after a few seconds.

---

# 96. Relationship to Retest

The Notes Page should not immediately launch a quiz after every note.

However, if the system eventually supports it, the completion screen may offer:

```text
Ready to test this knowledge later.
```

This should be secondary.

Primary workflow:

```text
Save → Build Brain → Explore
```

Assessment is a separate experience.

---

# 97. Relationship to Recall / Half-Life

The Notes Page creates or updates knowledge.

Recall probability should be visible in the Brain Page node representation rather than becoming a major feature of the note editor.

After ingestion:

```text
Knowledge added
```

The Brain Page will later represent the learner's current recall/decay state.

Do not clutter the Notes Page with recall charts.

---

# 98. Final UX Flow

The complete ideal user journey:

```text
OPEN NOTES
   ↓
CREATE NOTE
   ↓
WRITE MARKDOWN
   ↓
AUTO-SAVE DRAFT
   ↓
CLICK "SAVE TO BRAIN"
   ↓
NOTE SAVED
   ↓
EXTRACTION ANIMATION
   ↓
CONCEPTS FOUND
   ↓
CLAIMS STRUCTURED
   ↓
AUTOMATED VALIDATION
   ↓
PREREQUISITES IDENTIFIED
   ↓
EXISTING CONCEPTS MATCHED
   ↓
NEW CONCEPTS CREATED
   ↓
RELATIONSHIPS BUILT
   ↓
LOCKED PREREQUISITES CREATED WHEN REQUIRED
   ↓
BRAIN UPDATED
   ↓
RESULT SUMMARY
   ↓
VIEW IN BRAIN
```

---

# 99. Final Design Goal

The page should make the following transformation visually obvious:

```text
BEFORE

"My messy notes"

        ↓

KNODES

"Structured understanding"

        ↓

AFTER

Concepts
Claims
Prerequisites
Relationships
Knowledge Graph
```

The emotional response should be:

> "I wrote something once, and KNODES turned it into connected knowledge."

---

# 100. Figma AI Implementation Notes

Figma AI should generate the following reusable components:

### Global

- App shell
- Sidebar
- Top navigation
- User avatar
- Notification
- Search

### Notes

- Notes page header
- Markdown editor
- Title input
- Subject input
- Editor toolbar
- Draft status
- Save to Brain button
- Notes list
- Search notes
- Note status badge

### Processing

- Extraction modal/drawer
- Processing timeline
- Stage indicator
- Animated concept nodes
- Statement/claim cards
- Validation status chips
- Prerequisite relationship visualization
- Locked prerequisite card
- Existing concept merge animation
- Extraction summary
- Success state
- Partial success state
- Error state
- Retry state

### Empty / Edge States

- Empty note
- Empty notes library
- No concepts found
- No claims found
- Incomplete statement
- Ambiguous statement
- Processing failure
- Partial processing
- Offline
- Long note
- Duplicate concept update
- Missing prerequisite

All states should use the same visual language as the Brain Page.

---

# 101. Prototype Screens Figma AI Should Produce

Create these screens/variants:

## Screen 01
Notes — Empty State

## Screen 02
Notes — Blank New Note

## Screen 03
Notes — Writing

## Screen 04
Notes — Autosaving

## Screen 05
Notes — Save to Brain

## Screen 06
Processing — Note Saved

## Screen 07
Processing — Concepts Extracting

## Screen 08
Processing — Claims Extracting

## Screen 09
Processing — Automated Validation

## Screen 10
Processing — Prerequisite Detection

## Screen 11
Processing — Graph Linking

## Screen 12
Processing — Existing Concept Match

## Screen 13
Processing — Locked Prerequisite

## Screen 14
Processing — Completed

## Screen 15
Processing — Partial Extraction

## Screen 16
Processing — Failed / Retry

## Screen 17
Processing — Long Running

## Screen 18
Notes — Completed Notes List

## Screen 19
Notes — Search Results

## Screen 20
Notes — Mobile Layout

---

# 102. Component State Naming

Use consistent names so future Figma/React work remains easy.

```text
NotesPage
NoteEditor
NoteTitleInput
NoteSubjectInput
MarkdownEditor
AutoSaveStatus
SaveToBrainButton
NotesList
NoteCard
NoteStatusBadge

ExtractionPanel
ExtractionTimeline
ExtractionStage
ConceptDiscovery
ClaimDiscovery
ClaimValidation
PrerequisiteDiscovery
RelationshipBuilder
LockedPrerequisite
MergeExistingConcept
ExtractionSummary

ProcessingError
PartialProcessing
RetryButton
OfflineBanner
```

---

# 103. Design Tokens

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

Border radius:

```text
8px
12px
16px
20px
24px
```

Prefer 12–20px for most cards and panels.

Buttons:

Height 40–48px.

Primary action:

Medium rounded rectangle.

Do not use pill buttons everywhere.

---

# 104. Final Figma Prompt Summary

Design the KNODES Notes Page as a calm, premium Markdown knowledge-ingestion workspace inspired by Claude and Linear, with Duolingo-inspired positive reinforcement.

The core experience is:

WRITE → SAVE → EXTRACT → STRUCTURE → CONNECT → BRAIN.

The most visually important part of the screen after saving is the automated extraction animation.

Show concepts appearing as graph nodes, claims appearing as structured statements, prerequisites becoming directed relationships, existing concepts merging rather than duplicating, and missing prerequisites appearing as locked nodes.

Support clear automated states for valid, incomplete, ambiguous, skipped, partial, failed, and completed processing.

Do not create manual claim approval.

Do not modify the user's original note automatically.

Preserve the distinction between:

"Your original note"

and

"Knowledge structured by KNODES".

The final experience should feel like watching a note transform into a living knowledge graph.
