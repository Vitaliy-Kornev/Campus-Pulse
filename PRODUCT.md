# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Club officers.** Officers of UMN student clubs who put up paper flyers to promote events. Officers share one club account: a new officer starts a club or asks to join one, and an existing officer approves them, so the club's history survives when officers graduate. One person can be an officer of several clubs; they work in one club at a time and switch between them, and clubs never see each other's data. They create an event (the link students land on), post flyers on specific boards, print each flyer's QR code, and come back to see which boards got scanned. They are students running a group, often from a phone between classes, not marketing professionals.
- **Admins (staff users).** Maintain the set of poster boards: add, move, and retire boards, fix coordinates after import, and see every club's numbers.
- **Students.** Never log in. They scan a QR code on a flyer and are redirected straight to the flyer's link. Their experience must stay instant and invisible.

## Product Purpose

Campus Pulse shows student organizations where on campus their flyers actually get seen. Every flyer carries its own QR code; each scan is logged and immediately redirected, and the organization sees, per board, how many scans it received. Success: a group can tell which boards are worth a trip with a stack of flyers, and can point to real numbers instead of guessing.

## Positioning

Proof that paper flyers work. Physical flyers have always been unmeasurable; Campus Pulse gives them per-board, per-day results like a digital ad, tied to the exact physical board on a real campus map.

## Operating Context

- Ships configured for the University of Minnesota – Twin Cities with 41 real poster boards (`boards_umn.csv`), across East Bank, West Bank, and St. Paul areas. Residence halls are one board per building; all copies there share one QR code.
- Workflow: create the event and pick its boards in one step → download or print the QR codes (2-inch print label with fallback short URL) → put the flyers up → watch scans on the map and dashboard → read the recap after the event ends.
- **One round of posters per event.** Officers don't refresh posters, so the board choice has to be right the first time. That is why recommendations sit beside the board picker, and why the only mid-event nudge is "Move it?" (no scans after 5 days, event still ahead).
- **Recommendations come from similar clubs, privately.** Clubs record their kind and their members' fields of study; events record their kind. Boards that worked for similar clubs and events are recommended as "Strong pick" or "Good pick" with a generic reason. Other clubs' names, events, and numbers are never shown.
- **Notifications are on-site only**, never email: first scan per event, move-it nudges, recaps, join requests.
- Scans after removal still redirect and are reported as "after removal", because people photograph flyers.
- Numbers: total scans (non-bot), unique scans (daily-rotating visitor hash; raw IPs never stored), scans by day, by hour (campus time zone), by board, and by device. Bot and link-preview traffic is stored but excluded everywhere.

## Capabilities and Constraints

- Django + Django REST Framework backend; React (Vite, TypeScript, Tailwind, shadcn/ui) frontend in `frontend/`, served by Django in production.
- The scan redirect (`/r/<slug>/`) must stay fast and never block; printed QR codes encode `SITE_URL/r/<slug>/` and cannot change after printing.
- Officers see only their own club's events; other users' objects are 404, not 403. Any logged-in user can add a board; only admins edit, move, or retire boards.
- QR images have no built-in margin; flyer designs must leave clear space around the code.
- This is a student project; real-world adoption is secondary. Pricing, business model, and expansion beyond UMN are undecided and must not be claimed.

## Brand Commitments

- Name: **Campus Pulse**. Logo: `frontend/public/logo.svg` (maroon tile with a gold pulse line).
- Campus identity: UMN Twin Cities, maroon `#7A0019` as the campus accent. Campus short name is configurable (`CAMPUS_SHORT_NAME`).

## Evidence on Hand

- Demo data only (`python manage.py seed_demo`): 5 clubs, 7 events, and synthetic scans. No real customers, testimonials, usage numbers, or press exist; future work must not fabricate them.

## Product Principles

1. Every number must be honest: bots excluded, uniques defined, removals labeled. Credibility is the product.
2. Tie data to place. A scan count means something only next to the physical board it came from.
3. The scan path is sacred: never slow, gate, or interrupt the student who scans.
4. Built for busy student organizers: the path from event to printed QR code should take minutes, on any device.
5. Privacy by default: no raw IPs, no personal data from students, and no club's numbers shown to another club.
6. Respect attention: notify on the site, never by email, and only when there's something to act on.
