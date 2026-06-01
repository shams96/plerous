# RefChain — AI-Native Company Operating Principles

**Date**: 2026-05-31  
**Source**: YC / Diana (partner) framework + applied to RefChain context  
**Core thesis**: AI is not a tool we use. It is the operating system RefChain runs on — and the operating system we sell to healthcare practices.

---

## The Shift Most Companies Miss

Most companies think about AI as productivity. "It makes engineers faster." "It automates repetitive work."

That framing misses the real shift: **entirely new capabilities**, not just speed on existing ones.

The right person with AI tools can now build what used to require an entire team — or what was simply impossible before. RefChain is the proof of this. The FHIR compliance layer, PAIA agent, Sentinel agent, patient tracking system, denial feedback loop, AI training loop — this is not the output of a 20-person engineering team over two years. It is the output of a single AI-native operator with the right infrastructure. That is not a productivity story. That is a capability story.

---

## Principle 1: AI Is the Operating System, Not the Tool

**Wrong**: "We use AI to help us build faster."  
**Right**: "Every workflow, every decision, every process flows through an intelligent layer that is constantly learning and improving."

This is not abstract. It means:
- Every referral action in RefChain produces an artifact that feeds back into the system
- PAIA does not just decide — it learns from outcomes (denial feedback loop already built)
- Sentinel does not just alert — it acts and escalates (auto-recovery already built)
- The AI training loop does not just score — it adjusts its own weights from human override signals (already built)

**These are not features. These are closed loops. We must name them as such and build more of them.**

---

## Principle 2: Closed Loops Over Open Loops

**Open loop**: Make a decision → execute it → move on. No systematic measurement. No feedback. Inherently lossy.

**Closed loop**: Monitor output → compare to stated goal → adjust the process → repeat.

Every important process in an AI-native company should be a closed loop. RefChain already has several:

| Closed Loop | What It Monitors | What It Adjusts |
|---|---|---|
| **PAIA + Denial Feedback** | Authorization denial rates per procedure/payer | PolicyRule `denialRateBaseline`, weights next PAIA decision |
| **AI Training Loop** | Human override signals on risk scores | Risk model weights in Redis (survives restarts) |
| **Sentinel Agent** | Referral stall patterns across all orgs | Auto-escalation, provider notifications, statusHistory |
| **Patient Tracking** | Patient engagement with status page | (Future: which status messages drive callbacks vs. silence) |

**What we are missing** (build these next):
- Closed loop on **scheduling completion rate** — did the patient actually book after receiving the tracking link?
- Closed loop on **specialist acknowledge latency** — which specialist orgs are slow, why, and how to nudge them
- Closed loop on **PAIA human override patterns** — when coordinators override PAIA, why? That signal improves the agent
- Closed loop on **referral source quality** — which EHR systems send the most complete referrals? Feed that back to onboarding guidance

---

## Principle 8: Agents Over Tools

**See `docs/agents-over-tools.md` for the full framework.**

Every time the instinct is "we should buy a tool for that" — stop. Ask: what is the job this tool actually does? If the data is in our system and the output is a decision or a draft, build an agent.

Eleanor Dorfman (Anthropic Head of Industries) showed how to thread Claude through an existing 6-tool SaaS stack to create a coherent customer journey. That is the right answer for a company that already owns the stack. For RefChain building from zero, the right answer is agents that make the tools unnecessary.

**The Eleanor stack and its agent equivalents**:
- Clay (enrichment) → NPPES Agent (already built, free)
- Salesforce (CRM) → Practice Intelligence Agent (our own DB)
- Gong (call coaching) → Conversation Agent (transcript → action items)
- Ironclad (contracts) → Contract Agent (generate + flag)
- Intercom (support) → Support Agent (built into notify system)
- Lean Data (routing) → Qualification Agent (specialty + size + urgency scoring)

