/**
 * Per-necromancer effect colors (actor flag `effectColors`):
 *   { usePlayer: boolean, particles, bloodPool, graveyard, thickSkin, rangeRing }  (hex strings)
 * Without the flag, nothing changes from the module's original colors. "Use player's color" means
 * the colour of the player who owns the necromancer, so a bomb the GM places still uses it.
 */
const MODULE = "necromancer-thrall-helper";
const AER = "aoe-easy-resolve";

/** The effects a necromancer can recolor: key, label and the module's original color. */
export const EFFECT_COLOR_KEYS = [
    { key: "particles", label: "Spell particles (Necrotic Bomb/Blast, Desperate Revival, Dread Mosquito and other AoE Easy Resolve spells)", fallback: null },
    { key: "bloodPool", label: "Blood Pool", fallback: "#990000" },
    { key: "graveyard", label: "Living Graveyard area", fallback: null },
    { key: "thickSkin", label: "Thick Skin emanation", fallback: "#84cc16" },
    { key: "rangeRing", label: "Range rings", fallback: "#22c55e" }
];

function css(color) {
    if (!color) return null;
    const v = typeof color === "string" ? color : (color.css ?? color.toString?.());
    return typeof v === "string" && v.startsWith("#") ? v : null;
}

/** The colour of the player who owns the actor (a non-GM owner if any), else the acting user's. */
export function ownerColor(actor) {
    const owners = Object.entries(actor?.ownership ?? {})
        .filter(([id, level]) => id !== "default" && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
        .map(([id]) => game.users.get(id))
        .filter(Boolean);
    const player = owners.find(u => !u.isGM) ?? owners[0];
    return css(player?.color) ?? css(game.user?.color) ?? "#4b5563";
}

function settings(actor) {
    return actor?.getFlag?.(MODULE, "effectColors") ?? null;
}

/** The colour (CSS hex) for an effect. `fallback` is what the effect used before this feature. */
export function effectColor(actor, key, fallback) {
    const cfg = settings(actor);
    if (!cfg) return fallback;
    if (cfg.usePlayer) return ownerColor(actor);
    return css(cfg[key]) ?? fallback;
}

/** As effectColor, but as the number PIXI wants. */
export function effectColorNum(actor, key, fallback) {
    return parseInt(effectColor(actor, key, fallback).replace("#", ""), 16);
}

/**
 * Make an AoE Easy Resolve spell item draw its particles in the necromancer's chosen colour.
 * "Use player's color" writes the owner's colour explicitly (rather than deferring to AER), so a
 * GM placing the spell still gets the owner's colour.
 */
export async function syncParticleColor(item) {
    const actor = item?.parent;
    if (item?.type !== "spell" || !actor || !settings(actor)) return;
    const flags = item.flags?.[AER];
    if (!flags) return;
    const color = effectColor(actor, "particles", null) ?? ownerColor(actor);
    if (flags.useCustomColor === true && flags.customColor === color) return;
    await item.update({ [`flags.${AER}.useCustomColor`]: true, [`flags.${AER}.customColor`]: color });
}

/** Re-apply the particle colour to every AoE Easy Resolve spell on an actor (after saving the dialog). */
export async function syncAllParticleColors(actor) {
    for (const item of actor.items) if (item.type === "spell" && item.flags?.[AER]) await syncParticleColor(item);
}

export function setupEffectColorHooks() {
    // New and changed AER spell items pick up the colour, once, from the client that made the change.
    const onItem = (item, _change, _opts, userId) => {
        if (userId !== undefined && userId !== game.user.id) return;
        if (item.flags?.[AER]?.useOverride) syncParticleColor(item);
    };
    Hooks.on("createItem", (item, opts, userId) => onItem(item, null, opts, userId));
    Hooks.on("updateItem", onItem);

    // AER's custom colour may also tint the zone; keep the zone in the owner's player colour.
    Hooks.on("preCreateRegion", (region, data) => {
        const origin = data.flags?.pf2e?.origin;
        if (!["necrotic-bomb", "necrotic-blast"].includes(origin?.slug) || !origin.actor) return;
        const actor = fromUuidSync(origin.actor);
        if (!actor || !settings(actor)) return;
        region.updateSource({ color: ownerColor(actor) });
    });
}
