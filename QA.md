# QA: current sprint (Sprint 4: calendar and photo import)

Only the newest sprint is tested here. Earlier sprints are in QA-previous.md and do not need a retest unless something looks broken.

Quick regression after deploying (30 seconds): open the app, sign in, open Tasks and AI. If both load, nothing older broke.
Optional automated smoke test: `BASE_URL=https://your-app.vercel.app npm run test:smoke`

## Sprint 4 checks
Setup: run migration-0004-calendar.sql in Neon first.
- [ ] Calendar > Add event: "Test class", today, 09:00 to 10:00, Save. It shows at 9:00 AM (not 1:00 AM or 5:00 PM) in Week and Day views
- [ ] Add a second event today 09:30 to 10:30: both show "Overlaps with ..." and the month cell shows a warning mark
- [ ] Add one that starts exactly when another ends: no overlap warning
- [ ] Day view lists "Free time (7 AM to 9 PM)" gaps that skip your events
- [ ] Add a weekly event on Mon, Wed, Fri with no end: it appears on those days in Week and Month views, next week too
- [ ] Open one occurrence, tap "Skip only the occurrence on ...": only that day disappears
- [ ] Edit the series time: all occurrences move. Delete the whole series: all gone
- [ ] End time before start time is rejected with a message
- [ ] Home shows "Today's schedule" with your event
- [ ] Prev, Next, Today and the Day/Week/Month tabs work; tapping a month cell opens that day
- [ ] Import photo (phone): take or choose a photo of a timetable
- [ ] Drag a finger over part of the photo: a black box appears; Undo and Clear work; the page does not scroll while drawing
- [ ] Continue shows the consent screen; Cancel returns, Send continues
- [ ] Review screen lists events with your timetable's titles, days and times. Unclear fields are amber with "(check this)" and that item starts unchecked
- [ ] Fix a flagged field: the amber disappears. Check the item, tap Save N selected
- [ ] The saved classes appear in the calendar at the correct local times, repeating weekly
- [ ] Settings > Privacy Vault > Recent AI requests: a "schedule_extract" entry shows "[image ...]" and no personal text
- [ ] In AI chat ask "what's on my calendar this week?": it lists your events

## Photo import: keeps working while you navigate (retest only this)
- [ ] Choose a photo, Continue, Send. While it says "Reading your schedule", tap Home or Tasks. A banner "Reading your schedule photo. You can keep using the app." shows on every page
- [ ] When it finishes, the banner changes to "Your schedule is ready to review". Tap it: the review list is there (nothing was lost)
- [ ] Go to another page and back to Import photo while the list is open: the list and your edits (unticked rows, changed titles) are still there
- [ ] Refresh the browser on the review screen: the list is still there. Close the tab and open the app again: it is gone (by design)
- [ ] "Discard and start over" clears the list and returns to choosing a photo
- [ ] After Save, leaving and returning to Import photo starts fresh (no old list)
- [ ] Earlier fixes still fine: clean titles, "Skipped N that were already there", and the cleanup button

## Known gaps (not bugs)
Goals, Reality Check, and Settings (modes, export) are placeholders. The AI cannot read events or goals yet, and cannot analyze photos.
