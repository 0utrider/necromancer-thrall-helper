**Tactical Action Hub**
* Native PF2e Strikes: Dynamically forges and rolls native system strikes for your thralls, scaling damage dice automatically based on your Necromancer level (1d6 scaling progression).
* MAP Integration: Built-in Multiple Attack Penalty pips (0, -5, -10) that dynamically affect your thrall strike rolls.
* Thrall Charge & Detonation: Command your minions to charge or detonate upon impact, automatically calculating status bonuses and handling kamikaze cleanups.
* Tactical Proximity Scanner: Scans a 10-foot radius around each active thrall to display nearby enemies and friendly units at a glance.
* Integrates cleanly with my AOE-Easy-Resolve module for Necrotic bomb, Life Tap, Blood Infusion, and more to come. 
* Thralls display how many friendlies and enemies are within 10 feet in order to give the best indication of when to Necrotic Bomb. 
**Custom Presets & Family Tree**
* Custom Identities: Configure custom unique thrall identities via actor flags.
* Randomized Adjective Generator: Automatically prefixes summons with modifiers like "Angry", "Putrid", or "Moth-Eaten" from a robust adjective pool.
**Automated Spell Integration**
* Necrotic Bomb: Automatically handles emanation templates, fortitude saves, and custom void versus vitality type-swapping toggles directly embedded inside chat cards.
* Blood Infusion & Life Tap: Full integration with area-of-effect resolution tools, stripping bleed immunities, applying persistent damage, managing drained conditions, and routing siphon healing to eligible allies.
**Secure Multiplayer & Socketlib Integration**
* Player Summon Requests: Players can initiate summoning rituals and place ghost previews on the canvas.
* GM Approval Workflow: Leverages socketlib to securely route spawn requests to the GM.
* Tactical GM Pings: When a player requests a spawn, the GM screen automatically pans to the target location, pings the map, and flashes a glowing tactical highlight box while awaiting confirmation.

  **Video of features as of 1.0.2 with more coming all the time:** https://www.youtube.com/watch?v=0kgbYnEZim8

**Token art**
* Wildcard art: any image path can be a pattern such as `path/to/art/thrall-*.webp`; one matching file is picked at random each time a thrall is summoned.
* Animated art: token art can be a `.webm`. Dynamic token rings don't support animation, so the ring is skipped for animated art unless you also set a Ring Subject (a transparent cutout image).
* Portraits and ring subjects: each look can have a still-image Portrait (shown in the Command Deck and chat cards) and a Ring Subject (the cutout the dynamic ring draws). If the art and these are all wildcards, files that share the same `*` text are paired, e.g. `thrall-03.webm` with `portrait-03.webp` and `subject-03.webp`.
* Missing token packs: if a thrall or summon type points at art from a token pack that isn't installed, a bundled fallback image is used instead. The plain Thrall's look is chosen in this order: your own default art (Default Summon Config), the bundled art if "Use bundled default instead of compendium art" is checked, the compendium art if its token pack is active, and the bundled art otherwise. "Use bundled art" in Default Summon Config fills the fields in for you to tweak.

**Credits**
* The fallback image `assets/thrall.webp` (and the portrait, ring subject and token cut from it by `tools/make_thrall_subject.py`) comes from The Battle for Wesnoth (artist doofus-01, GPL v2+). Details are in [`assets/CREDITS.md`](assets/CREDITS.md).
