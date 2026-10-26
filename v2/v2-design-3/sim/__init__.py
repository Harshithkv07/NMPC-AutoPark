"""Planner, NMPC and driver advisor for tractor-trailer parking guidance.

The simulation works on tiny arrays and runs many processes in parallel (library export, live server),
so the BLAS/OpenMP thread pools are pinned to one thread. Otherwise every worker process reserves
buffers for every core, and twenty workers exhaust the Windows commit limit before doing any work."""
import os

for _var in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_var, "1")
