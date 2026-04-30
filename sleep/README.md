## Sleep Schedule Planner (Brain Prototype)

This folder contains a **static, dependency-free** prototype that:

- Accepts **JSON inputs** (profile + tasks + sleep history / habit preferences)
- Computes a recommended **sleep window** (sleep start/end) for a given date
- Produces:
  - **JSON output** (machine-readable plan + explanations + citations)
  - **HTML output** (human-readable report with references)

### Run

From the repo root:

```bash
node server.js
```

Then open `http://localhost:5173/sleep/`.

### Files

- `index.html`: UI and report viewer
- `app.modern.js`: UI logic
- `engine.js`: scheduling “brain” (pure functions)
- `schemas/`: input/output JSON Schemas
- `examples/`: example inputs/outputs

