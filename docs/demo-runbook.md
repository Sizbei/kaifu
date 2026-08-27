# KAIFŪ demo runbook — 2026-08-27

Operational checklist for the stage demo. Pitch text is in `docs/pitch.md`; slides in
`docs/pitch-deck.html`. Read this top to bottom once before leaving for the venue,
then use the "Two minutes before" block at the venue.

---

## 1. Pre-flight (at home, on the venue Wi-Fi if possible)

### Services that must be running

| Service | How | Check | Notes |
|---|---|---|---|
| Dev server | `pnpm dev` in `~/Documents/github/kaifu` | http://localhost:3000 loads the capture screen | Default Next port 3000. Run in a terminal you can see. |
| Qdrant | `/private/tmp/claude-501/-Users-sizbei/dfddc596-e3b2-4b56-ae3e-00f8eaf49373/scratchpad/qdrant-bin/qdrant` (run from that directory; the storage dir is beside it) | `curl -s localhost:6333/collections` lists `kaifu_groundtruth` and `kaifu_clauses` | **Not a service. Dies on reboot. Restart it by hand after any restart.** If the collections are missing, run `pnpm index:groundtruth` (needs OpenAI credits — it embeds with `text-embedding-3-small`). |
| Neo4j | `brew services start neo4j` | `lsof -iTCP:7687 -sTCP:LISTEN` shows java | Survives reboot as a launch agent, but takes ~30s to accept connections. |
| Corpus seed | `pnpm seed:graph` | Lease decode returns an `X-Kaifu-Benchmark` header; finding rows show an "Early corpus — in the KAIFŪ corpus…" line | Loads the 17 fixtures. Idempotent; re-run after any Neo4j wipe. |

Order: Qdrant → Neo4j → `pnpm seed:graph` → `pnpm dev`. The dev server reads
`.env.local` at boot, so start it last.

### Env vars (`.env.local`)

All of these are present right now; confirm none were blanked:

```
SHISA_BASE_URL=https://api.shisa.ai/openai/v1
SHISA_API_KEY=…            SHISA_MODEL=shisa-ai/shisa-v2.1-llama3.3-70b   (must start with shisa-ai/ or the server refuses to boot)
OPENAI_API_KEY=…           OPENAI_VISION_MODEL=gpt-5.5
QDRANT_URL=http://localhost:6333
NEO4J_URI=bolt://localhost:7687   NEO4J_USER=neo4j   NEO4J_PASSWORD=…
```

Check OpenAI credits before leaving. Vision and embeddings are the only calls that
can fail on a billing error; Shisa is separate.

### Phone

- Same Wi-Fi as the laptop. LAN URL today: **http://192.168.40.148:3000** (re-check
  with `ifconfig | grep "inet "` at the venue — the address will change on a
  different network). Save it as a home-screen bookmark.
- Camera permission granted to the browser in advance. iOS Safari asks once per
  origin; a new IP is a new origin.
- Screen mirroring to the laptop (QuickTime → New Movie Recording → phone as
  camera) tested before you walk on. Keep the laptop mirrored to the projector;
  never plug the phone into the projector directly.
- Brightness max, auto-lock off, Do Not Disturb on.

### Paper

Print at 100% scale on A4, from `public/samples/*.photo.jpg` or the `.png` scan:

| Document | Beat | Why this one |
|---|---|---|
| `school-excursion` (秋の遠足のお知らせ) | 1–4 | Three obligations, two amounts, clean dates. Reply placeholder is already the allergy line. |
| `lease-restoration` (第15条 原状回復) | 5 | The kicker. Charges 経年変化 to the tenant and bars objection to the estimate; maps to the MLIT 原状回復 guideline with `differs`. |

Backups, in your bag, not on stage: `ward-residence-tax` (a different doc type if
a judge asks), `lease-renewal` (a true negative — "JUDGE returns nothing, and that
is correct"), `unknown-degraded-print` (shows the 0.6 confidence gate degrading to
summary-only).

Also keep `public/samples/school-excursion.photo.jpg` open on a second screen or
tab in case the hall lighting makes the print unreadable — photograph the screen.

### Fallback URLs (mock mode, no network at all)

