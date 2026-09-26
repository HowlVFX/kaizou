# KNODES — Landing Page & Profile
## Figma AI Prototype Specification
### File: `04-Landing-Page-and-Profile.md`

---

# 0. Scope

This specification covers:

1. The public-facing single-page KNODES Landing Page
2. Login page
3. Sign-up page
4. Authentication navigation into the main app
5. The in-app Profile page

The Landing Page is intentionally designed last so it reflects the actual product that has already been defined.

The public page should explain the product clearly before asking the visitor to sign in.

The Profile page should remain simple because the core product value is in Brain, Notes, Retest, and Insights.

---

# 1. Important Global Navigation Rule

The main web application has a deliberately minimal top bar.

The top bar contains:

```text
KNODES logo / wordmark
```

and nothing else.

No:

- Search
- Notifications
- Settings
- Breadcrumbs
- Extra navigation links
- User avatar
- Buttons

The purpose is visual calm.

Top bar structure:

```text
┌──────────────────────────────────────────────────────────────┐
│  KNODES                                                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The logo should sit comfortably inside the top bar with generous whitespace.

The rest of the app navigation is handled through the sidebar / navigation system.

This minimal top bar rule applies across:

- Brain
- Notes
- Retest
- Insights
- Profile

---

# 2. KNODES Brand Direction

Brand name:

```text
KNODES
```

Concept:

```text
K + NODES
```

Meaning:

Knowledge represented as interconnected nodes.

Possible tagline:

```text
Build Understanding, Not Just Notes.
```

Alternative supporting phrase:

```text
Your knowledge. Connected.
```

Use the first as the primary marketing statement unless a later branding decision changes it.

---

# 3. Brand Personality

KNODES should feel:

- Intelligent
- Curious
- Modern
- Academic
- Friendly
- Premium
- Calm
- Slightly playful
- Technically sophisticated

Do not make it:

- Corporate
- Clinical
- Childish
- Overly futuristic
- Overly gamified
- Dense

The visual tone should sit between:

```text
Claude's calmness
+
Linear's precision
+
Duolingo's positive energy
```

---

# PART A — LANDING PAGE

# 4. Landing Page Goal

The Landing Page has one job:

> Make a first-time visitor understand why KNODES is different from ordinary note-taking and quiz applications, then lead them toward creating an account.

The page must communicate the product in less than a minute.

The visitor should understand:

1. KNODES turns notes into connected knowledge.
2. Knowledge becomes a graph.
3. KNODES helps review and test structural understanding.
4. The system detects what needs attention.
5. The user can explore their own Brain.

Primary CTA:

```text
Start Building Your Brain
```

Secondary CTA:

```text
Sign In
```

---

# 5. Landing Page Structure

The landing page is a SINGLE PAGE.

Do not create multiple marketing pages.

Recommended section flow:

```text
Hero
 ↓
How KNODES Works
 ↓
Knowledge Graph Showcase
 ↓
Understand, Don't Just Recall
 ↓
Retest / Structural Learning
 ↓
Insights
 ↓
Feature Summary
 ↓
Final CTA
 ↓
Footer
```

Use smooth scrolling.

Navigation can use anchor links only if required, but keep the page visually simple.

---

# 6. Landing Page Top Bar

Unlike the authenticated app, the public landing page may have a minimal marketing header.

However, keep it extremely clean.

Recommended:

```text
KNODES                         Sign In
```

Optional:

```text
Features
How It Works
```

Only add navigation links if the prototype needs them.

Do not create a busy SaaS navigation bar.

Primary CTA:

```text
Start Building Your Brain
```

---

# 7. Hero Section

Hero occupies approximately:

```text
80–90vh
```

Layout:

Left:

```text
Headline
Supporting text
Primary CTA
Secondary CTA
```

Right:

Large visual representation of the KNODES 3D Brain.

---

# 8. Hero Copy

Headline:

```text
Build Understanding,
Not Just Notes.
```

Supporting copy:

```text
KNODES turns what you learn into a connected knowledge graph,
then helps you remember, explain, and test how that knowledge works.
```

Primary button:

```text
Start Building Your Brain →
```

Secondary:

```text
Sign In
```

Optional microcopy:

```text
Your knowledge, connected.
```

---

# 9. Hero Visual

The hero visual should preview the actual application rather than being a generic abstract illustration.

Show a miniature 3D knowledge graph.

Example:

```text
              JavaScript
                  ●
                /   \
               /     \
          Hoisting    Scope
             ●          ●
            / \
           ●   ●
         var  TDZ
