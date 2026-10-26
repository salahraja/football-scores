"""Best-of-3 wall clock of a whole process: bench.py input.json cmd args..."""
import subprocess, sys, time
inp, cmd = sys.argv[1], sys.argv[2:]
best = 1e9
for _ in range(3):
    with open(inp, "rb") as f:
        t = time.perf_counter()
        subprocess.run(cmd, stdin=f, stdout=subprocess.DEVNULL, check=True)
        best = min(best, time.perf_counter() - t)
print("%.3fs" % best)
