# KAIFŪ 開封 — the 3-minute pitch

Spoken word-for-word by Raymond Chen. About 540 words: three minutes at a brisk
pace, 3:20 at a calm one. If the clock is tight, the "Why it's hard" paragraph can
lose its last two sentences and the moat paragraph its "Today: 17" sentence. Demo beats are marked `[DEMO]` and run on the phone mirrored to the
screen; see `docs/demo-runbook.md` for the operational side. Every number here
traces to `docs/market-evidence.md`. Sponsor first-mentions are in bold.

---

## The pitch

Last month I renewed a Tokyo lease. Alone, in Japanese. The terms we'd agreed on
the phone weren't the terms in the draft: the restoration clause charged me for
sun-faded tatami and said I couldn't dispute the landlord's estimate. Finding out
that the national guideline says the opposite took me a week. I can read Japanese.
Most of the 4.12 million foreign residents here cannot read a lease.

KAIFŪ is what I wanted that week. 開封 — opening a sealed envelope.

`[DEMO 1 — the paper]` A real school notice. I photograph it. `[DEMO 2 — the
card]` What it is, and three obligations: slip back by the 11th, ¥1,200 by the
18th, lunch on the 16th. One tap, it's in my calendar. Google Lens tells you what
the words say. Not that you have ten days to return a stamped form.

`[DEMO 3 — the reply]` I type, in English: "tell the teacher my kid is allergic to
eggs." Four Japanese replies stream at once. `[slider]` This is what no dictionary
gives you. 丁寧 — the default to a teacher. 敬語 — humble forms, for something going
on file. 最敬語 — 拝啓, 敬具, the printed reply slip. Each rung has one English line
on what changed and who it's for. This runs on **Shisa**, Japan-hosted, trained for
Japanese rather than merely tolerating it. In our eval every rung is distinct; the
丁寧-to-敬語 step is the narrowest and we're widening it.

Why now. 4.12 million foreign residents at end-2025, up 85% in ten years. 84,759
children in public schools need Japanese language support, 73,313 of them foreign
nationals, that group up 27% in two years. Boards of education employ 7,301
native-language support staff whose job includes translating documents for parents.
That's this product, done by hand, at public expense.

Why it's hard. A wrong deadline is worse than no answer. So there's one seam:
**OpenAI** vision does OCR and extraction and returns strict structured JSON — never
a sentence of Japanese. Shisa does all the Japanese and never sees an image. A
residency promise you can check by reading two function signatures. Then every date
and amount is extracted twice — model, and regex over the raw transcription.
`[DEMO 4 — conflict]` When they disagree, we show both. We never pick.

`[DEMO 5 — the lease]` My clause. JUDGE sets it against the 国土交通省 restoration
guideline, section cited. Citation or silence: a finding without a citation is
dropped in code, and "differs" is the strongest word the type allows. Retrieval is
**Qdrant** over the MLIT ground truth, so a paraphrased clause still finds its
guideline. This exact discrepancy cost me a week of my life last month.

The moat is the corpus. **Neo4j** holds an anonymized graph — document type,
obligation kind, amount, days-until-due, clause type, verdict — never text, never
names. Today: 17 seeded fixtures. At 10,000 documents it answers "how common is
this clause, how often does it differ?" — a lease benchmark that doesn't exist.

Business: decode is free. Judge is paid, one lease, one fee. Then B2B2C: the
guarantors and agencies who meet foreign tenants at signing, and MEXT's ¥1.4
billion subsidy line, where multilingual translation systems are a named eligible
expense.

The ask: an introduction to one rent-guarantee company and one board of education,
and a native reviewer for the register eval. Thank you.

---

## Demo beats at a glance

| Beat | On screen | Line to hit |
|---|---|---|
| 1 | Hold up `school-excursion` print, photograph | "This is a real school notice." |
| 2 | Action card, three obligations, calendar tap | "Google Lens tells you what the words say." |
| 3 | Type allergy intent, four streams, slider 丁寧 → 敬語 → 最敬語 | "This is the part no dictionary gives you." |
| 4 | Point at the conflict row (both values shown) | "We show both. We never pick." |
| 5 | `lease-restoration` card, finding with citation | "This exact discrepancy cost me a week." |

If beats 1–2 run live and are slow, keep talking over the spinner; the "why now"
numbers fit exactly in a 12-second wait.

---

## Questions you'll get, and the honest answer

**弁護士法 72条 — isn't comparing a lease to the law legal advice?**
No, and the product is built so it can't drift into it. JUDGE translates the clause
and places it beside a published government document, with the source and section
shown. It never says illegal, void, unenforceable, or "push back" — the `status`
enum stops at `differs`, so escalating the claim requires changing a type, not a
prompt. A finding without a citation is dropped, not softened. Comparison and
translation are not the practice of law; a recommendation would be, and there is
none.

**Isn't this just Google Lens?**
Lens renders the characters into your language and stops. It doesn't know the
document is a permission slip, that the slip is due on the 11th and the money on the
18th, or that the reply to a teacher takes 丁寧 rather than 敬語. Don't argue it —
put the excursion notice on screen and show the card next to a Lens screenshot.

**NaviNichi.AI launched two weeks ago. TransHero in May. What's different?**
NaviNichi (announced 10 August 2026) is an integrated workflow platform: it works
because the school or company is onboarded. KAIFŪ works from a photo of a piece of
paper with no relationship to anyone. TransHero (May 2026) does camera translation
with "appropriate polite expressions" per scene; it is a translator with a
politeness setting. We do one intent at four registers side by side, with the gloss,
and we extract obligations and compare clauses against ground truth. I've read both.

**Why Shisa over GPT for the Japanese?**
Two reasons. Residency: the documents carry names, addresses, salaries, visa status,
and "your Japanese text is processed in Japan" is a promise to the user, so the
generation path is Japan-hosted and the client refuses any model that isn't
`shisa-ai/*`. Quality: register is the moat, and it runs better on a model trained
for Japanese. Tonight's eval (10 scenarios, four drafts each): 10/10 pass with no
error flags, honorific markers present in every 敬語 and 最敬語 draft, 0
near-identical pairs. The honest weak spot is the 丁寧→敬語 step — the narrowest on
the ladder, and in 3 of 10 scenarios the formality index barely moved. We're
widening that step, and a native reviewer sheet is generated for every run.

**What if the OCR is wrong?**
Two guards. The deterministic pass cross-checks every date and amount against the
raw transcription; disagreement is shown with both values, never resolved. And
below 0.6 confidence the card degrades to a translated summary with no obligations
— a crumpled scan produces less, not something confidently wrong. What it can't
catch is a misread character that the model transcribes consistently; that's the
honest limit, and the retake prompt is the remedy.

**Where's the data stored?**
Nowhere, by default. The photo is downscaled in the browser, held in memory for the
request, and dropped. No image, no text, no history, no database. The only
persistence is the opt-in corpus graph, which stores categorical and numeric facts
only — the test suite pushes sentinel PII through it and asserts none of it reaches
a Cypher parameter.

**LegalOn already does contract review.**
For corporate legal departments, on annual enterprise contracts with quoted pricing.
Different buyer, different price point. Nobody in that market checks a lease on
behalf of the foreign tenant.

**Why won't MEXT's かすたねっと make this unnecessary?**
It's a library of pre-translated templates a school might send, searchable by a
teacher. Supply side. It can't decode the specific paper in a parent's hand,
extract that child's deadline, or draft the reply. Its budget line also shrank this
year.
