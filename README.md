# Trailer Parking Guidance: NMPC + Hybrid A*

Group B9 - Harshith KV, G Venugopalan, Rithvik Arulprakash, Vipin Sudhakar.

Pick a yard layout, click a free bay, and the system guides a tractor-trailer into it (gear, speed, steering-wheel
turns, distance) while an NMPC controller holds a hard hitch-angle limit so the rig cannot jackknife.

| Folder | What it is | Run |
|---|---|---|
| [`v2/v2-design-3/`](v2/v2-design-3/) | **In progress.** Design 2's engine and data, unchanged; the header, footer, navigation and overall interface are being redesigned. | `v2/v2-design-3/run_demo.bat` (port 4179) |
| [`v2/v2-design-2/`](v2/v2-design-2/) | **Primary version.** A layout editor (draw any yard: bays anywhere, obstacles, start pose) and a live NMPC you can watch and disturb. | `v2/v2-design-2/run_demo.bat` (port 4177) |
| `doc/` | The final presentation deck, plus the first-review deck and formulation document (the last two are kept out of git). | |

Open the folder's README for how to build and run it. Earlier passes (version 1, and version 2 design 1's
precomputed-library live solver) are kept only in git history, at commit `50e6e61` and earlier. The pre-reset
project (CasADi backend and the old frontend) is kept in the git history at commit `968c2d1`.
