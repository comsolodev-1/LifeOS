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

## AI chat: leaving the page mid-answer (retest only this)
- [ ] Send a message that needs a longer answer (for example "Plan my study week in detail"). While it is writing, tap Tasks, wait 10 seconds, then tap AI again
- [ ] AI reopens your last chat (not a blank one). If the answer is still being written you see "Still writing your reply...", and the full answer appears by itself when it finishes
- [ ] Do the same but also refresh the browser mid-answer: after reopening, the finished answer is there
- [ ] Ask for something that creates a suggestion (for example "add a task to call my friend tomorrow"), leave and come back: the suggestion card is there with Confirm and Dismiss
- [ ] "New chat" (under Chats) opens a blank chat and does not jump back to the old one; after your first message in it, AI reopens that new chat
- [ ] Deleting a chat sends you to a blank new chat
- [ ] You cannot send a second message while "Still writing your reply" is showing
- [ ] Photo import still keeps going while you navigate (earlier fix)

## Known gaps (not bugs)
Goals, Reality Check, and Settings (modes, export) are placeholders. The AI cannot read events or goals yet, and cannot analyze photos.
