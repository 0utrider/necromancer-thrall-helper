/**
 * Per-necromancer effect colors (actor flag `effectColors`):
 *   { usePlayer, particles, bloodPool, graveyard, thickSkin, rangeRing,   (hex strings)
 *     zoneBorder: { linked: boolean, color } }
 * Without the flag, effects keep the module's original colors. "Effects use player color" means the
 * colour of the player who owns the necromancer, so a bomb the GM places still uses it. Zone borders
 * are separate: linked to the owner's colour by default, or a custom colour.
 */
const MODULE = "necromancer-thrall-helper";
const AER = "aoe-easy-resolve";
const ZONE_SPELLS = ["necrotic-bomb", "necrotic-blast", "desperate-revival", "dread-mosquito-storm", "living-graveyard",
    "zombie-horde", "flesh-tsunami", "bony-barrage", "bone-burst", "deathly-scream", "muscle-barrier", "blossoming-gore",
    "bloody-tendrils", "thick-skin"];

/** The effects a necromancer can recolor: key, label and the module's original color. */
export const EFFECT_COLOR_KEYS = [
    { key: "particles", label: "Spell particles", fallback: null },
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

/** Border colour of the zones (regions and templates) a necromancer creates. */
export function zoneBorderColor(actor) {
    const zone = settings(actor)?.zoneBorder;
    if (zone && zone.linked === false) return css(zone.color) ?? ownerColor(actor);
    return ownerColor(actor);
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

    // AoE Easy Resolve recolors the region right after creating it (with the particle color), so
    // keep the zone border on every update too. Runs on all clients: AER updates on the placer's.
    Hooks.on("preUpdateRegion", (doc, changes) => {
        if (!("color" in changes)) return;
        const origin = doc.flags?.pf2e?.origin;
        if (!ZONE_SPELLS.includes(origin?.slug) || !origin.actor) return;
        const actor = fromUuidSync(origin.actor);
        if (!actor) return;
        changes.color = zoneBorderColor(actor);
    });

    // Zones from the necromancer's spells use the zone border colour (the owner's player colour by
    // default) instead of whoever placed them, whatever AoE Easy Resolve's custom colour is.
    Hooks.on("preCreateRegion", (region, data) => {
        const origin = data.flags?.pf2e?.origin;
        if (!ZONE_SPELLS.includes(origin?.slug) || !origin.actor) return;
        const actor = fromUuidSync(origin.actor);
        if (!actor) return;
        region.updateSource({ color: zoneBorderColor(actor) });
    });
}