```

Nodes should have subtle recall indicators.

At least one red, one yellow, and several green indicators may appear in the demo.

This immediately previews the Brain Page.

---

# 10. Hero Graph Animation

On page load:

1. Graph fades in.
2. Nodes appear progressively.
3. Relationships draw in.
4. Recall indicators activate.
5. Camera slowly settles.

Use subtle movement.

Do not use a constantly rotating 3D object that distracts from the headline.

---

# 11. Hero CTA Interaction

Primary CTA:

```text
Start Building Your Brain
```

Click:

```text
→ Sign Up
```

Secondary CTA:

```text
Sign In
```

Click:

```text
→ Login
```

After successful authentication:

```text
→ Brain
```

---

# 12. Hero Scroll Cue

At the bottom:

```text
Explore how it works
↓
```

Use a subtle animation.

Do not use a large bouncing arrow.

---

# 13. Social Proof / Positioning Area

Do not invent fake customer logos or testimonials.

For a final-year project prototype, use conceptual positioning instead.

Example:

```text
A learning system built around
knowledge structure.
```

Then three compact concepts:

```text
CONNECT
Understand relationships.

RECALL
Fight forgetting.

TRANSFER
Apply what you know.
```

---

# 14. "How KNODES Works" Section

Title:

```text
From Notes to Understanding
```

Show four steps.

```text
01
Write

02
Structure

03
Connect

04
Retest
```

---

# 15. Step 01 — Write

Icon:

```text
📝
```

Text:

```text
Write what you learn naturally.
```

Description:

```text
Capture concepts, explanations, examples,
and notes in one place.
```

---

# 16. Step 02 — Structure

Icon:

```text
🧩
```

Text:

```text
KNODES structures your knowledge.
```

Description:

```text
Your notes are transformed into concepts,
claims, and meaningful knowledge structure.
```

Do not imply that every generated statement is manually approved by the user.

---

# 17. Step 03 — Connect

Icon:

```text
🔗
```

Text:

```text
See how ideas depend on each other.
```

Description:

```text
Your knowledge becomes a connected graph,
including prerequisite relationships.
```

---

# 18. Step 04 — Retest

Icon:

```text
🎯
```

Text:

```text
Test whether the knowledge still holds.
```

Description:

```text
Recall facts, explain mechanisms,
test changes, and transfer what you know.
```

---

# 19. Knowledge Graph Showcase

Title:

```text
Your knowledge has structure.
```

Supporting:

```text
Instead of a pile of notes, see the concepts,
relationships, and prerequisites behind what you learned.
```

Place a large 3D graph in the center.

---

# 20. Interactive Graph Demo

The landing-page graph should be a simplified demonstration.

Allow:

- Orbit
- Zoom
- Node hover
- Node click

When a demo node is clicked:

Show a compact concept card.

Example:

```text
Hoisting

Recall
82% · Healthy

Requires
Creation Phase

Connected concepts
Scope
TDZ
var
```

Do not allow the marketing demo to become as complex as the actual Brain Page.

---

# 21. Graph Recall Indicator Preview

Show small recall circles on demonstration nodes.

Use the same application language:

```text
75–100% = Healthy
50–74% = Weakening
0–49% = Needs Review
```

This creates visual consistency between Landing Page and Brain Page.

---

# 22. "Understanding Is More Than Recall" Section

Large statement:

```text
Remembering a fact
isn't the same as understanding it.
```

Supporting:

```text
KNODES looks beyond surface recall.
It explores relationships, mechanisms,
counterfactuals, and transfer.
```

Use a before/after visual.

---

# 23. Before / After Visual

Left:

```text
TRADITIONAL REVIEW

