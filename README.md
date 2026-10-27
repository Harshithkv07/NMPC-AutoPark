# Trailer Parking Guidance: NMPC and Hybrid A*

Model Predictive Control for automated reverse docking and driver guidance of an articulated tractor-trailer.
Group B9: Harshith KV, G Venugopalan, Rithvik Arulprakash, Vipin Sudhakar.

Pick a yard layout, click a free bay, and the system guides the tractor-trailer into it (gear, speed, steering-wheel
turns, distance). A Hybrid A* planner proposes the route, and an NMPC controller holds a hard hitch-angle limit so the
rig cannot jackknife.

* **Random lots**: a new random fill of parked trucks, with any seed.
* **Edit fill**: click bays to park or remove trucks, then solve the lot.
* **Editable vehicle**: wheelbase, hitch-to-axle distance, hitch offset, steering lock, hitch-angle limit and jackknife
  angle, with presets. The yard is re-sized for the rig and every free bay is planned and certified for it.
* **Draw your own yard**: any size, bays anywhere, rectangular obstacles and a start pose.
* **Live NMPC**: watch the controller drive a bay in real time, or disturb it.
* **Second attempt**: a bay that does not certify on the first attempt is retried the way a driver would
  (see [The second attempt](#the-second-attempt)).

## Run the demo

```
cd viewer && npm install && npm run build      # once per machine
run_demo.bat                                    # every time: starts the solver and viewer, opens the browser
```

`run_demo.bat` runs `python server.py --open`: one process that serves the viewer and the solver API on port 4179, with
a pool of up to 10 solver processes (one per bay). It needs Python with `numpy` and `scipy`, nothing else. If the viewer is
served as plain files instead (for example `python -m http.server --directory viewer/dist`), it detects that there is no
solver: library fills only, and the live controls are disabled with a hint.

## Develop and test

```
pip install numpy scipy pytest
python -m pytest                     # fast tests, including the server API with a stub solver
python -m pytest -m slow             # closed-loop NMPC runs: the reference bay, an edited fill, and the second attempt
python -m sim.bench                  # per-bay timing
EXPORT_OUT=<dir> python -m sim.export 6 && python -m sim.gate <dir>
cd viewer && npm test                # clock, maths, live-lot merge and edit logic (Node built-in runner)
cd viewer && npm run dev             # port 5179; start python server.py too, /api is proxied to port 4179
```

## Layout

| Path | What it is |
|---|---|
| `server.py` | HTTP server: serves the viewer, solves lots and drives the NMPC live |
| `sim/` | Model, Hybrid A* planner, NMPC tracker, collision checks, lot generation, certification, export and tests |
| `viewer/` | React and Three.js interface (Vite): the yard, the guidance screens, the editor and the live controls |
| `viewer/public/data/` | Precomputed library: the solved plans for the six fills of each layout |
| `eval/` | Stored evaluation results |
| `doc/` | The final presentation deck, the report and the study guides |

## What the screen shows

**The yard is the hero.** An asphalt lot inside a concrete apron with painted bay lines, a yellow centre line, curbs and
an entry gate. Tractor-trailers are modelled from the real parameters, in fleet colours, under a sun with soft shadows.
The default view is an angled 3-D camera framed on the bays and the rig; **Plan** gives the exact top view with a scale
bar. While guiding, the NMPC look-ahead is drawn as ghost outlines of the rig 3, 6 and 9 s ahead, with the predicted
tractor and trailer axle paths, the planned path (dashed) and the driven path.

| Where | While choosing a bay | While guiding |
|---|---|---|
| Top bar | layout switch, library fill stepper (or **Live** / **Editing**), live-solver status | same |
| Band above the yard | **Choose a bay**, **Edit fill**, **New random lot**; while solving, "Certifying bays... 2 of 4" | gear, the instruction, advised steering, speed and distance, next step, **Guided / Unaided** |
| Right | **How it works** and **Vehicle and model** (labelled top-view diagram, parameters, equations) | hitch dial and psi chart with the NMPC prediction, driver inputs against advice, the live model |
| Bottom | library and live-lot totals | play, steps, a timeline coloured by gear, speed 1/4x to 8x, pause at each step |

## Measured results

**Per bay**, one at a time on an idle core (`python -m sim.bench`: plan, NMPC run, unaided run and certification):

| Scenario | Reference engine | Current engine | NMPC solve, reference -> current |
|---|---|---|---|
| Cross, fill 1, bay 6 (the run on the slides) | 56.4 s | 5.2 s | 141 -> 11.9 ms |
| Angled, fill 1, bay 6 | 60.0 s | 12.7 s | 96 -> 13.8 ms |
| Parallel, fill 1, bay 2 | 86.6 s | 15.0 s | 98 -> 14.7 ms |

**Per live lot**, through the API with every free bay solved in parallel (two new seeds per layout): median **13 s**,
range 3.5 s (tandem) to 24.7 s (angled). With the viewer open the browser shares the CPU, so the solver runs at
below-normal priority to keep the interface smooth.

**Whole library** (110 bays, `python -m sim.export 6`): about 17 minutes with the reference engine, **3 minutes** now.

### Regression gate

The current engine re-solved all 110 library bays and was compared with the reference library (`python -m sim.gate`):

| | Reference | Current |
|---|---|---|
| Bays certified | 98 / 110 | **98 / 110** |
| Peak hitch angle, any certified run | 53.3 deg | **53.3 deg** (limit 60) |
| Unaided driver jackknifes on certified reversing bays | 60 / 60 | **60 / 60** |
| Median parked error, cross / angled / parallel / tandem | 0.58 / 0.17 / 0.72 / 0.10 m | 0.35 / 0.17 / 0.72 / 0.10 m |

Two bays changed status, one each way (angled fill 2 bay 8 lost, parallel fill 5 bay 1 gained): the planner now expands
nodes in a batch, and floating-point differences of order 1e-15 can tip a search that sits on a boundary. The run shown on
the slides (cross, fill 1, bay 6) is identical in every reported figure: parked 0.58 m and 4.7 deg off, peak |psi| 40.4 deg,
394 solves, unaided jackknife at 56.9 s. `viewer/public/data` holds the library regenerated by the current engine.

### How it got faster (same maths)

* **NMPC** (`sim/tracker.py`). SLSQP needs the cost, the 48 hitch-limit constraints, the 24 clearance constraints and all
  their gradients. The reference engine re-simulated the horizon for each of those and let SciPy difference each one
  separately (about 27 horizon simulations per iteration). The current engine simulates the point and its 8
  forward-difference neighbours as **one NumPy batch** (`model.step_batch`, the same RK4) and derives all six quantities
  from it, with the step SciPy itself uses (1.49e-8). Single line-search points use the plain-Python RK4, which is faster
  for one trajectory.
* **Clearance** (`sim/collision.py`): one signed-distance lookup for every covering disc of every predicted state.
* **Planner** (`sim/planner.py`): the 10 stabilised motion primitives of a node are driven and collision-checked as one batch.
* **Processes**: BLAS pinned to one thread per process (`sim/__init__.py`), otherwise twenty solver processes exhaust the
  Windows commit limit. The 3-D view renders only on change while a bay is being chosen.

## The second attempt

A real driver who ends up crooked, or too close to a neighbour, stops, pulls forward and tries again. The first attempt of
a bay is exactly the one the library uses, so a bay that certifies at once is never changed. If it does not, a second job
(`solve_bay(..., deep=True)` in `sim/export.py`, `LADDER`) works down a ladder, and the first attempt that certifies wins:

1. **Pull forward and park again.** If the run ended safe (no jackknife, hitch limit kept, nothing touched) but not parked
   within tolerance, the rig plans a new route from where it stopped (up to two more legs) and parks again.
2. **Stop and re-plan.** During these attempts the run stops the moment the rig is within 0.15 m of anything, instead of
   reversing on into a collision, and continues from there.
3. **Another route.** Fresh attempts from the gate with other planner settings (a gentler search weight, and more
   clearance), each followed by the same pulling forward and re-parking.

Nothing is loosened: the whole chain of legs is held to the first attempt's checks (no jackknife, hitch angle never above
the limit, at least 0.10 m from every obstacle, parked within 0.8 m, 10 deg and 12 deg). The run report says when a bay
needed a second attempt. Attempts stop after 300 s of solving, and the reason for a bay that still fails says how many
were made.

## Solver API (`server.py`)

| Request | Answer |
|---|---|
| `GET /api/health` | `{"version", "workers", "vehicle": {"limits", "jack_gap"}}`: the range of every editable vehicle parameter |
| `POST /api/lots {layout, seed?, occupied?, vehicle?}` | `{"lot_id", "lot"}`: the lot in the library-file format, free bays `pending`, no plans yet. No `seed`: a random one. `occupied`: the exact list of bay ids holding a truck. `vehicle`: `{L1, L2, d, delta_max, psi_crit, psi_jack}`, metres and degrees, any key optional; the lot is sized for that rig. |
| `POST /api/layout {layout, seed, occupied?, vehicle?}` | `{"lot"}`: the same lot, unsolved, only to preview its geometry for a rig |
| `GET /api/lots/<id>` | `{"bays": [{id, status, reason?, s?}], "done", "elapsed"}`, status `pending` / `solving` / `deepening` (the second attempt) / `ok` / `infeasible` |
| `GET /api/lots/<id>/plans/<bay>` | the certified plan, same format as `lot.plans[bay]` in a library file |

The server is a single-user demo on `127.0.0.1`: a new lot abandons the previous one and stops its solver processes.

## Limitations

* **Solve time depends on the lot**: tight bays make the planner search longer. A bay that cannot be certified is shown
  grey with the reason. An edited fill that walls a bay in is reported, not special-cased.
* **Single user**: the server is a local demo server, not a multi-user service.
* **Kinematic model only**, with generous aisles.
