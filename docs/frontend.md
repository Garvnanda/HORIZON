# frontend.md — HORIZON demo interface

**Owner: P1.** Streamlit, offline, no external calls at inference.

---

## The premise

Judges see the demo for five to ten minutes. Whatever is not on screen did not happen. Four weeks of modelling that renders as a line chart and a table will lose to a weaker project with a screen that makes someone lean forward.

The demo has one job: **make it obvious that we forecast rather than detect.** Every design decision below serves that.

---

## The one-screen test

If a judge glances at the main screen for three seconds and cannot tell that we are showing *the future*, the design has failed. That is why the forecast cone is the centrepiece and why the "now" line is the most visually prominent element on the page — everything to its right is imagined.

---

## Design principles

**Show the future explicitly.** Every time-based chart has a clear "now" marker, with observed history to the left and forecast to the right, visually distinguished (solid versus translucent, or a shaded forecast region). A judge should never have to ask which part is prediction.

**Uncertainty is a feature, show it.** Fifty sampled futures are the most distinctive thing we have. Never collapse them to a single line. The spread *is* the story.

**One screen, one message.** Do not build a dashboard of twelve small charts. Build a few large panels, each making one point, laid out in the order of the demo narrative.

**Real numbers, not standardised ones.** The trajectory table shows "47 distinct ports", not "2.31". Convert back to original units at the display layer.

**Nothing fake.** No placeholder charts left in, no fabricated numbers, no "coming soon" panels. A judge who spots one padded element distrusts everything else.

**Restraint.** Dark or light is a preference; consistency is not. One accent colour for threat, one neutral for normal, one for the counterfactual. No gradients, no glow, no animated backgrounds. Security tooling that looks like a game menu reads as unserious.

---

## Layout

A left sidebar for controls, a main column for panels, in demo order top to bottom.

**Sidebar:**
- Host selector (dropdown, searchable)
- Time position scrubber
- Alert threshold slider — **live**, and the alert marker moves with it. Judges will drag this; it demonstrates that we understand the threshold trade-off rather than hiding it.
- Sample count (25 / 50 / 100)
- Demo mode toggle (reveals ground truth)

**Main column, in order:**
1. Forecast cone
2. Counterfactual comparison
3. Trajectory table
4. Surprise timeline
5. Response recommendation

---

## Panel 1 — Forecast cone (the centrepiece)

**What it shows.** The last 20 minutes observed, then 20 minutes forecast. Fifty sampled trajectories as translucent lines. The median bold. The alert threshold as a horizontal line. A vertical "now" divider. In demo mode, a vertical marker where the attack actually began, with the gap between alert and attack annotated: **"Alert fired 6 minutes early."**

**Why this shape.** It reads as a hurricane forecast cone, and nobody needs that explained. It also proves visually that we produce a distribution over futures rather than a single number — which no classifier can do.

**Details:**
- 50 lines at roughly 8–12% opacity; overlap density does the work
- Median at full opacity, 2–3px
- Threshold line dashed, muted
- Shade the forecast region lightly to separate it from history
- Annotate the lead time in plain words, not just a number

**Build this first.** In Week 1, against mock data.

---

## Panel 2 — Counterfactual comparison (the differentiator)

**What it shows.** Two probability curves on one axis, from the same history: *do nothing* climbing, *isolate host now* flattening. An action dropdown (isolate / rate-limit / do nothing). A marker showing where the intervention was applied.

**Why it matters most.** It is the only screen that answers *should I act?* Every other panel describes a situation. This one supports a decision. It is also the only thing on the demo that a classifier fundamentally cannot produce.

**Non-negotiable:** a visible caveat line under the chart — *"Model-predicted outcome under intervention. Not causally validated; no intervention ground truth exists for this data."* Saying this before a judge asks converts a vulnerability into a credibility signal.

---

## Panel 3 — Trajectory table

**What it shows.** Predicted feature rows for steps 1–5 in a table, beside what actually happened. Cells that diverge sharply highlighted. Original units.

**Why.** This is what makes "world model" concrete rather than asserted. A judge can see the model wrote down *47 distinct ports, failure rate 0.71* for a minute that had not happened yet. Cheap to build — it is a dataframe with conditional formatting.

---

## Panel 4 — Surprise timeline

**What it shows.** A line of surprise (prediction error) over observed history, with spikes marked. If a held-out-class result exists, a toggle showing an attack class the model was never trained on, still spiking.

**Why.** This is the novel-attack story. If the held-out-class experiment works, this panel is the proof and it should be the last thing on screen before the close.

---

## Panel 5 — Response recommendation

**What it shows.** Threat tier, the specific filled-in command for this host, Approve / Dismiss buttons, and a decision log.

Tiers: under 40% log only · 40–65% verbose logging · 66–89% rate-limit · 90%+ isolate.

**Explicit and visible:** the system never executes. It fills in a command, an analyst approves, the decision is logged. Lowest priority of the five panels — a judge has seen a hundred `iptables` suggestions — but it closes the loop from forecast to action.

---

## The demo script, 2 minutes

Build the interface so this runs without hunting for controls.

1. **(15s)** "This is one machine on a corporate network. Here is its last 20 minutes." — history on screen
2. **(30s)** "Our model imagines the next 20 minutes, fifty times." — cone appears, most futures quiet, some escalating
3. **(20s)** "The alert fires here. The attack actually started here. Six minutes of warning." — markers, annotation
4. **(30s)** "The analyst asks: if I isolate this machine now, does it help?" — counterfactual, two curves diverging
5. **(15s)** "And this attack class was never in our training data." — surprise panel, if the result holds
6. **(10s)** Close on the recommendation panel

Rehearse it. Time it. The video is scripted around one host, not a feature tour.

---

## Practical notes

- Cache aggressively — `@st.cache_data` on file loads, `@st.cache_resource` on the model. Judges will click around; nothing should take three seconds.
- Precompute forecasts for the demo hosts and ship them as JSON. Live inference on stage is an unnecessary risk.
- Test with the sidebar collapsed and on a projector at 1280×720. Thin lines and low-contrast greys vanish on a projector.
- Handle missing fields gracefully — if `counterfactual` is absent from a JSON file, the panel says so rather than crashing.
- Keep a known-good frozen demo build separate from the one being edited.
