# KNODES — Login & Sign Up
## Figma AI Prototype Specification
### File: `05-Login-Signup.md`

---

# 1. Purpose

Create a clean authentication experience for KNODES.

The authentication screens should feel like a natural continuation of the KNODES product, not a generic SaaS login template.

Primary goals:

- Simple
- Fast
- Minimal
- Trustworthy
- Accessible
- Brand-consistent

---

# 2. Global Layout

Use a centered authentication layout.

Background:

```text
#F7F7F7
```

Dark mode:

```text
#111827
```

Top center:

```text
KNODES
```

Do not include:

- Marketing navigation
- Search
- Notifications
- Sidebar
- Extra header actions

Keep generous whitespace.

---

# 3. Login Page

Main heading:

```text
Welcome back.
```

Supporting text:

```text
Continue building your Brain.
```

Form:

```text
Email
[________________________]

Password
[________________________]

[ Sign In ]
```

Secondary link:

```text
Forgot password?
```

Bottom:

```text
Don't have an account?
Sign up
```

---

# 4. Sign Up Page

Main heading:

```text
Build your Brain.
```

Supporting:

```text
Start turning what you learn into connected knowledge.
```

Form:

```text
Name
[________________________]

Email
[________________________]

Password
[________________________]

Confirm Password
[________________________]

[ Create Account ]
```

Bottom:

```text
Already have an account?
Sign in
```

---

# 5. Brand Style

Primary green:

```text
#58CC02
```

Secondary blue:

```text
#1CB0F6
```

Danger:

```text
#FF4B4B
```

Typography:

```text
Inter
```

or:

```text
Geist
```

Inputs:

- 48px height
- 12px radius
- Thin neutral border
- Clear focus state
- Spacious padding

Primary button:

- Green
- 48px height
- Medium rounded corners
- Strong readable text

Do not overuse rounded pills.

---

# 6. Validation States

## Empty

```text
Please enter your email.
```

## Invalid Email

```text
Enter a valid email address.
```

## Missing Password

```text
Please enter your password.
```

## Password Mismatch

```text
Passwords don't match.
```

## Weak Password

Show:

```text
Weak
Good
Strong
```

with short guidance.

---

# 7. Login Error

Use:

```text
Email or password is incorrect.
```

Do not reveal whether a specific email account exists.

---

# 8. Loading State

Button changes to:

```text
Signing in...
```

or:

```text
Creating account...
```

Keep the form visible.

Do not replace the entire page with a large spinner.

---

# 9. Network / Server Error

Display:

```text
We couldn't connect to KNODES.

Please try again.
```

Button:

```text
Try again
```

Preserve entered information where possible.

---

# 10. Success State

After Sign Up:

```text
Your Brain is ready.
```

Small visual:

```text
●
 \
  ●
   \
    ●
```

A tiny connected-node animation.

CTA:

```text
Enter KNODES
```

After Login:

```text
Welcome back.
```

Then navigate directly to:

```text
Brain
```

---

# 11. Navigation

```text
Landing
   ↓
Sign Up / Sign In
   ↓
Authentication Success
   ↓
Brain
```

Switching links:

```text
Sign up → Sign in
Sign in → Sign up
```

should preserve the same clean visual layout.

---

# 12. Accessibility

Support:

- Keyboard navigation
- Visible focus states
- Proper field labels
- Password visibility toggle
- Screen-reader-friendly errors
- Sufficient color contrast
- Reduced motion

Do not rely only on red/green colors for validation.

Use icons and text:

```text
✓ Success
! Error
```

---

# 13. Mobile

Authentication should remain centered and simple.

Use:

```text
16–24px
```

side padding.

Inputs:

```text
100% width
```

Buttons:

```text
100% width
```

Avoid complex illustrations on mobile.

---

# 14. Figma Prototype Screens

Create:

```text
Login — Default
Login — Validation Error
Login — Loading
Login — Success

Sign Up — Default
Sign Up — Validation Error
Sign Up — Password Strength
Sign Up — Loading
Sign Up — Success

Mobile Login
Mobile Sign Up
Dark Mode Login
Dark Mode Sign Up
```

---

# 15. Final Design Instruction

Make authentication extremely clean.

The user should feel:

> "I'm one step away from entering my Brain."

Do not make login/signup more visually important than the KNODES product itself.

Use the same typography, colors, buttons, spacing, and motion language defined in:

```text
00-KNODES-Master-Design.md
04-Landing-Page-and-Profile.md
```

After successful authentication, take the user directly into the Brain experience.
