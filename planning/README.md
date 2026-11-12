# Planning System — the control layer above `/flow`

This directory is the **conductor** for all substantial work on this project.
It decides *what* gets built, *in what order*, and *broken up how* — and feeds
fully-specced, validatable units into `/flow` for execution.

`/flow` executes one well-defined feature with a hard TDD gate. This system is
the layer above it: backlog → prioritization → progressive refinement → ready.
It is driven by the `/backlog` skill.

---

## Hierarchy

```
INITIATIVE   the whole job — the "why" (optional top level)
  └─ EPIC    a related cluster of work, one coherent outcome  → planning/epics/E##-slug.md
       └─ TASK   one validatable unit = one /flow run         → planning/tasks/T###-slug.md
            └─ SPEC  executable definition (via /spec), attached when the task is READY
```

Minimum is two levels: **Epics** (groups) + **Tasks** (flow units). Use the
Initiative level only when a job spans several epics.

---

## The board (states)

Every epic and task is in exactly one state:

```
INBOX → REFINING → READY → IN FLOW → IN REVIEW → DONE
```

| State | Meaning |
|-------|---------|
| `inbox` | Captured, raw, not yet discussed |
| `refining` | Being scoped & broken down (the refinement loop) |
| `ready` | Passes Definition of Ready — eligible for `/flow` |
| `in-flow` | Actively running through `/flow` (RED → GREEN → QA) |
| `in-review` | PR open, awaiting merge |
| `done` | Merged + validated |
| `blocked` | Stuck on a dependency or decision (note why in the log) |

**WIP rule:** normally **one task `in-flow` at a time** for stability. Don't pull
a new task into flow until the current one reaches `in-review` or `done`.

**Checkpoint:** when an epic's last task hits `done`, run a milestone review —
did the cluster deliver its outcome? Capture learnings before pulling the next epic.

---

## The refinement loop (the engine)

For each epic, move it left→right through these steps. This is where vague intent
becomes a workable plan with well-defined specs.

1. **Capture** — log the intent, raw, in `inbox`.
2. **Discuss & scope** — interrogate the idea; explore implementation needs & options;
   write down **scope** *and* **non-goals**. Ground every claim in the real code —
   for an unfamiliar codebase, map it first (parallel exploration) and save findings
   to `planning/architecture-map.md`. (→ `refining`)
3. **Decompose** — split the epic into tasks; split any task too big for one `/flow`;
   map dependencies between tasks.
4. **Size & validate** — each task must be *one coherent outcome, one flow run*.
   Too big → split again.
5. **Spec** — run `/spec` on the task → acceptance criteria + executable spec. (→ `ready`)
6. **(Conditional) plan review** — for architecturally non-trivial or visual tasks,
   pre-vet with `/plan-eng-review` / `/plan-design-review` before flow.

---

## Definition of Ready (gate into `/flow`)

A task may **not** enter `in-flow` unless **all** are true:

- [ ] Single coherent outcome, fits one `/flow` run
- [ ] Testable acceptance criteria written
- [ ] Dependencies resolved, or explicitly sequenced before it
- [ ] Has a `/spec`
- [ ] Scope **and** non-goals explicit

This gate is what keeps execution stable and thorough instead of vibes-driven.

---

## Priority vs. Order

- **Priority** = how much it matters (value/urgency). Sets which epics we pull next.
- **Order** = the actual sequence — also respects **dependencies** and **risk**
  (de-risk uncertain work early, even if it isn't the highest value).

**Decision rule:** Claude proposes priority + order; the human approves or adjusts.
Conflicts (e.g. high-value but blocked) are surfaced explicitly.

---

## How it connects to existing skills

| Layer | Tool |
|-------|------|
| Backlog / board / refinement | **`/backlog`** (this system) |
| Ready task → executable spec | `/spec` |
| Pre-vet a plan | `/plan-eng-review`, `/plan-design-review`, `/plan-ceo-review` |
| Execute one task end-to-end | `/flow` |
| Land it | `/ship` → PR |

---

## Conventions

- **IDs:** epics `E01`, `E02`…; tasks `T001`, `T002`… (global, never renumbered).
- **Files:** `epics/E01-slug.md`, `tasks/T001-slug.md`. Use the templates in `templates/`.
- **Board:** `ROADMAP.md` is the single source of truth for status — update it
  whenever a state changes.
- **Log:** every epic/task file has a `## Log` section; append dated entries as
  decisions are made. Convert relative dates to absolute.
