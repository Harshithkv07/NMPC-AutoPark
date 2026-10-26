# Trailer Parking Guidance: NMPC + Hybrid A* (version 2, design 3: a redesigned interface)

**A trial version.** Design 3 is design 2 (`../v2-design-2`) with the same engine and the same precomputed library,
unchanged; only the site chrome — header, footer, navigation and a few layout details — has been redesigned. Everything
below the first section is design 2's README and still applies in full to the simulation, the API and the data.

## What design 3 changes

**1. A header that is actually there.** Design 2's top bar only existed on the home page: the moment you opened a
configuration, the page had no header at all, and there was no way back to Home short of reloading. Design 3 gives every
screen (set-up, guidance, the yard editor) a persistent top bar: the brand mark and a **Home** breadcrumb that actually
works, a **GitHub** link to the repository, and the live-solver status pill, all in the same place they were on the home
page (`src/ui/TopBar.jsx`, wired into every screen in `src/App.jsx`'s `goHome`).

**2. A header that knows where you are.** On the home page, **How it works** and **Configurations** in the nav now
highlight the section currently in view (an `IntersectionObserver`, not just a static link list), the same pattern a
breadcrumb uses in the app.

**3. A real footer.** The old footer was two lines of text. Design 3 replaces it with a proper site footer: the brand and
a one-line description, an "On this page" section nav that mirrors the header, a "Built with" list (Hybrid A*, NMPC,
React Three Fiber), the GitHub link and the team credits, and a bottom bar with the copyright line, the version tag and
a back-to-top button (`src/ui/Home.jsx`'s `Footer`).

**4. Small layout polish.** The two home-page sections are numbered (01 / 02) to read less like an auto-generated
single-column page, and the new header/footer links share one icon and colour language with the rest of the interface
(`src/ui/icons.jsx`: `link`, `up`).

Nothing about the simulation, the API, the data, or any screen's actual content changed — only how you get around it.

Run it: `run_demo.bat` (server and viewer on port **4179**; design 2 stays on 4177). Develop: `npm run dev` on 5179 with
`python server.py`.

---


**Model Predictive Control for automated reverse docking and driver guidance of an articulated tractor-trailer.**
Group B9 - Harshith KV, G Venugopalan, Rithvik Arulprakash, Vipin Sudhakar.

Version 1 replays a library of pre-solved lots. Version 2 keeps that library, redesigns the interface around a real 3-D
yard (see below), and adds a **live solver on the laptop**:

* **New random lot**: a genuinely new random fill of parked trucks (any seed, not one of the six library fills).
* **Edit fill**: click bays to park or remove trucks, then **Solve lot**.
* **Set the vehicle**: in "Set up the lot" the vehicle panel is editable (wheelbase L1, hitch-to-axle L2, hitch offset d,
  steering lock, hitch-angle limit, jackknife angle; presets Standard / City / Long-haul). The yard is re-sized for the rig
  (longer bays and trucks, a roomier aisle for a longer one) and every free bay is planned and certified for it.
* Every free bay of the lot is then planned (Hybrid A\*), driven in closed loop by the NMPC, driven again by the unaided
  driver, and **certified**, in parallel on all cores. Bays turn green as they pass (typically 5-25 s for a whole lot).
  Click a bay while it is still being solved and its guidance starts the moment it is certified.
* **A second attempt, like a driver**: a bay that does not certify at its first attempt is not given up on. It shows
  "being certified" while the solver tries again (see "The second attempt" below), and only a bay that fails that too is grey.

The maths is exactly version 1's: same model, planner, NMPC formulation (0.25 s control period, 24 x 0.4 s horizon, 8
steering blocks, same weights, hard |psi| <= 60 deg) and the same certification checks. Only the implementation is faster.

## Run the demo

```
cd viewer && npm install && npm run build      # once per machine
run_demo.bat                                    # every time: starts the solver + viewer, opens http://localhost:4175
```

`run_demo.bat` runs `python server.py --open`: one process that serves the viewer and the solver API, with a pool of up to
10 solver processes (one per bay). Needs Python with `numpy` and `scipy`, nothing else. If the viewer is served as plain
files instead (for example `python -m http.server --directory viewer/dist`), it detects that there is no solver and
behaves exactly like version 1: library fills only, live buttons disabled with a hint.

## What is new, on screen

**The yard is the hero.** An asphalt lot inside a concrete apron with painted bay lines, a yellow centre line, curbs and
an entry gate; tractor-trailers modelled from the real parameters (cab-over tractor, box trailer, dual wheels, lights),
in fleet colours, under a sun with soft shadows. The default view is an angled 3-D camera framed on the bays and the rig;
**Plan** gives the exact top view with a scale bar. While guiding, the NMPC look-ahead is drawn as ghost outlines of the
rig 3, 6 and 9 s ahead, with the predicted tractor and trailer axle paths, the planned path (dashed) and the driven path.

**A calmer interface.** One typeface (Inter, bundled), larger type, no rules between rows, colour only for meaning
(blue = what the controller commands, orange = your rig, green / amber / red = status). Every panel fits with nothing cut
off at 1280x720, 1366x768, 1536x864 and 1920x1080.

| Where | While choosing a bay | While guiding |
|---|---|---|
| Top bar | layout switch, library fill stepper (or **Live** / **Editing**), live-solver status | same |
| Left | every bay with a status badge and the reason when not certified | the procedure (gear, steering, speed, distance, hitch peak per step) or the run report |
| Band above the yard | **Choose a bay**, **Edit fill**, **New random lot**; while solving "Certifying bays... 2 of 4" | gear, the instruction, advised steering / speed / distance / hitch peak, next step, **Guided / Unaided** |
| Right | **How it works** (four steps) and **Vehicle & model** (labelled top-view diagram, parameters, equations) | hitch dial and psi chart with the NMPC prediction, driver inputs against advice, the live model with the three terms of psi-dot |
| Bottom | library and live-lot totals | play, steps, a timeline coloured by gear, speed 1/4x to 8x, pause at each step |

## Measured on this laptop (16 cores / 22 threads, 31 GB)

**Per bay**, one at a time on an idle core (`python -m sim.bench`: plan + NMPC run + unaided run + certification):

| Scenario | Version 1 | Version 2 | NMPC solve, v1 -> v2 |
|---|---|---|---|
| Cross, fill 1, bay 6 (the run on the slides) | 56.4 s | 5.2 s | 141 -> 11.9 ms |
| Angled, fill 1, bay 6 | 60.0 s | 12.7 s | 96 -> 13.8 ms |
| Parallel, fill 1, bay 2 | 86.6 s | 15.0 s | 98 -> 14.7 ms |

**Per live lot**, through the API with every free bay solved in parallel (two new seeds per layout): median **13 s**,
range 3.5 s (tandem) to 24.7 s (angled). With the viewer open the browser shares the CPU; the solver runs at
below-normal priority so the interface stays smooth.

**Whole library** (110 bays, `python -m sim.export 6`): about 17 min in version 1, **3 min** in version 2.

### Same results: the regression gate

The version-2 engine re-solved all 110 library bays and was compared with the version-1 library (`python -m sim.gate`):

| | Version 1 | Version 2 |
|---|---|---|
| Bays certified | 98 / 110 | **98 / 110** |
| Peak hitch angle, any certified run | 53.3 deg | **53.3 deg** (limit 60) |
| Unaided driver jackknifes on certified reversing bays | 60 / 60 | **60 / 60** |
| Median parked error, cross / angled / parallel / tandem | 0.58 / 0.17 / 0.72 / 0.10 m | 0.35 / 0.17 / 0.72 / 0.10 m |

Two bays changed status, one each way (angled fill 2 bay 8 lost, parallel fill 5 bay 1 gained): the planner now expands
nodes in a batch, and floating-point differences of order 1e-15 can tip a search that sits on a boundary. The run shown on
the slides (cross, fill 1, bay 6) is identical in every reported figure: parked 0.58 m / 4.7 deg off, peak |psi| 40.4 deg,
394 solves, unaided jackknife at 56.9 s. `viewer/public/data` holds the library regenerated by the version-2 engine.

### How it got faster (same maths)

* **NMPC** (`sim/tracker.py`). SLSQP needs the cost, the 48 hitch-limit constraints, the 24 clearance constraints and all
  their gradients. Version 1 re-simulated the horizon for each of those and let SciPy difference each one separately
  (about 27 horizon simulations per iteration). Version 2 simulates the point and its 8 forward-difference neighbours as
  **one NumPy batch** (`model.step_batch`, the same RK4) and derives all six quantities from it, with the step SciPy itself
  uses (1.49e-8); single line-search points use the plain-Python RK4, which is faster for one trajectory.
* **Clearance** (`sim/collision.py`): one signed-distance lookup for every covering disc of every predicted state.
* **Planner** (`sim/planner.py`): the 10 stabilised motion primitives of a node are driven and collision-checked as one batch.
* **Processes**: BLAS pinned to one thread per process (`sim/__init__.py`), otherwise twenty solver processes exhaust the
  Windows commit limit; the 3-D view renders only on change while a bay is being chosen.

## The second attempt (`sim/export.py`: `LADDER`)

A real driver who ends up crooked, or too close to a neighbour, stops, pulls forward and tries again. The first attempt of a
bay is exactly the one the library uses, so a bay that certifies at once is never changed. If it does not, a second job
(`solve_bay(..., deep=True)`) works down a ladder, and the first attempt that certifies wins:

1. **Pull forward and park again.** If the run ended *safe* (no jackknife, hitch limit kept, nothing touched) but not parked
   within tolerance, the rig plans a new route from where it stopped (up to two more legs) and parks again.
2. **Stop and re-plan.** During these attempts the run stops the moment the rig is within 0.15 m of anything, instead of
   reversing on into a collision, and continues from there.
3. **Another route.** Fresh attempts from the gate with other planner settings (a gentler search weight, and more
   clearance), each followed by the same pulling forward and re-parking.

Nothing is loosened: the whole chain of legs is held to the first attempt's checks (no jackknife, hitch angle never above
the limit, at least 0.10 m from every obstacle, parked within 0.8 m / 10 deg / 12 deg). The run report says when a bay
needed a second attempt. Attempts stop after 300 s of solving, and the reason for a bay that still fails says how many
were made.

