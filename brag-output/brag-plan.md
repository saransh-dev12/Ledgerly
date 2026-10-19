# Ledgerly launch video

## Direction

A 20-second, landscape launch film for Ledgerly. Keep the pace confident and tactile, with premium dark surfaces, soft lime accents, elegant movement, and enough pause to read each number. The actual landing page and dashboard carry the story; motion and sound make their transitions feel considered.

## Visual identity

- Canvas: `#050505`
- Main text: `#f2f2ed`
- Accent: `#bdf27b`
- Supporting surfaces: `#101110`, `#181916`
- Display and UI type: Manrope
- Money and numeric type: DM Mono
- Source references: Ledgerly's own black and lime palette, real landing page and dashboard, animated summary figures, and smooth table scroll.

## Storyboard (20 seconds, 1920 x 1080, 30 fps)

1. **A clearer direction — 0–4s.** Open on the real Ledgerly landing hero. Let “Give every rupee a direction.” arrive with a measured focus reveal. Hold long enough to read the actual headline and landing UI.
2. **The whole picture — 4–7s.** A directional wipe lands with a strong music cue as the real landing CTA opens the real dashboard. Show the live seeded totals: ₹84,250 balance, ₹25,000 income, ₹11,410 expenses, and ₹13,590 net savings.
3. **Record the moment — 7–11s.** Open the implemented Add transaction dialog. Type the fictitious demo expense “Coffee” for ₹240 in Food & dining, then save it through the real form. The updated totals become ₹84,010 balance, ₹11,650 expenses, and ₹13,350 net savings.
4. **Follow the flow — 11–17s.** Select Money out and follow the dashboard's smooth scroll into the filtered transaction list. Let the new Coffee entry sit clearly in the real table.
5. **Brand close — 17–20s.** Let the interface fall back under a quiet dark veil. Resolve on Ledgerly and the landing headline, then fade to black.

## Audio

Use the bundled `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` at a restrained level, with a short fade at both ends. The dashboard reveal aligns at 4.39s, the transaction save lands near 9.29s, and the brand close aligns at 17.47s. Use a soft impact for major reveals and one quiet click for the transaction action; avoid repeated keyboard ticks. No narration.

The cue preset is copied beside the music. The music README does not state the track's public-use license; verify its terms before publishing or redistributing the exported film.

## Grounding and safeguards

- Dashboard numbers come from the actual clean demo data and the implemented opening balance.
- Coffee / ₹240 is a clearly fictitious transaction used only in the isolated video preview.
- The video demonstrates the working landing route, balance and totals, transaction form, Money out filter, and scroll. It does not present placeholder Goals, Recurring, or Settings screens as completed features.
- The preview runs at `127.0.0.1:5173`, a distinct origin from the existing `localhost:5173` app session, so its demo localStorage stays isolated.
- Application source files are read-only for this task. The React UI is bundled into this video project under `composition/assets/ledgerly/`.
