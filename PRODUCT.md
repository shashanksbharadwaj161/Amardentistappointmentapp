# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

- Patients in Bangladesh use the mobile app to find a verified dentist, reserve an actual clinic slot, pay a deposit, communicate with the clinic, and retain portable dental records for themselves and dependants.
- Dentists work from one or more clinics and use the professional mobile mode for schedules, patient care, prescriptions, and clinical assistance.
- Clinic owners, managers, and front-desk staff operate schedules, check-in, billing, inventory, and lab work within explicit role boundaries.
- A deliberately small Super Admin group controls the platform. Invited operational Admins handle verification, support, refunds, and moderation without routine clinical-record access.

## Product Purpose

Amar Dentist connects patient discovery and booking to the clinic's real schedule and the resulting longitudinal dental record. Success means a patient can move from finding a verified dentist to a confirmed visit and finalized record without double booking, hidden approval steps, or unsafe exposure of clinical data.

## Positioning

Unlike a directory or a generic clinic calendar, Amar Dentist treats the booked slot, clinic workflow, payment state, consent, and dentist-authored record as one auditable care journey that can follow the patient across consented clinics.

## Operating Context

- Bangladesh nationwide; BDT and Asia/Dhaka are the operating defaults.
- Mobile users may work under unreliable networks and need clear recovery states for booking and payment.
- Clinical work happens in bright, fast-moving clinics where schedule state and patient identity must be immediately scannable.
- The product launches through a closed clinic pilot before a public store release.

## Capabilities and Constraints

- One Expo codebase serves patient and professional mobile modes; a separate responsive web console serves platform administration.
- Supabase provides Postgres/PostGIS, verified email/password authentication, Storage, Realtime, scheduled jobs, and Edge Functions.
- A person may be both patient and professional and may belong to multiple clinics.
- Essential booking, records, consent, and messaging remain free; subscriptions gate premium AI, analytics, automation, and higher limits.
- Booking concurrency, permissions, payment confirmation, and clinical visibility are enforced server-side, not by hidden interface controls.
- Patient-facing AI may explain finalized information and guide urgency, but never diagnose or prescribe. Dentist AI remains reviewable assistance and never authors the final record.
- E-shop, waste logistics, jobs, and learning are separate future products.

## Brand Commitments

- Product name: Amar Dentist.
- Tone: calm, precise, trustworthy, and plain-spoken; never playful about clinical risk or payment state.
- The first supplied video is the authority for mobile hierarchy, the second for the dark map interaction, and the third for restrained onboarding and success motion. The final identity must be original rather than a replica.

## Evidence on Hand

- Supplied dentist appointment application specification.
- Supplied product blueprint PDF.
- Three supplied product-motion reference videos.
- No production clinic content, legal approval, merchant credentials, testimonials, or validated clinical claims are available yet and none may be fabricated.

## Product Principles

1. Protect the appointment race, clinical record, and payment state at the data boundary.
2. Make the next action obvious for patients and time-poor clinic staff.
3. Keep each delivery phase independently working and verified before adding the next.
4. Preserve human clinical authorship and patient consent around every AI-assisted workflow.
5. Prefer explicit, auditable state over invisible automation.

## Accessibility & Inclusion

- English and Bangla are first-class across patient and clinic-facing mobile experiences.
- Support font scaling, screen readers, keyboard navigation on web, reduced motion, large touch targets, non-color status cues, and WCAG 2.2 AA contrast.
