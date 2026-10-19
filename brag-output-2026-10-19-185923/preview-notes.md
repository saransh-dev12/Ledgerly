# Preview and local render notes

## Preview

Open `preview.html` in Chrome and choose **Play 20s preview**. Sound starts muted; choose **Enable sound** first to hear the locally bundled music and cues. The preview uses the real Ledgerly bundle in `work/assets/ledgerly/` and enters its demo Coffee / ₹240 transaction only inside this isolated copy.

## Tools already installed

- Google Chrome 155 for preview playback.
- FFmpeg 9.0.2 for local encoding and audio mixing.
- Node 26.5 for local orchestration if needed.
- No npm install, HyperFrames package, or network download is needed for the prepared preview.

## Render status

This folder contains a browser preview, not a rendered preview video. I have not created `brag.mp4`. Local Vite server startup was denied by the managed sandbox (`listen EPERM`); Chrome's headless binary exited with code 134, and FFmpeg's AVFoundation screen capture reported no capture devices. The installed FFmpeg is present, but a browser-frame capture route is not available in this sandbox yet. I stopped at the reviewable composition rather than fabricate product footage or attempt an install.

If the preview is approved, the intended video deliverables are `brag.mp4` (20s, 1920×1080, 30fps with music), `brag.jpg` (poster baked into frame 0), and `share-copy.txt`. Final encoding remains gated on approval and a working local browser-frame capture route.
