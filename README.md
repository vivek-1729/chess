# Imperium

Chess training against Roman emperors. Bots range from Elagabalus (400) to Augustus (2300).
While you play, the app quietly grades each move and watches for tactics:

- **Short tactics** (forks, pins, skewers, free pieces, mate in 1–2) stay silent. If you miss one,
  a small "You missed…" note offers a **Rewind** to the frozen position.
- **Long combinations** (mate in 3+, multi-move wins) are flagged before you move, with **Try it / Skip**.
- In a frozen puzzle, wrong moves snap back; the bot answers with its best defense.

## Run

```bash
npm install     # also copies the Stockfish engine into public/engine
npm run dev
npm test        # tactic detector against the real engine
```

## Layout

- `src/core/` – platform-free chess logic (engine wrapper, bots, move rating, tactic detection, openings).
  Reusable as-is in the Expo app.
- `src/storage/` – local persistence (localStorage now, AsyncStorage on mobile).
- `src/game/store.ts` – game controller (Zustand).
- `src/ui/` – React web UI.
- `scripts/build-openings.mjs` – rebuilds `openings.json` from the Lichess chess-openings TSVs in `data/`.
