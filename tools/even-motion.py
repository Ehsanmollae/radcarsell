"""Re-time a video so every output frame carries about the same amount of motion.

AI videos often rush through one part and hold still in another; scrubbed on scroll,
that feels like a jump followed by dead scroll. This picks frames at equal steps of
accumulated frame-to-frame difference (with a floor, so still parts keep a few
frames), optionally grades them, and writes a constant-rate video that
tools/extract-frames.sh can take with --desktop-count / --mobile-count = the frame
count printed at the end.

Usage:
  python3 tools/even-motion.py --video source/desktop.mp4 --out work/desktop-even.mp4 \
    --count 140 [--floor 0.35] [--vf "colorbalance=...,vignette=PI/5"]

Needs ffmpeg/ffprobe, numpy.
"""
import argparse, json, subprocess, sys
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("--video", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--count", type=int, required=True, help="frames wanted in the output")
ap.add_argument("--floor", type=float, default=0.35, help="minimum motion per frame, as a share of the mean")
ap.add_argument("--vf", default="", help="extra ffmpeg filter for the output frames (grade, vignette)")
args = ap.parse_args()

info = json.loads(subprocess.check_output([
    "ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames",
    "-show_entries", "stream=nb_read_frames,r_frame_rate", "-of", "json", args.video]))["streams"][0]
n = int(info["nb_read_frames"])
num, den = map(int, info["r_frame_rate"].split("/"))
fps = num / den

# Small greyscale copies are enough to measure motion.
W, H = 160, 90
raw = subprocess.check_output([
    "ffmpeg", "-v", "error", "-i", args.video, "-vf", f"scale={W}:{H},format=gray",
    "-f", "rawvideo", "-"])
frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
n = len(frames)
diff = np.abs(np.diff(frames, axis=0)).mean(axis=(1, 2))
diff = np.maximum(diff, diff.mean() * args.floor)
cum = np.concatenate([[0.0], np.cumsum(diff)])

targets = np.linspace(0, cum[-1], args.count)
picks = np.unique(np.clip(np.searchsorted(cum, targets), 0, n - 1))
picks[0], picks[-1] = 0, n - 1
picks = np.unique(picks)

select = "+".join(f"eq(n\\,{i})" for i in picks)
# setpts renumbers the picked frames so the output plays them one per tick, none duplicated.
vf = f"select='{select}',setpts=N/({fps:g}*TB)" + (f",{args.vf}" if args.vf else "")
subprocess.check_call([
    "ffmpeg", "-v", "error", "-y", "-i", args.video, "-vf", vf, "-an", "-c:v", "libx264", "-crf", "10", "-preset", "slow", "-pix_fmt", "yuv420p", "-r", f"{fps:g}", args.out])

share = np.diff(cum[picks]) / cum[-1]
print(f"{args.video}: {n} frames -> {len(picks)} frames ({args.out})", file=sys.stderr)
print(f"motion per output frame: min {share.min():.4f}, max {share.max():.4f}", file=sys.stderr)
print(len(picks))