What is hoisting?

✓ Answered
```

Right:

```text
KNODES

How does hoisting work?

What changes if var becomes let?

What remains invariant?

Can you apply the mechanism
to a new case?
```

Keep the visualization conceptual.

---

# 24. Structural Understanding Section

Title:

```text
See how deep your knowledge goes.
```

Visual:

```text
Definition        ██████████
Mechanism         ████████
Relationships     ██████
Boundary          ████
Application       ███████
Counterfactual    ███
```

Label:

```text
Structural Evidence
```

Do not label it:

```text
Understanding = 78%
```

The application deliberately avoids presenting a simplistic percentage as objective understanding.

---

# 25. Retest Showcase

Title:

```text
Don't just answer.
Explain.
```

Visual:

A large mock Retest card.

Example:

```text
UNDERSTAND

Explain how the mechanism works
from beginning to end.

[ Your explanation... ]

              [ Evaluate ]
```

Then a feedback state:

```text
SHALLOW

You recalled the main facts,
but the relationship between
creation and execution was missing.

→ Review the missing concept
```

---

# 26. Counterfactual Showcase

Title:

```text
What happens when the rules change?
```

Show:

```text
WHAT CHANGES?

[................................]

WHAT STAYS THE SAME?

[................................]
```

Small visual mechanism:

```text
Creation
   ↓
Initialization
   ↓
Execution
```

Highlight one altered component.

---

# 27. Insights Showcase

Title:

```text
Understand your own learning.
```

Show a compact Insights dashboard.

Visual sections:

```text
Recall
76%

Concept Depth
Relational

Transfer
Developing

