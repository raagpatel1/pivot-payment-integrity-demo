# PIVOT demo — Supabase setup

Adds real login + cross-session, shared persistence. The synthetic dataset stays in
`assets/data.js`; Supabase persists only the mutations (case state) + audit trail.

## One-time setup (in the account that will host the demo)
1. **Create the project** — supabase.com › New project › name it `pivot-demo`, set a DB
   password (save it), pick a nearby region. Wait ~2 min.
2. **Run the schema** — SQL Editor › New query › paste `schema.sql` › Run.
3. **Create the two demo users** — Authentication › Users › Add user (tick **Auto Confirm User**):
   - `analyst@example.com` + a password → maps to **Dana Whitmore (Analyst)**
   - `supervisor@example.com` + a password → maps to **Karen Boyd (Supervisor)**
   (Email/password provider is on by default; auto-confirm skips email verification.)
4. **Grab the keys** — Project Settings › API › copy the **Project URL** and the **anon /
   publishable** key. (The anon key is a public client key; row-level security protects the data,
   so it's safe to commit to the public repo.)
5. Send the URL + anon key (+ the two emails/passwords) to wire the app.

## Notes
- Free-tier projects **pause after inactivity** and cold-start on the next request.
- The app config lives in `assets/config.js` (`window.PIVOT_CONFIG`); with it set the app
  gates behind login and persists to Supabase, otherwise it runs in local/in-memory mode.
