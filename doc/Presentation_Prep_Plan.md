# Final Presentation: Prep Plan (Group B9)

Deck: `doc/Robotics_Final_Group_B9.pptx` (23 slides). Every slide has a speaker script in its notes (PowerPoint: View > Notes).
Rebuild after edits: `cd doc/final_deck_build`, then `python figs.py`, `python figs_planner.py` and `node build_deck.js`.

Study guides for the presenters are in `doc/study_guides/`: `Person_A_Modelling_Guide.pdf`, `Person_B_Kinematics_Guide.pdf`, `Person_C_HybridAstar_NMPC_Guide.pdf` (each also as a single offline `.html`). Rebuild with `python guide_figs.py` and `node build_guides.js` there.

## Who Says What, and for How Long

| Part | Slides | Presenter | Time | Must land |
|---|---|---|---|---|
| Intro (Part 0) | 1–4 | anyone (suggest Part 4's presenter) | 2 min | Cars self-park today; a trailer is harder because reversing is unstable |
| Part 1 · Modelling | 5–8 | Person A | 4 min | Two rigid bodies + passive joint; no-slip = nonholonomic; 4 states, 2 inputs |
| Part 2 · Vehicle Kinematics | 9–13 | Person B | 5 min | Bicycle model, trailer no-slip, the ψ̇ equation, λ = −v/L₂ |
| Part 3 · Hybrid A* and NMPC | 14–17 | Person C | 5 min | General idea of each, then exactly how we use it; planner global, NMPC local |
| Part 4 · Results, Limitations, Future | 18–21 | Person D | 3 min | 110/110, 0 violations, 72/72 unaided jackknife; honest limits |
| Close | 22–23 | Person D | 30 s | Questions; offer the live demo |

Total about 19 minutes. If you are told to cut to 12: drop slide 4 (roadmap), slide 12 (say the ψ̇ equation on slide 11 instead), slide 19's plot discussion, and slide 21.

Hand-over line, same pattern every time: *"That is the model. Now [name] will show how the truck actually moves."*

## Tonight

1. **Now, 30 min, all four:** open the deck, read your own slides and their notes. Agree who is Person A–D (names stay off the slides).
2. **Next 90 min, alone:** rehearse your part out loud twice with a timer. Say it in your own words; do not read the notes.
   - **Person B:** derive ψ̇ on paper without looking, start to finish. This is the most likely whiteboard question.
   - **Person C:** be able to explain Hybrid A* without the word "lattice" and NMPC without the word "optimiser" (chess-player analogy in the notes).
3. **45 min, together:** one full run-through with hand-overs and a timer. The others play professor and interrupt once each.
4. **30 min, together:** Q&A drill below. Each person answers the questions for the *other* parts too: the professor may ask anyone.
5. **Before sleeping:** copy the deck to a USB stick and to email. Also export a PDF copy (File > Export > PDF) in case the lab PC's PowerPoint misbehaves.

## Tomorrow, Before Walking In

- Open the deck on the presenting machine. The fonts are Segoe UI (on every Windows PC) and the maths is pictures, so nothing should reflow; check slide 12 and 16 anyway.
- Start the demo and leave it running: pick a layout, click a green bay, check Guided, Unaided and Live with the push button. If it will not run, show slides 17 and 19 instead; do not debug in front of the professor.

## Questions to Expect, With Short Answers

### Part 1 · Modelling
- **Why is it nonholonomic?** The no-slip conditions restrict velocities (no sideways velocity at each axle) and cannot be integrated into position constraints. The truck can reach any pose, just not move sideways directly.
- **Degrees of freedom?** Configuration has 4 coordinates (x₁, y₁, θ₀, θ₁); 2 velocity constraints leave 2 free motions, matched by the 2 inputs v and δ.
- **Configuration space?** ℝ² × S¹ × S¹ (position plus two angles).
- **Why the rear axle as the reference point?** Its velocity is purely along the heading, so the equations are the simplest.
- **Why ψ in the state instead of θ₁?** Same information (ψ = θ₀ − θ₁), but ψ is what we must limit: a jackknife is ψ getting too big.
- **How can 2 inputs control 4 states? (controllability)** Alternating drive and steer produces motion in new directions (Lie brackets; Chow's theorem). Parallel parking is the everyday proof.

### Part 2 · Vehicle Kinematics
- **Derive ψ̇.** ψ̇ = θ̇₀ − θ̇₁; θ̇₀ = v tan δ / L₁ (bicycle, ICR); θ̇₁ = (v sin ψ + d θ̇₀ cos ψ) / L₂ (trailer-axle no-slip, sideways hitch velocity over L₂). Substitute.
- **Why a kinematic, not dynamic, model?** Yard speeds ≤ 2 m/s: no tyre slip to speak of, errors of a few cm, inside our 0.25 m clearance margin.
- **Why is reversing unstable?** Linearised ψ̇ ≈ −(v/L₂)ψ. Eigenvalue −v/L₂ is positive when v < 0, so ψ grows by e every L₂ = 8 m.
- **Why the 60° limit?** Holding a hitch angle needs steering; at 60° the hold steering is about 24°, leaving ~11° of our 35° lock to recover. Past that the rig cannot be pulled back. The physical jackknife (cab touches trailer) is 75°.
- **What is non-minimum phase here?** In reverse, to swing the trailer one way the tractor first has to turn the other way. That is why a reactive controller (PID) steers the wrong way and why we track the trailer axle.
- **Why RK4?** Fourth-order accurate at the 0.05–0.4 s steps we use, and still cheap enough to call thousands of times per NMPC solve.

### Part 3 · Hybrid A* and NMPC
- **Why Hybrid A* and not plain A* or RRT?** Plain A* gives undrivable corners. Hybrid A* expands with real vehicle motion so every path is drivable; it is deterministic, unlike RRT.
- **Is the path optimal?** Not strictly: we inflate the heuristic (weighted A*, factor 3) to plan in seconds, and grid snapping prunes some poses. Drivable and collision-free is the guarantee; shortest is not.
- **Why is the heuristic a Dubins path of the trailer axle?** The trailer axle is a flat output: its path curvature fixes ψ (ψ = arctan(L₂κ)), so it moves like a car whose steering is ψ.
- **Why NMPC instead of PID or LQR?** Hard constraints (ψ ≤ 60°, steering lock, clearance), the full nonlinear model, and look-ahead for the non-minimum-phase reverse. PID only reacts; LQR has no hard constraints.
- **How did you pick the 9.6 s horizon?** The reverse instability grows by e every 8 m; at yard speed that is several seconds. The horizon must see the jackknife coming before it is too late to correct.
- **What if the optimisation is infeasible?** Fallback: keep the hitch limit and drop clearance; failing that, the stable hitch regulator from the planner takes over.
- **Solver and speed?** SciPy SLSQP, single shooting, 8 decision variables (steering corrections), warm-started; 19–42 ms per solve against a 250 ms control period.
- **Stability proof?** No formal terminal-set proof. We certify empirically: every bay is driven in closed loop and checked before it is offered to the driver. Be honest if asked.

### Part 4 · Results, Limitations, Future
- **How do you know it works?** 110 bays across 4 layouts × 6 random fills; each must park within 0.8 m and 10°, never exceed 60° hitch, never come within 0.10 m of an obstacle.
- **Is the unaided baseline fair?** Same path, same vehicle, same start; only the hitch-aware look-ahead is removed.
- **What would a real truck need?** Pose and hitch-angle sensing (GNSS/RTK, camera or LiDAR, a hitch-angle sensor), actuator delay in the model, and a faster solver on embedded hardware.
- **How is this different from the base papers?** [1] proposed Hybrid A* + NMPC but built only A* (and saw jackknifing); [2] keeps a reversing trailer stable but only along a given path, with no planning or obstacles. We built the full pipeline and added driver instructions.

## Two Things to Check Before Tomorrow

1. **Results numbers.** The deck uses 110/110 certified, 0 violations, peak 50.1°, 72/72 unaided jackknifes, 19–42 ms (from the last deck). The IEEE report draft says "60 reverse bays" and "about 12 ms per solve" in places. If the professor has read the report, know which is right for the version you demo, and say it confidently.
2. **Presenter mapping.** Decide who is Person A–D now, so each of you knows which slides and which questions are yours.