Misconceptions
2 recurring
```

This is a marketing preview, not the full Insights page.

---

# 28. Personal Brain Section

Large visual:

```text
YOUR BRAIN
```

Show a graph with multiple clusters.

Supporting copy:

```text
Every note you add becomes part of a
knowledge system that grows with you.
```

CTA:

```text
Start Building Your Brain
```

---

# 29. Feature Grid

Use 6 cards maximum.

### Connected Knowledge

Your ideas become an interconnected graph.

### Structural Understanding

See mechanisms, relationships, and missing evidence.

### Recall & Decay

Know what is strengthening and what needs review.

### Counterfactual Testing

Explore what changes when part of a mechanism changes.

### Transfer

Apply concepts beyond the original example.

### Learning Insights

See patterns in your knowledge over time.

Avoid making every feature card highly decorative.

---

# 30. Feature Card Interaction

On hover:

- Slight elevation
- Small icon movement
- Border emphasis

Do not create large 3D hover animations.

---

# 31. Trust / Explanation Section

Title:

```text
Built to separate extraction from assessment.
```

Supporting copy:

```text
KNODES can structure knowledge from your notes,
while assessment uses a separate deterministic evaluation process.
```

Keep it short on the landing page.

Do not expose the technical stack here.

---

# 32. Final CTA Section

Large centered section.

Headline:

```text
Build your Brain.
```

Supporting:

```text
Start with one note.
End with a connected understanding.
```

Primary:

```text
Start Building Your Brain →
```

Secondary:

```text
I already have an account
```

---

# 33. Footer

Minimal.

Left:

```text
KNODES
Build Understanding, Not Just Notes.
```

Right or center:

```text
Product
GitHub
About
```

Only show links that actually exist.

Do not invent social accounts.

Bottom:

```text
© 2026 KNODES
```

---

# 34. Landing Page Dark Mode

Use a dark hero/background if it improves the 3D graph visualization.

Suggested:

```text
#111827
```

Green:

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

The graph can use subtle luminous nodes.

Avoid neon overload.

---

# 35. Landing Page Light Mode

Suggested:

```text
#F7F7F7
```

Cards:

```text
#FFFFFF
```

Text:

```text
#374151
```

Primary:

```text
#58CC02
```

---

# 36. Landing Page Responsive Behavior

Desktop:

```text
Two-column hero
Large graph
Wide feature cards
```

Tablet:

```text
Centered hero
Smaller graph
Two-column features
```

Mobile:

```text
Centered hero
Stacked content
Graph simplified
One-column features
Large touch targets
```

---

# 37. Landing Page Animation Principles

Use:

- Scroll-triggered fades
- Subtle upward motion
- Graph node creation
- Graph connection drawing
- Button micro-interactions
- Section transitions

Do not animate entire sections continuously.

Respect reduced motion.

---

# 38. Landing Page Performance

The graph is a visual preview.

It should not load the full user's actual graph.

Use a small preconfigured demonstration graph.

This protects page performance.

---

# 39. Landing Page Accessibility

- All CTAs have readable labels
- Graph has an accessible textual fallback
- Contrast is sufficient
- Reduced-motion support
- Keyboard navigation
- Focus states
- Images have alt text
- Marketing copy remains understandable without animation

---

# PART B — AUTHENTICATION

# 40. Authentication Philosophy

Login and Sign Up should feel like part of KNODES, not like an external authentication system.

Keep them extremely simple.

---

# 41. Login Page

Desktop:

```text
┌──────────────────────────────────────────────────────────────┐
│                         KNODES                               │
│                                                              │
│                  Welcome back.                               │
│              Continue building your Brain.                  │
│                                                              │
│              Email                                        │
│              [____________________]                          │
│                                                              │
│              Password                                     │
│              [____________________]                          │
│                                                              │
│              [ Sign In ]                                      │
│                                                              │
│              Forgot password?                                │
│                                                              │
│              Don't have an account? Sign up                  │
└──────────────────────────────────────────────────────────────┘
```

No crowded navigation.

---

# 42. Login Branding

Top:

```text
KNODES
```

Center card:

```text
Welcome back.
```

Supporting:

```text
Continue building your knowledge.
```

---

# 43. Login Form

Fields:

```text
Email
Password
```

CTA:

```text
Sign In
```

Optional:

```text
Show password
```

---

# 44. Login Validation States

Empty:

```text
Please enter your email.
```

Invalid email:

```text
Enter a valid email address.
```

Missing password:

```text
Please enter your password.
```

Invalid credentials:

```text
Email or password is incorrect.
```

Do not reveal whether an email exists in a way that creates account enumeration risk.

---

# 45. Login Loading State

Button:

```text
Signing in...
```

Keep form visible.

Do not replace the screen with a full-page loading spinner.

---

# 46. Login Success

Small transition:

```text
Welcome back.
```

Then navigate:

```text
→ Brain
```

---

# 47. Login Network Error

```text
We couldn't connect to KNODES.

Please try again.
```

Button:

```text
Try again
```

Preserve entered email.

Avoid unnecessarily clearing fields.

---

# 48. Sign Up Page

Headline:

```text
Build your Brain.
```

Supporting:

```text
Start turning what you learn into connected knowledge.
```

Fields:

```text
Name
Email
Password
Confirm Password
```

CTA:

```text
Create Account
```

---

# 49. Sign Up Validation

Name empty:

```text
Enter your name.
```

Invalid email:

```text
Enter a valid email address.
```

Weak password:

```text
Use a stronger password.
```

Password mismatch:

```text
Passwords don't match.
```

Existing account:

```text
An account may already exist for this email.
Try signing in instead.
```

Use careful wording around account existence.

---

# 50. Password Strength

Show a compact indicator:

```text
Weak
Good
Strong
```

Do not make it a giant meter.

Use helpful requirements.

---

# 51. Sign Up Success

Animation:

- Checkmark
- Small node appears
- Node connects to two small placeholder nodes
- Transition toward Brain

Text:

```text
Your Brain is ready.
```

Button:

```text
Enter KNODES
```

---

# 52. Authentication Navigation

Primary flow:

```text
Landing
   ↓