The `?mock=` flag replaces both API calls with fixtures and a 5-second fake delay.
The card, the conflict row, the findings, and the four streaming registers all
render exactly as live.

| URL | What it shows |
|---|---|
| `http://<LAN>:3000/?mock=1` | School card. Three obligations; the third carries a date **conflict** (model saw 10-09, document said 10月10日). Reply streams the allergy message at all four registers. |
| `http://<LAN>:3000/?mock=lease` | Lease card with one `differs` finding (wallpaper, 経過年数) and one `matches`, both cited; an amount conflict (40,000 vs 44,000円). |
| `http://<LAN>:3000/?mock=unclear` | `summaryOnly` card — the confidence-gate path. Use only if asked "what if the scan is bad?" |
| `…?mock=1&fail=keigo` | Same as mock=1 but the 敬語 register errors mid-stream, so you can show that one failed register does not take the other three down. |

In mock mode a small "mock · school" label appears on the capture screen. The
benchmark line does not appear in mock mode (no header).

Open the mock URLs in tabs on the laptop before you start so a switch is one
keystroke, not a URL you type under lights.

---

## 2. Running order and timing (3:00 total)

| Time | Beat | You do | Screen shows | You say (cue) |
|---|---|---|---|---|
| 0:00–0:30 | Problem | Nothing on screen but slide 1 | Title | "Last month I renewed a Tokyo lease…" |
| 0:30–0:40 | DEMO 1 | Hold up the excursion print. Tap the capture button, photograph it flat. | Processing state | "This is a real school notice." |
| 0:40–0:55 | Wait | Talk. Do not look at the phone. | Spinner (live latency unmeasured on stage Wi-Fi; mock is 5.2s — time one real decode during setup) | Start the "why now" numbers here if the card is slow. |
| 0:55–1:15 | DEMO 2 | Scroll the card. Tap **Add to calendar** on the first obligation. | Card: what it is, 3 obligations, dates, ¥1,200; "Calendar file saved" | "Google Lens tells you what the words say…" |
| 1:15–1:20 | DEMO 3 | Tap the reply box. Type the intent. Recipient chip is already "My child's class teacher". Send. | Four buffers filling at different rates | "Now I type, in English…" |
| 1:20–1:50 | Slider | Slider starts on 丁寧. Move to 敬語, pause, read the gloss. Move to 最敬語, show 拝啓/敬具. Then back to 丁寧. Skip カジュアル unless asked. | Register text + English gloss | "This is the part no dictionary gives you." Say **Shisa** here. |
| 1:50–2:10 | Why now | Slide 3 | Two numbers | 4.12M / +85%; 84,759 / 73,313 / 7,301. |
| 2:10–2:25 | DEMO 4 | If the live card raised a conflict, point at it. If not, say "when they disagree we show both" and move on — do not switch to mock just for this. | Conflict row: both values | Say **OpenAI** here (vision, strict JSON). |
| 2:25–2:45 | DEMO 5 | Photograph `lease-restoration` (or open the pre-decoded tab). Scroll to the finding. | Finding: clause, guideline, citation, `differs`; benchmark line beneath | Say **Qdrant** and **Neo4j** here. "This exact discrepancy cost me a week of my life last month." |
| 2:45–3:00 | Business + ask | Slides 11–12 | | Free → paid → B2B2C. The ask. |

Pre-decode the lease before you go on: photograph it in a second tab during setup
so beat 5 is a tab switch, not a 15-second wait at the end of your time.

### What to type in the reply box

Exactly the placeholder: **`tell the teacher my son is allergic to eggs`**
(the placeholder is already this string, so the audience sees the prompt before you
type it). Recipient: leave the default chip. Do not edit the recipient live.

### Slider stops to foreground

Per `docs/register-eval.md` (run of 2026-08-27 10:18, 10 scenarios): 10/10 pass,
カジュアル plain in 10/10, 敬語 and 最敬語 honorific markers in 10/10, 0 near-identical
pairs.

- 丁寧 is the default and the one a parent actually sends. Start there.
- カジュアル→丁寧 (+42.9) and 敬語→最敬語 (+35.7) are the big visible jumps. If you
  only have time for one drag, go 丁寧 → 最敬語 and back: 拝啓/敬具 appearing is the
  moment the room gets it.
