# FLOW Smart Journey — actual volunteer test protocol

Status: protocol prepared; **no volunteers interviewed or results collected by this implementation**.
Use this to support Living Labs with real evidence, not invented testimonials. Ask volunteers yourself;
no outreach or publication was performed by the coding agent.

## Consent and setup

Ask permission for an anonymous 10-minute usability test. Explain that this is a prototype, that
availability/route duration are not guaranteed, and that participants may stop at any time. Do not
record names, contact details, faces, exact home locations or GPS traces. Prefer a public example origin
selected manually. Do not ask cyclists/drivers to operate the app while moving.

Use P01, P02… only after an actual participant consents. Record round, date, commit, URL, actual device/
browser, provider availability and whether data are real or a clearly labelled test fixture. A provider
failure is observed evidence; do not mark a task as a routing success when using synthetic routes.

## Five neutral tasks

1. “Find a real place you want to reach.”
2. “Explain where the app suggests parking and what you know about free spaces.”
3. “Compare the car journey with cycling. What does the displayed time include?”
4. “Show the walk from the selected parking to your destination on the map.”
5. “Open the active journey in Motion. Tell us when GPS starts and when coins could be awarded.”

Start a stopwatch after reading each task. Stop on completion or participant abandonment. Do not coach
until the attempt has been classified; record any assistance separately. Ask the participant to explain
“time on routes”, unknown parking search, estimated prices and unconfirmed availability in their words.

## Record actual observations only

| Participant ID | Round | Task | Completed unaided? | Seconds | Wrong actions | Assistance | Exact observation / voluntary feedback |
|---|---|---|---|---|---|---|---|

No rows are pre-filled. “Not attempted”, “provider unavailable” and “abandoned” are distinct outcomes,
not zero-second successes. Save anonymous notes with date and commit in this directory, after consent.
A participant's paraphrase should not be presented as a direct quotation.

## Iterate and retest

| Observed problem | Anonymous evidence reference | Change made | Commit | Same-task retest result |
|---|---|---|---|---|

Prioritize observed misunderstandings that affect the choice: destination precision, where the car
ends, final walk, excluded search time, unknown occupancy, which button starts recording. After a fix,
repeat the same task on the same type of device. Separate returning participants from new ones.

Only calculate completion rate or median time from actual recorded observations; show sample size and
round. Report whether improvement was measured within participants or across different groups. Small
convenience samples support usability findings, not citywide behavioral or emissions claims.

## Required physical checks

Android Chrome and iPhone Safari: touch targets, scrolling sheet, map fit after rotation, font scaling,
GPS permission denied/allowed, foreground recording, background pause, Add to Home Screen and offline
error. A Chromium emulated viewport is not proof these physical checks passed.