Start Building Your Brain
   ↓
Sign Up
   ↓
Account created
   ↓
Brain
```

Returning user:

```text
Landing
   ↓
Sign In
   ↓
Brain
```

---

# 53. Authentication Edge Cases

Support prototype states for:

- Invalid email
- Wrong password
- Empty fields
- Password mismatch
- Weak password
- Network failure
- Server error
- Loading
- Successful login
- Successful signup
- Session expired

Session expired inside app:

```text
Your session has expired.

Please sign in again.
```

CTA:

```text
Sign In
```

Preserve local draft data where possible.

---

# PART C — PROFILE PAGE

# 54. Profile Purpose

The Profile Page is the personal account/control area.

It should NOT become another analytics dashboard.

Brain owns the graph.

Insights owns learning analytics.

Profile owns:

- Identity
- Account
- Personal overview
- Preferences
- Basic knowledge statistics
- App settings
- Sign out

---

# 55. Profile Layout

Use the global app shell.

Minimal top bar:

```text
KNODES
```

Nothing else.

Sidebar:

```text
Brain
Notes
Retest
Insights
Profile
```

Profile active.

---

# 56. Profile Header

Large avatar.

Example:

```text
C
```

Name:

```text
Chirag
```

Email:

```text
chirag@example.com
```

Member since:

```text
Member since August 2026
```

Primary action:

```text
Edit Profile
```

---

# 57. Profile Overview

Compact statistics:

```text
Concepts
124

Connections
318

Notes
36

Reviews Completed
82
```

These are snapshots, not the main analytics experience.

Clicking a statistic can route to the appropriate section:

```text
Concepts → Brain
Reviews → Retest
Learning data → Insights
Notes → Notes
```

---

# 58. Personal Knowledge Snapshot

Optional card:

```text
My Brain

124 concepts
318 connections

86 healthy
24 weakening
14 needs review

[ Open Brain ]
```

This creates a direct bridge to the core product.

---

# 59. Profile Sections

Organize into:

```text
Profile
Appearance
Learning Preferences
Account
```

Do not create ten separate settings pages.

---

# 60. Profile Information

Fields:

```text
Name
Email
Profile picture
```

Editable:

```text
Name
Profile picture
```

Email may be read-only if backend rules require verification.

---

# 61. Edit Profile

Use inline editing.

Example:

```text
Name
Chirag

[ Edit ]
```

After edit:

```text
[ Save changes ]
[ Cancel ]
```

Success:

```text
Profile updated.
```

---

# 62. Avatar

Default avatar can be the user's first initial.

Example:

```text
C
```

Optional:

```text
Upload photo
Remove photo
```

Image upload should have preview.

If upload fails:

```text
We couldn't update your profile picture.
```

Keep previous avatar.

---

# 63. Appearance

Section:

```text
Appearance
```

Options:

```text
Light
Dark
System
```

Do not create a large theme customization screen.

---

# 64. Learning Preferences

Optional settings:

```text
Default review mode
```

Options:

```text
Abstract
Understand
Ask every time
```

Default:

```text
Ask every time
```

Only include this if implemented by the app.

---

# 65. Review Preferences

Possible options:

```text
Daily review reminder
```

This should only appear if reminder functionality is implemented.

Do not design fake settings that the backend cannot support.

---

# 66. Account Section

Show:

```text
Email
Password
Session
```

Actions:

```text
Change password
Sign out
```

Optional:

```text
Delete account
```

Only include account deletion if the backend implements it.

---

# 67. Sign Out

Button:

```text
Sign out
```

Confirmation:

```text
Sign out of KNODES?

Your knowledge is saved securely.

[ Cancel ]  [ Sign out ]
```

Do not imply local unsaved data is safe if it is not.

---

# 68. Delete Account

If implemented:

Use a clearly separated danger zone.

```text
Danger zone

