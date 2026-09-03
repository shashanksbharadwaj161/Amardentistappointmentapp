---
name: Amar Dentist
description: A calm, precise care journey from nearby clinic to verified record.
colors:
  ink-navy: "#142A42"
  deep-navy: "#0C1C2D"
  pearl: "#F5F8F7"
  paper: "#FFFFFF"
  care-mint: "#79D2BD"
  route-cyan: "#5CB8CF"
  clinical-teal: "#176662"
  text: "#14202B"
  muted: "#5A6873"
  line: "#DDE7E5"
  success: "#1D684F"
  warning: "#B86D16"
  danger: "#B83A3A"
  map-night: "#0B1218"
typography:
  display:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "34px"
    fontWeight: 750
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Bengali', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Bengali', sans-serif"
    fontSize: "13px"
    fontWeight: 650
    lineHeight: 1.25
rounded:
  control: "10px"
  surface: "14px"
  feature: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink-navy}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "12px 18px"
    height: "48px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
    padding: "16px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
    height: "48px"
---

# Design System: Amar Dentist

## Overview

**Creative North Star: "The Guided Care Ledger"**

Amar Dentist combines the quiet confidence of a carefully kept clinic register with the immediacy of a live route. Every surface should tell the user where they are in the care journey, what has been verified, and what happens next. The mobile experience is spacious and reassuring for patients, while professional and administrative modes tighten into scan-friendly operational rhythms without changing visual language.

This is not a decorative wellness app and not a dense hospital ERP. Brand character comes from precise status markers, a continuous journey line, disciplined typography, and the deliberate contrast between pearl clinical surfaces and the map's night field.

**Key Characteristics:**
- Calm pearl fields with navy structure and sparing mint/cyan signals.
- Clear journey continuity from discovery through appointment to record.
- Platform-native navigation and controls with brand expressed in content surfaces.
- Compact professional density without nested cards or dashboard clutter.

## Colors

The palette reads like clean clinical paper under daylight, anchored by ink navy and energized only where live care state needs attention.

### Primary
- **Ledger Ink** (`#142A42`): Primary actions, navigation emphasis, and high-trust headings.
- **Deep Ledger Ink** (`#0C1C2D`): Pressed states and the darkest structural surface.

### Secondary
- **Care Mint** (`#79D2BD`): Availability, verified state, and gentle selection fields.
- **Route Cyan** (`#5CB8CF`): Live route, current-location, and realtime accents.
- **Clinical Teal** (`#176662`): Secondary actions and professional-mode emphasis.

### Neutral
- **Pearl Field** (`#F5F8F7`): Default application background.
- **Paper** (`#FFFFFF`): Focused content surfaces and forms.
- **Body Ink** (`#14202B`): Primary text.
- **Quiet Ink** (`#5A6873`): Supporting text with a 5.36:1 contrast ratio on Pearl.
- **Instrument Line** (`#DDE7E5`): Separators and field outlines.
- **Map Night** (`#0B1218`): Map-only dark canvas.

**The Signal Rarity Rule.** Mint and cyan communicate availability, position, verification, or progress; they are never scattered as decoration.

## Typography

**Display Font:** Platform system sans
**Body Font:** Platform system sans with Noto Sans Bengali fallback

**Character:** Familiar enough for high-speed native operation, but deliberately weighted and spaced so headings feel authored rather than templated. Bangla and English receive equal line-height and truncation care.

### Hierarchy
- **Display:** Top-level patient moments and confirmation states only.
- **Headline:** Screen titles and primary section changes.
- **Title:** Appointment, clinic, patient, and record identity.
- **Body:** Instructions, clinical content, and explanatory text with a 65–75 character web measure.
- **Label:** Field names, statuses, metadata, and compact operational controls; sentence case by default.

**The Human Label Rule.** Labels name the actual action or state; abbreviations are limited to accepted clinical notation.

## Layout

Mobile follows native safe areas and uses one clear reading column, persistent platform navigation, and full-width task surfaces. Patient screens breathe at 16–24px gutters; professional screens use 12–16px rhythm with stronger grouping. The admin console uses a responsive shell: navigation rail, 12-column work area, and a maximum reading width for forms. Tablets replace bottom navigation with a rail and allow schedule/detail split views.

The care journey line may connect sequential states, but it never becomes a decorative timeline on unrelated screens. More space appears above a new section than below its heading.

## Elevation & Depth

Depth is mostly tonal. Paper surfaces sit on pearl fields; shadows appear only for floating map cards, sheets, menus, and actively lifted content. The system never combines a strong border with a strong shadow.

- **Ambient surface:** `0 8px 28px rgba(12, 28, 45, 0.10)` for floating map and confirmation surfaces.
- **Raised control:** `0 3px 10px rgba(12, 28, 45, 0.12)` for open menus and pressed-to-raised interaction.

**The Grounded Surface Rule.** Ordinary content stays flat; elevation must describe a real layer or interaction state.

## Shapes

Controls use 10px corners, ordinary surfaces 14px, and featured confirmation or map surfaces 18px. Pills are reserved for statuses, filters, and compact segmented choices. Clinical images and maps may use asymmetric cropping, but interactive hit areas remain regular and predictable.

## Components

### Buttons
- **Shape:** Confident 10px corners and at least 48px Android / 44pt iOS hit area.
- **Primary:** Ledger Ink with Paper text; one primary action per task region.
- **Focus:** High-contrast outer ring plus visible border change; never color alone.
- **Secondary:** Tonal pearl/mint surface or outline based on hierarchy.

### Chips
- **Style:** Small pill used for availability, verification, filters, and appointment states.
- **State:** Selected chips change fill, icon, and text weight together.

### Cards / Containers
- **Corner Style:** 14px by default.
- **Background:** Paper over Pearl Field, or tonal grouping without a container.
- **Shadow Strategy:** Flat by default; floating only when the layer is genuinely above content.

### Inputs / Fields
- **Style:** Paper fill, Instrument Line border, persistent label, and 48px minimum height.
- **Focus:** Ledger Ink or Clinical Teal border with a visible outer focus ring.
- **Error:** Clear recovery copy plus Danger color and icon.

### Navigation
- Native tab bar on compact mobile, navigation rail on expanded Android/tablet, and a left admin rail on web. Active destinations combine icon, label, and tonal field.

### Care Route
- A thin, purposeful journey line links location, reserved time, check-in, treatment, and finalized record only where the sequence is the user's current task.

## Do's and Don'ts

### Do:
- **Do** use status words and icons alongside color.
- **Do** keep the dark visual world confined to the map and intentional media inspection.
- **Do** show real operational state, recovery, and authorship wherever trust is at stake.
- **Do** adapt navigation and controls to iOS and Material expectations.

### Don't:
- **Don't** use gradients, decorative glass, generic medical crosses, or neon healthcare imagery. The supplied child-and-tooth brand emblem is the sole mascot exception and must remain confined to brand moments.
- **Don't** build pages from repeated same-size icon cards or nest cards inside cards.
- **Don't** hide permissions, payment failure, or AI provenance behind optimistic copy.
- **Don't** use mint or cyan merely to make a sparse screen feel decorated.
