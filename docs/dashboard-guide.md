# dashboard-guide.md — presenting the HORIZON demo

One section per panel: what it shows, what to say, the one number to point at.
The same one-liners are in the app behind the **(i)** icon on each panel header.

Layout: left rail (kill chain, trajectory), centre (network scene, forecast), right
rail (evaluation, surprise, response). Every panel has an **(i)** explain popover
and a **⤢** expand-to-fullscreen control (fullscreen also brings up the connected
panels). Header has a theme toggle (Azure light / tactical dark) and **Replay intro**.

---

## Intro screens (first load, or Replay intro)

Four slides: the problem (detection too late, novel attacks missed) → the idea
(forecast, don't classify) → the three things no classifier can do → "here is one
real host". Skippable. Use it to open the pitch; skip it once you are mid-demo.

---

## Network scene (centre top)

**Shows.** The real host-communication graph for this capture. Nodes are machines
(gateway, servers, the domain controller = crown jewel, workstations, the
internet). Edges are observed traffic. Over the **playhead** (scrub bar under the
scene), risk spreads from the selected host along the forecast. The counterfactual
choice in the sidebar changes what you see: **isolate** cuts the attack edges at
the intercept minute and the crown jewel stays green (CONTAINED); **do nothing**
lets it reach the crown jewel (BREACH).

**Say.** "This is the real topology. The attack you see spreading is the forecast,
not an animation. Watch what happens when I isolate the host — the edges cut, the
spread stops, the crown jewel never turns red."

**Point at.** The CONTAINED / BREACH label on the crown jewel as you toggle the
counterfactual action.

**Micro view.** Click any node for its real flows around the current minute
(destination IPs, ports, bytes, benign vs malicious).

---

## Forecast cone (centre)

**Shows.** Last 20 minutes observed, then 20 minutes forecast. 50 sampled futures
as faint lines, the headline curve (fraction of futures that look attack-like),
the spread band, the threshold, and NOW. In demo mode: where the attack actually
began and how many minutes early the alert fired. Hover anywhere for the values.

**Say.** "We do not classify the present. We roll the learned dynamics forward 50
times and read the risk off the futures. The alert fires on the forecast, before
the attack lands."

**Point at.** "Alert fired 6 minutes early" annotation.

---

## Counterfactual (centre, second tab)

**Shows.** The same history under three choices: do nothing, isolate, rate-limit.
Two probability curves on one axis. The gap is the modelled benefit of acting now.

**Say.** "This is the only screen that answers 'should I act'. No classifier can
produce it. It is a structured what-if on learned dynamics, not a causally
validated estimate — and we say that first."

**Point at.** The flattened curve versus the climbing one; the caveat line.

---

## Kill-chain forecast · ATT&CK overlay (left rail)

**Shows.** Eight-stage kill chain (Recon → Exfiltration). Solid dot = current
stage, pulsing dot = predicted next stage. Infiltration-probability bar underneath.

**Say.** "The dataset labels do not map one-to-one to ATT&CK, so this is a stated
heuristic. It gives you a stage name for where the forecast is heading."

**Point at.** "next stage Lateral Movement +6m".

---

## Predicted trajectory (left rail)

**Shows.** The model's predicted feature rows for the next few minutes, in
original units, beside what actually happened. Diverging cells highlighted.

**Say.** "This is what makes 'world model' concrete. The model wrote down 47
distinct ports and a 0.71 failure rate for a minute that had not happened yet."

**Point at.** A highlighted diverging cell.

---

## Surprise timeline (right rail)

**Shows.** Per-window prediction error, standardised per host. Spikes = behaviour
the model of normal cannot account for. Toggle **show <class> held-out**: the model
was trained with that attack class removed entirely, and surprise still spikes
where it begins.

**Say.** "Surprise is the novel-attack channel. Even with this class deleted from
training, the surprise line still fires where the attack starts."

**Point at.** The spike lining up with the shaded attack region, with the overlay on.

---

## Evaluation (right rail)

**Shows.** Lead-time-vs-false-alarm curve, persistence gate (does the model beat
"next minute = this minute"), held-out-weekday drop, calibration, per-class F1.
**MOCK** badge until the notebook run wires real numbers.

**Say.** "Every number here comes from the eval harness, not a notebook cell
pasted into a slide. The lead-time curve is on shared axes with the baselines."

**Point at.** "Beats persistence: yes" — that is the gate the whole premise rests on.

---

## Response recommendation (right rail)

**Shows.** Threat tier, a filled-in command for this host, Approve / Dismiss, a
decision log. It never executes anything.

**Say.** "Decision support, not autonomous response. The analyst approves, the
system logs. It fills the command, it never runs it."

**Point at.** The "Logged to audit trail. Nothing executed." toast after Approve.

---

## The 2-minute walkthrough

1. **(15s)** "One machine on a corporate network. Its last 20 minutes." — history
2. **(30s)** "The model imagines the next 20 minutes, 50 times." — cone appears
3. **(20s)** "Alert here. Attack actually started here. Six minutes of warning." — markers
4. **(30s)** "If I isolate this machine now, does it help?" — counterfactual + scene, edges cut
5. **(15s)** "And this attack class was never in our training data." — surprise overlay
6. **(10s)** Close on the response panel

Rehearse it. Time it. One host, not a feature tour.
