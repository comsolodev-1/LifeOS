# QA: earlier sprints (1 to 3)

Automated (run on every change): `npm run lint && npm run typecheck && npm test && npm run build`
Smoke against a running server: `BASE_URL=https://your-app.vercel.app npm run test:smoke`

Manual checks below need real accounts. Mark each Pass / Fail and note the device.

## 1. Setup
- [ ] `/setup` after login: every env var shows "set" except GEMINI_API_KEY and VAULT_KEY (fine for now)
- [ ] Database connection "ok", Migrations "N applied"
- [ ] `/api/health` returns status ok, db ok, and only true/false values (no secrets)

## 2. Auth
- [ ] Signed out, opening any page lands on /login
- [ ] Sign in with the owner account: lands on Home
- [ ] Sign in with a different Google/GitHub account: rejected, /login shows the error message, no app access
- [ ] Refresh and reopen the browser: still signed in
- [ ] Opening /tasks directly while signed out redirects to /login

## 3. Tasks
- [ ] Add a task with title only: appears in the list, priority medium
- [ ] Add with priority high, a deadline, estimate 30, notes: shows "high · due <date> · 30 min"
- [ ] Empty title is blocked; 201-character title is rejected with a message
- [ ] Deadline date shows the same calendar day you picked (Manila time)
- [ ] Mark done: strikethrough, moves below open tasks; tap again: back to open
- [ ] Delete removes it, and it stays gone after refresh
- [ ] Search finds by partial title, case-insensitive; typing % or _ does not match everything
- [ ] Filters All / To do / Doing / Done show the right items; empty filter shows "Nothing matches"
- [ ] Reload the page: data persists
- [ ] Add 30+ tasks: list still scrolls and loads quickly

## 4. Home
- [ ] Open task count matches the Tasks page
- [ ] "Next up" shows at most 5 open tasks, earliest deadline first
- [ ] Greeting matches time of day in Manila
- [ ] Done tasks are not counted

## 5. Phone and PWA (test on a real phone)
- [ ] Layout fits with no sideways scroll; bottom tab bar not covered by the home indicator
- [ ] Tab bar: Home, Calendar, Tasks, AI, More all work; More lists the other pages
- [ ] + button opens Tasks and reaches the add form; it does not cover the last list item or tab bar
- [ ] All tap targets are easy to hit; inputs do not zoom the page on focus
- [ ] Add to Home Screen works; app opens standalone with the LIFEOS icon
- [ ] Dark mode (phone setting): readable text, visible borders

## 5b. Desktop
- [ ] Sidebar shown, tab bar hidden, current page highlighted
- [ ] Keyboard: Tab reaches every control, focus is visible, forms submit with Enter

## 6. Resilience
- [ ] After Neon has been idle 5+ minutes, first load still works (may take a few seconds, no crash)
- [ ] Temporarily set a wrong DATABASE_URL: pages show a clear error state, no stack trace, /setup shows "error"
- [ ] Remove DATABASE_URL: Tasks and Home show "not configured" messages

## 7. Security
- [ ] Another browser profile (signed out) cannot open /tasks or call server actions
- [ ] View page source and network tab: no secrets or other users' data
- [ ] Response headers include X-Frame-Options and X-Content-Type-Options

## 8. Sprint 2: projects and dependencies
- [ ] Projects: create "Thesis"; it appears with 0 of 0 tasks done
- [ ] On the project page, add 2 tasks; both show under it, and also on /tasks with the project name
- [ ] Mark one done: progress bar and "1 of 2 tasks done" update on /projects
- [ ] Rename the project and change status to Paused; both persist after refresh
- [ ] Tasks: tap a title to open the edit page; change title, priority, deadline, estimate, notes, project, status to Doing; Save shows "Saved" and the list reflects it
- [ ] Clear the deadline and estimate on the edit page: they disappear from the list
- [ ] Filters on /tasks: status, priority, project, "No project", sort by priority/newest; Clear resets
- [ ] Search with % or _ finds nothing unless a title contains them
- [ ] Dependencies: make Task B blocked by Task A; B shows "Blocked by an unfinished task"; mark A done and the badge disappears
- [ ] Try the reverse (A blocked by B): rejected with "circular dependency"
- [ ] Remove a dependency with the X button
- [ ] Delete a project: its tasks remain, shown as "No project"
- [ ] Delete a task from its edit page: returns to /tasks, and any dependencies on it vanish
- [ ] A made-up task URL (/tasks/3f2b8c1e-5d7a-4b9e-8c21-0a1b2c3d4e5f) shows a not-found page, no crash

## 9. Sprint 3: AI assistant and memory
Setup: run migration-0003 in Neon first. /setup must show Vault key valid and Gemini test connected.
- [ ] Add yourself ("Me") and one friend to the Vault first (Settings > Privacy Vault)
- [ ] /ai: send "Hi, what can you do?" Reply streams in word by word and is labeled AI
- [ ] Send "Remind me to message <friend's name> about the project on <a future date>". An AI suggestion card appears (dashed border). Open /tasks: the task is NOT there yet
- [ ] Edit the title on the card, tap Confirm: card says it's done, and the task now appears in /tasks with your edit
- [ ] Tap Confirm twice quickly on another suggestion: only one task is created
- [ ] Ask for another task and tap Dismiss: nothing is created
- [ ] "What tasks do I have?" lists your real tasks, with real names (not [PERSON_1])
- [ ] Settings > Privacy Vault > Recent AI requests: open a "chat" entry. Your friend's real name must not appear; a placeholder like [PERSON_1] must
- [ ] Say "I usually study at night and go to the gym on Saturdays". A "remember this" card appears. Approve one, Reject the other
- [ ] /profile: approved memory is listed; edit it, delete it, add one manually; write something in Life context and Save
- [ ] Start a New chat and ask something related to an approved memory: the answer reflects it
- [ ] Try typing a fake password ("my password is hunter2"): blocked with a clear message, and it never appears in the audit log
- [ ] Refresh /ai: past chats are under "Chats"; delete one and confirm it's gone
- [ ] Signed out (private window): /ai and /profile redirect to login

Sprint 4 checks are in QA.md.