## Solver API (`server.py`)

| Request | Answer |
|---|---|
| `GET /api/health` | `{"version": 2, "workers": n, "vehicle": {"limits", "jack_gap"}}`: the range of every editable vehicle parameter |
| `POST /api/lots {layout, seed?, occupied?, vehicle?}` | `{"lot_id", "lot"}`: the lot in the library-file format, free bays `pending`, no plans yet. No `seed`: a random one. `occupied`: the exact list of bay ids holding a truck (the others keep their seeded poses). `vehicle`: `{L1, L2, d, delta_max, psi_crit, psi_jack}`, metres and degrees, any key optional; the lot is sized for that rig. |
| `POST /api/layout {layout, seed, occupied?, vehicle?}` | `{"lot"}`: the same lot, unsolved, only to preview its geometry for a rig |
| `GET /api/lots/<id>` | `{"bays": [{id, status, reason?, s?}], "done", "elapsed"}`, status `pending` / `solving` / `deepening` (the second attempt) / `ok` / `infeasible` |
| `GET /api/lots/<id>/plans/<bay>` | the certified plan, same format as `lot.plans[bay]` in a library file |

Single-user demo server on `127.0.0.1`: a new lot abandons the previous one and stops its solver processes.

## Develop and test

```
pip install numpy scipy pytest
python -m pytest                     # fast tests, including the server API with a stub solver
python -m pytest -m slow             # closed-loop NMPC, solve_bay on the reference bay, on an edited fill, and the second attempt
python -m sim.bench                  # per-bay timing
EXPORT_OUT=<dir> python -m sim.export 6 && python -m sim.gate <dir>
cd viewer && npm test                # clock, maths, live-lot merge and edit logic (Node built-in runner)
cd viewer && npm run dev             # port 5175; start python server.py too, /api is proxied to it
```

## Honest limitations

* **Solve time depends on the lot**: tight bays make the planner search longer. A bay that cannot be certified is shown
  grey with the reason, exactly as in the library; an edited fill that walls a bay in is reported, not special-cased.
* **Single user**: the server is a local demo server, not a multi-user service.
* **Kinematic model only** and **generous aisles**, as in version 1: see `the deleted version 1 (git history, commit 50e6e61)` at commit `50e6e61`.