**Five agent jobs that matter** (from Eleanor's five skills, translated):
1. Morning Brief — founder (internal) + coordinator (product)
2. Pre-call/pre-interaction context — know everything before every touchpoint
3. Follow-through enforcement — commitments are tracked and surfaced
4. Competitive/payer intelligence — dynamic, not quarterly static
5. Asset generation — custom ROI calculator or one-pager for any prospect or patient

**Token-max, not tool-max.** The only external tools RefChain needs are infrastructure it cannot build: Twilio (carrier SMS), Anthropic API (intelligence), Supabase (database). Everything else: agent.

---

## Principle 3: The Queryable Organization

**The organization must be legible to AI.** Every important action produces an artifact. The intelligence layer always has an up-to-date view of what is actually happening.

For RefChain internally:
- Every build decision is captured in this memory file and project context
- Every API design decision has a rationale in code comments or docs
- Every strategic decision is in `docs/` — not locked in someone's head or a DM

For RefChain's customers (the product we sell):
- Every referral action writes to `statusHistory` — a complete, queryable timeline
- Every PAIA decision writes to `PAIAAnalysis` — with chained SHA-256 audit hash
- Every admin action writes to `AdminAction` — full before/after state
- Every notification writes to `Notification` — delivery status, channel, timestamp
- The audit log captures every meaningful system event

**We are not just building a referral tool. We are giving healthcare practices their first queryable, artifact-rich representation of their care coordination process.** That is the deeper value — not the UI, not the tracking link, but the intelligence substrate that every improvement compounds on.

---

## Principle 4: Software Factory Mode

**Spec + tests → AI generates implementation → iterate until tests pass.**

This is how RefChain is built. The human (DRI) writes what success looks like. The AI agent (Claude) generates the implementation. This is not a productivity boost on the old way — it is a fundamentally different way to build.

**Implications for our build process**:
- Before implementing any feature, write the acceptance criteria first (what does "done" look like in a curl command or browser test?)
- E2E test scenarios (`docs/e2e-test-scenarios.md`) is not documentation — it is the spec harness that drives implementation quality
- Every new agent, every new route, every new schema change should have a test scenario written before the code is written
- The AI (this session) is the "software factory worker." The founder is the spec writer and output judge.

---

## Principle 5: No Human Middleware

**Classic management hierarchy routes information. In an AI-native company, the intelligence layer routes information.**

For a small team, this means:
- No status update meetings — the system is always queryable
- No "can you check on that referral?" phone calls — the tracking page answers that
- No coordinator guessing which referrals are at risk — Sentinel surfaces them proactively
- No "did you get the fax?" — the acknowledge flow closes that loop

**This is the product we are selling to healthcare practices.** We are not selling them software. We are offering to remove the human middleware from their referral process — the coordinator spending 20 hours/week making phone calls to confirm receipt — and replace it with a closed-loop intelligent system.

That is a fundamentally different pitch than "better referral tracking."

---

## Principle 6: Three Roles for an AI-Native Team

Per Jack Dorsey / YC framework:

| Role | What They Do | RefChain Context |
|---|---|---|
| **IC / Builder-Operator** | Directly makes and runs things. Comes to meetings with working prototypes, not decks. | Every team member builds. No "I'll have my engineer look at that." |
| **DRI** | Directly Responsible Individual. One person, one outcome. Strategy + customer results. No hiding. | Founder owns each customer outcome. MPSC pilot = one DRI. Availity integration = one DRI. |
| **AI Founder** | Still builds. Still coaches. Leads by example. Shows what massive capability gains look like. | The founder must be the most AI-native person on the team — not delegating AI strategy to someone else. |

**The anti-pattern to avoid**: Hiring a "VP of Engineering" to manage AI tools. If you need a manager to extract value from AI, you have already lost the advantage. The founder must be at the frontier personally.

---

## Principle 7: Token-Max, Not Headcount

**The uncomfortable API bill is replacing what would have cost 10× in headcount.**

This means:
- Do not hesitate to run long AI sessions to build complex features
- Do not limit agent autonomy to save tokens — the cost of human time to do it manually is orders of magnitude higher
- Measure output in capability shipped per dollar of API spend, not in traditional engineering metrics
- A $500/month Anthropic bill that replaces a $15,000/month engineering hire is not a cost — it is a 30× ROI

**Applied to RefChain's product**: Every Sentinel run, every PAIA analysis, every AI risk score is an AI spend. That spend is what makes the referral system intelligent. Do not build a "lite mode" to reduce AI calls — the AI calls are the product.

---

## What This Means for the Product Roadmap

The product evolution should be framed not as "adding features" but as "adding closed loops":

```
Closed Loop 1 (done):    Referral completion
                         Monitor stalls → Sentinel escalates → coordinator acts

Closed Loop 2 (done):    Prior auth accuracy  
                         Monitor denials → feedback updates PolicyRules → PAIA improves

Closed Loop 3 (done):    AI risk model
                         Monitor human overrides → training loop adjusts weights → scores improve

Closed Loop 4 (next):    Scheduling completion
                         Monitor patients who receive tracking link but don't schedule
                         → trigger proactive outreach → measure appointment conversion

Closed Loop 5:           Specialist responsiveness
                         Monitor acknowledge latency by specialist org
                         → surface slow specialists to referring providers
                         → shift referral routing toward responsive specialists

Closed Loop 6:           Longitudinal care
                         Monitor all referrals per patient across time
                         → detect care gaps before they become adverse events
                         → the full "AI Care Flow Infrastructure" vision
```

Each closed loop adds a layer of intelligence to the same underlying data. The data network compounds. This is the moat — not the UI, not the FHIR compliance, but the **self-improving intelligence layer** that gets smarter with every referral that flows through it.

---

## The Positioning Implication

We have three ways to describe what RefChain is. Each is true. Each serves a different conversation:

| Audience | Frame | One Line |
|---|---|---|
| PCP practice manager | Compliance | "Be CMS-0057-F compliant before January 2027. Automated." |
| Specialist revenue cycle | Revenue | "Recover 15–30% of referrals leaking from your schedule." |
| Health system CXO / EHR vendor | Platform | "The AI operating system for care coordination. Every care action, tracked to completion." |
| Investor | Category | "We are building the closed-loop intelligence layer for US healthcare. Referral is the wedge." |

The third and fourth frames are only possible because we built it AI-native. A company that bolted AI onto a traditional referral SaaS cannot make that claim authentically. We can, because the closed loops are in the product from day one.
