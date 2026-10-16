<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Engine audio is procedural Web Audio (src/lib/audio.ts) driven by a singleton physics sim (src/lib/sim.ts); UI reads it via useSyncExternalStore — keeps 60fps physics out of React state.
- Game state (settings, favorites, configs) persists in localStorage via src/lib/store.tsx — no backend needed.
- The cockpit gear selector lives in a dedicated Shifter component and delegates every selection to sim.shift; this preserves clutch checks and keeps presentation separate from physics.
