# Composition brief — Ledgerly

Create a premium fintech launch film from the approved storyboard in `../brag-plan.md`.

## Creative boundary

- Duration: exactly 20 seconds; 1920 x 1080; 30 fps.
- Tone: polished, tactile, confident, calm. Use cinematic focus, directional wipes, concise interface details, and smooth scroll. Keep the black and lime Ledgerly identity; no blue or brown tint, no stock finance graphics, no flashy glitch effects.
- Show the actual application UI bundled at `composition/assets/ledgerly/index.html`. The app source is imported from the workspace only to build that isolated bundle; do not edit app files.
- Use only factual copy and numbers in `brag-plan.md`. Demo transaction Coffee / ₹240 is synthetic and is entered through the actual Add transaction form.

## Visual identity

- Background `#050505`; text `#f2f2ed`; accent `#bdf27b`; surfaces `#101110` and `#181916`.
- Manrope for display and interface text; DM Mono for money and numeric callouts. These are the product's existing fonts.
- Respect the actual Ledgerly interface. Do not redraw its dashboard as a generic mockup.

## Audio

- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`, copied from the installed brag skill bundle.
- Use the bundled cue metadata at `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`. Major cue locks: 4.39s dashboard reveal, 9.29s transaction save, 17.47s close. Music starts at source time 0; fade down at the outro.
- Sound effects: use `assets/sfx/impactSoft_medium_001.ogg` at the dashboard reveal and brand close; use `assets/sfx/click_003.ogg` for the transaction save. Selection guidance is in `assets/sfx/sfx-analysis.md`.
- No narration or voice track.
- Audio-reactive extraction is unavailable in this workspace: the installed HyperFrames creative/audio-reactive helper is absent, and the HyperFrames CLI cannot currently be fetched because `registry.npmjs.org` is not resolvable. Keep motion cue-locked rather than adding a fabricated waveform or pulsing equalizer.

## Scenes

1. **0–4s — Landing.** Real Ledgerly landing hero and headline “Give every rupee a direction.” Use a focus reveal and subtle light response.
2. **4–7s — Dashboard.** Trigger the real Open your dashboard CTA. Let the actual balance and summary cards settle on screen.
3. **7–11s — Transaction.** Open the real Add transaction modal, enter Coffee and ₹240, and save the synthetic Food & dining expense. The numbers update from the real state.
4. **11–17s — Money out.** Activate the working Money out filter and follow its smooth scroll to the updated transaction table. Keep Coffee readable.
5. **17–20s — Outro.** Softly veil the product UI, resolve on Ledgerly / “Give every rupee a direction.” and fade to black.

## Implementation and validation status

The full `brag` workflow was selected. The bundled music, cue file, and SFX are local. Node, Chrome, and FFmpeg exist, but `npx hyperframes` is not installed or cached; an attempted npm fetch failed with `ENOTFOUND registry.npmjs.org`. The composition is being prepared as a previewable HTML project that follows HyperFrames' `data-*` timing and paused timeline conventions when GSAP is available. Do not claim HyperFrames lint, inspect, or render validation until its CLI can run.

The output project's application bundle is generated with the existing Vite installation. Final MP4 rendering remains gated on a reviewed preview and a working local video-render workflow.