Delete account
Permanently remove your KNODES account and associated data.

[ Delete account ]
```

Confirmation must be explicit.

Do not place this near everyday buttons.

---

# 69. Profile Empty / New User State

Example:

```text
Your Brain is just getting started.

Add your first note to begin building your knowledge graph.
```

CTA:

```text
Add your first note
```

---

# 70. Profile Loading State

Use skeletons:

```text
Avatar skeleton
Name skeleton
Statistics skeleton
```

Avoid blank space.

---

# 71. Profile Error State

```text
We couldn't load your profile.
```

Button:

```text
Try again
```

---

# 72. Profile Responsive Design

Desktop:

```text
Centered content column
Max width: 900–1000px
```

Tablet:

```text
Full-width with padding
```

Mobile:

```text
Single-column
Large touch targets
Sections become stacked cards
```

---

# 73. Profile Dark Mode

Use the same global dark palette.

Do not make Profile visually brighter than Brain.

---

# 74. Profile Animation

Use minimal motion.

Allowed:

- Avatar fade-in
- Statistic count transition
- Settings confirmation
- Save success checkmark

Avoid:

- Floating objects
- Graph animations
- Excessive transitions

---

# 75. Profile Accessibility

Support:

- Keyboard navigation
- Accessible form labels
- Focus states
- Readable contrast
- Screen reader labels
- Error messages associated with fields

---

# 76. Profile Component Tree

```text
ProfilePage
│
├── AppShell
│   ├── MinimalTopBar
│   └── Sidebar
│
├── ProfileHeader
│   ├── Avatar
│   ├── Name
│   ├── Email
│   └── EditProfileButton
│
├── KnowledgeSnapshot
│   ├── Concepts
│   ├── Connections
│   ├── Notes
│   └── Reviews
│
├── BrainShortcut
│
├── ProfileInformation
├── AppearanceSettings
├── LearningPreferences
├── AccountSettings
└── DangerZone
```

---

# 77. Landing Page Component Tree

```text
LandingPage
│
├── MarketingHeader
│
├── HeroSection
│   ├── HeroCopy
│   ├── PrimaryCTA
│   ├── SecondaryCTA
│   └── DemoGraph
│
├── HowItWorks
│   ├── Write
│   ├── Structure
│   ├── Connect
│   └── Retest
│
├── GraphShowcase
├── StructuralUnderstanding
├── RetestShowcase
├── CounterfactualShowcase
├── InsightsShowcase
├── PersonalBrainSection
├── FeatureGrid
├── TrustSection
├── FinalCTA
└── Footer
```

---

# 78. Authentication Component Tree

```text
AuthLayout
│
├── MinimalBrandHeader
│
├── LoginPage
│   ├── LoginForm
│   ├── PasswordField
│   ├── ForgotPassword
│   └── SignupLink
│
└── SignupPage
    ├── SignupForm
    ├── PasswordStrength
    ├── ConfirmPassword
    └── LoginLink
