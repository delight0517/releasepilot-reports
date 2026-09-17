# App Studio handoff — 20260917.1

## Scope and editing on both computers
Static HTML/CSS/JavaScript, no package build, no production API keys. Main files: `app-studio/index.html`, `app-studio/style.css`, `app-studio/app.js`. Navigation entries added to home and `dev-portfolio/index.html`.

Use the same Git remote on macOS and Windows. Pull the completed commit before editing. Do not overwrite another checkout's uncommitted changes. Run any static HTTP server from repository root; for example `python -m http.server 8766 --bind 127.0.0.1`, then open `/app-studio/`. No OS-specific absolute paths are embedded in public files.

## Evidence and limits
| Claim | Existing source | Limit |
|---|---|---|
| Business email | `README.md`, `support/index.html` | Published address, mailbox delivery not tested |
| RiseSync alarm/permission UI | `apps/screenshots/risesync_1.png`, visually inspected | Development screenshot, no current release claim |
| Reminder schedule/reminders/widgets | `apps/everytime-reminder/index.html` | Existing product description, Android test recruitment; functionality not rerun |
| SECOM search/filter/report | `apps/secom/index.html` | Existing project description, no current provider/model assertion |
| Notes / habits / quiz / timers | `dev-portfolio/index.html` | Consultation capability categories; exact scope agreed in writing |

The file `apps/screenshots/harugirok_1.png` actually depicts RiseSync's permission prompt. Do not reuse it as a diary screenshot. The RiseSync app page contains `id000000000` store placeholder, so the new page deliberately links the developer portfolio instead. Current root metadata also makes broader App Store claims; those are pre-existing and not treated as evidence here.

## Consultation behavior
Native form validation → deterministic draft → clipboard or mailto. No API/network submission. UI never claims received. Editing fields invalidates the draft, preventing stale recipients/content. Mail clients vary in supported mailto length; copy fallback remains available. Photos may be attached inside the user's email client. No browser persistence of input/contact data.

Developer participation uses the same composer with its own subject and questions, explicitly marked as interest inquiry. It is not an account registration or matching backend.

## Go-live gaps
The owner's offer is KRW 35,000 per project through launch. Features, revision scope, schedule and release method are agreed in writing at consultation. Third-party actual costs, if any, are disclosed in advance. No feature exclusions or upsell policy is imposed by this page. Store approval/timing is not guaranteed. Backend intake, delivery tracking, AI persona, developer accounts and marketplace matching are separate follow-ups. No routine, outreach, payment or secret configuration is changed by this site update.

## Validation on 2026-09-17
Headless Chromium against local HTTP passed at 1440, 390 and 320 CSS pixels: horizontal overflow absent, all images loaded, all seven local link destinations returned success, no JavaScript errors. Interactive checks passed for client draft generation, lossless mailto body encoding, Windows clipboard copy (CRLF normalized in the test), draft invalidation after edits, developer inquiry branching and invalid email rejection. Full-page desktop/mobile screenshots reviewed. This is browser emulation, not a physical iPhone/Safari test. Email delivery was not attempted; public deployment not performed in this stage.