- 丁寧→敬語 is the narrowest step (mean similarity 0.53; 3/10 scenarios flagged
  `NO_FORMALITY_GAIN`). Pause on the English gloss at 敬語, not on the text diff, so
  the audience hears what changed even when the visible change is small.
- The `allergy-teacher` scenario — the one you demo — is clean at every step
  (丁寧→敬語 +26.9), so on this document the whole ladder reads well.

Another agent is still tuning. If `docs/register-eval.md` has a newer timestamp
than 10:18 when you leave, re-read its Summary block and adjust the bullets above.

---

## 3. When it goes wrong

| Symptom | What happened | Do this | Say this |
|---|---|---|---|
| Card never arrives; server log shows `429` / `insufficient_quota` from OpenAI | No vision credits or rate limit | Switch to the `?mock=1` tab. Continue the script unchanged. | "That's the vision call rate-limiting — here's the same document decoded a minute ago." |
| Vision returns but `summaryOnly` is true on the excursion print | Bad photo (angle, glare) | Retake once, flat, under the light. If it fails again, mock. | "That's the confidence gate — under 0.6 it refuses to invent a deadline. Let me retake." (This is a feature. Say so.) |
| Reply box: one register shows an error | Shisa 429 or a truncated stream on one of four calls | Wait 1s and press send again; the other three are still readable. | "One of the four streams dropped — the others are independent." |
| Reply box: all four error | Shisa down | `?mock=1` tab, send the same intent. | Same line; don't explain further. |
| Lease finding shows but no "In the KAIFŪ corpus…" line | Neo4j down or not seeded | Nothing. The line just doesn't appear. | Skip the benchmark sentence in the pitch; keep the Neo4j mention on the flywheel slide. |
| Lease finding missing entirely | Qdrant down **and** keyword routing missed | Very unlikely for `lease-restoration` (hint keywords are present). Open `?mock=lease`. | Don't mention Qdrant being down; the fallback is silent by design. |
| Server refuses to boot: "model must start with shisa-ai/" | `SHISA_MODEL` was edited | Fix `.env.local`, restart. | If it happens on stage, it's a mock-only demo. |
| Phone can't reach the LAN URL | Venue Wi-Fi isolates clients | Tether the laptop to the phone's hotspot; re-read the IP; new origin means re-grant camera. | — |
| Projector shows nothing from mirroring | QuickTime lost the device | Unplug/replug the phone; or run the demo on the laptop with the file picker and the sample `.photo.jpg`. | — |

Rule: never debug on stage for more than one retry. Mock mode shows the identical
UI; the audience loses nothing except the live-call latency.

---

## 4. Two minutes before you walk on

1. `curl -s localhost:6333/collections | grep -c kaifu` → `2`
2. `lsof -iTCP:7687 -sTCP:LISTEN` → java
3. http://localhost:3000 loads; phone loads the LAN URL; camera opens.
4. Tabs open on the laptop, left to right: live · `?mock=1` · `?mock=lease` · pre-decoded lease · deck.
5. Printed excursion notice and lease clause in hand, in that order.
6. Deck on slide 1, full screen (`F` in the deck).

---

## 5. Sponsor cheat sheet — one line each

| Sponsor | Say |
|---|---|
| **Shisa** | "All Japanese generation and the four-register engine run on Shisa, Japan-hosted; the client refuses any model that isn't `shisa-ai/*`." |
| **OpenAI** | "Vision does OCR, classification and field extraction through the Responses API with strict structured outputs — JSON only, never a word of Japanese — and `text-embedding-3-small` embeds clauses for retrieval." |
| **Qdrant** | "JUDGE retrieves the matching MLIT guideline by vector search over `kaifu_groundtruth`, so a paraphrased clause still finds its section; `kaifu_clauses` is the seed of the clause benchmark." |
| **Neo4j** | "The opt-in corpus graph — documents, obligations, clause types, guideline citations — anonymized to categories and numbers, and queried live for 'how many leases contain this clause and how many differ'." |
| CreatorLabo / HackerSquad / Tokyo AI | "Thanks for running the event." (Slide 12 carries the wordmarks.) |