```

---

# 79. Prototype Screens — Landing

Create:

## Landing 01
Hero — Desktop

## Landing 02
Hero — Graph Loaded

## Landing 03
Hero — Graph Hover

## Landing 04
How It Works

## Landing 05
Knowledge Graph Showcase

## Landing 06
Understanding vs Recall

## Landing 07
Structural Evidence

## Landing 08
Retest Showcase

## Landing 09
Counterfactual Showcase

## Landing 10
Insights Showcase

## Landing 11
Feature Grid

## Landing 12
Final CTA

## Landing 13
Footer

## Landing 14
Mobile Landing

## Landing 15
Dark Landing

---

# 80. Prototype Screens — Authentication

Create:

## Auth 01
Login

## Auth 02
Login — Invalid Fields

## Auth 03
Login — Wrong Credentials

## Auth 04
Login — Loading

## Auth 05
Login — Network Error

## Auth 06
Signup

## Auth 07
Signup — Validation

## Auth 08
Signup — Password Strength

## Auth 09
Signup — Loading

## Auth 10
Signup — Success

---

# 81. Prototype Screens — Profile

Create:

## Profile 01
Profile Overview

## Profile 02
Edit Profile

## Profile 03
Edit Profile — Saved

## Profile 04
Appearance Settings

## Profile 05
Learning Preferences

## Profile 06
Account Settings

## Profile 07
Sign Out Confirmation

## Profile 08
New User Profile

## Profile 09
Profile Loading

## Profile 10
Profile Error

## Profile 11
Mobile Profile

## Profile 12
Dark Profile

---

# 82. Shared Design Rules Across All Pages

Top bar inside the authenticated app:

```text
KNODES
```

ONLY.

Do not reintroduce:

```text
Search
Notifications
Settings
Avatar
```

into the top bar.

Use the sidebar for navigation and Profile for account access.

The interface should have generous horizontal breathing room.

---

# 83. Shared Color Tokens

Primary:

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

Use the same recall status colors everywhere.

---

# 84. Shared Typography

Use:

```text
Inter
```

or:

```text
Geist
```

Marketing hero:

```text
48–72px desktop
36–44px tablet
32–40px mobile
```

App titles:

```text
28–34px
```

Section headings:

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

---

# 85. Shared Button System

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
Text button
```

Danger:

```text
Red reserved for destructive operations
```

Do not use pills for every button.

---

# 86. Shared Radius

Use:

```text
8px
12px
16px
20px
24px
```

Most cards:

```text
16px
```

Large marketing panels:

```text
24px
```

---

# 87. Shared Animation Principles

All pages should use the same motion language:

- Ease-in-out
- Short transitions
- Soft opacity transitions
- Small scale changes
- No excessive bouncing

Animations should communicate:

```text
State change
Progress
Discovery
Success
Navigation
```

not decoration for decoration's sake.

---

# 88. Shared Edge Case Principles

When something fails:

1. Preserve user data whenever possible.
2. Explain what happened.
3. Explain whether the user's data is safe.
4. Give one clear next action.
5. Do not blame the user.
6. Do not expose raw technical errors.

Example:

```text
We couldn't complete that action.

Your note is still saved.

[ Try again ]
```

---

# 89. Figma AI Integration Rule

Treat this document as a companion specification to:

```text
01-Brain-Page.md
02-Notes-Page.md
03-Retest-and-Insights.md
```

Reuse their:

- Sidebar
- Typography
- Colors
- Graph language
- Recall indicators
- Button styles
- Cards
- Drawers
- Empty states
- Animation language

Do not redesign these components independently on every page.

---

# 90. Final End-to-End User Journey

```text
LANDING
   ↓
Understand KNODES
   ↓
Start Building Your Brain
   ↓
SIGN UP
   ↓
BRAIN
   ↓
NOTES
   ↓
KNODES structures knowledge
   ↓
BRAIN updates
   ↓
RETEST
   ↓
Evidence collected
   ↓
INSIGHTS
   ↓
Learning patterns visible
   ↓
BRAIN
   ↺
```

Profile exists as the user's account/control center throughout this journey.

---

# 91. Final Figma AI Instruction

Design the KNODES Landing Page as a single polished product introduction, not as a generic SaaS template.

Its visual centerpiece should preview the actual KNODES 3D knowledge graph.

The visitor should understand:

```text
Notes
→
Structured knowledge
→
Connected graph
→
Retest
→
Insights
```

Keep the marketing page clean, spacious, intelligent, and premium.

The Login and Signup pages should be extremely simple and brand-consistent.

The authenticated application's top bar must contain ONLY the KNODES logo/wordmark with generous empty space.

Do not add search, notifications, settings, or profile controls to the top bar.

Profile should remain a lightweight account and personal overview area. Brain owns the knowledge graph; Retest owns active assessment; Insights owns learning analytics.

The entire product should feel like one coherent system rather than a collection of independently designed pages.
