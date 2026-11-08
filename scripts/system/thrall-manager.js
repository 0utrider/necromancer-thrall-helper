
export function setupHooks() {
    console.log("Necromancer Thrall Helper | Thrall management hooks standing by.");


    const refreshDeck = (tokenDocument) => {
        const isThrall = tokenDocument.getFlag("necromancer-thrall-helper", "masterId");
        if (!isThrall) return;

        for (const app of foundry.applications.instances.values()) {
            if (app.id === "thrall-command-deck") {
                app.render(false);
            }
        }
    };

    Hooks.on("createToken", refreshDeck);
    Hooks.on("deleteToken", refreshDeck);

    const resetMap = (combat) => {
        for (const deck of foundry.applications.instances.values()) {
            if (deck.id === "thrall-command-deck" && deck.necroId) {
                if (combat.combatant?.actorId === deck.necroId) {
                    deck.currentMap = 0;
                    deck.render(false);
                }
            }
        }
    };

    Hooks.on("combatTurn", resetMap);
    Hooks.on("combatRound", resetMap);


    const syncHover = (token, hovered) => {
        const isThrall = token.document.getFlag("necromancer-thrall-helper", "masterId");
        if (!isThrall) return;

        for (const app of foundry.applications.instances.values()) {
            if (app.id === "thrall-command-deck" && app.element) {
                const row = app.element.querySelector(`.thrall-row[data-token-id="${token.id}"]`);
                if (row) {
                    if (hovered) {
                        row.classList.add("highlight");
                    } else {
                        row.classList.remove("highlight");
                    }
                }
            }
        }
    };

    Hooks.on("hoverToken", syncHover);
}

const FALLBACK_IMG = "systems/pf2e/icons/default-icons/npc.svg";
const MEDIA_EXT = /\.(webp|png|jpe?g|gif|avif|svg|webm|mp4|m4v)$/i;
const lastWildcardPick = new Map();

/** True if the path is a Foundry-style wildcard pattern, e.g. `art/thrall-*.webp`. */
export function isWildcardPath(path) {
    return typeof path === "string" && path.includes("*");
}
/**
 * List files matching a wildcard pattern (same browse call Foundry uses for a
 * prototype token's "Randomize Wildcard Images").
 */
export async function listWildcardMatches(pattern) {
    if (!isWildcardPath(pattern)) return [];
    const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
    try {
        const result = await FP.browse("data", pattern, { wildcard: true });
        return (result?.files ?? []).filter(f => MEDIA_EXT.test(f));
    } catch (err) {
        console.warn(`Necromancer Thrall Helper | Wildcard lookup failed for "${pattern}":`, err);
        return [];
    }
}
/**
 * Resolve an image path to a concrete file. Plain paths pass through unchanged;
 * wildcard paths pick a random match, avoiding an immediate repeat of the last pick.
 */
export async function resolveImagePath(path) {
    if (!isWildcardPath(path)) return path;
    const matches = await listWildcardMatches(path);
    if (matches.length === 0) {
        ui.notifications.warn(`No images match "${path}". Using the default thrall icon.`);
        return FALLBACK_IMG;
    }
    const last = lastWildcardPick.get(path);
    const pool = matches.length > 1 ? matches.filter(m => m !== last) : matches;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    lastWildcardPick.set(path, pick);
    return pick;
}

const VIDEO_EXT = /\.(webm|mp4|m4v|ogv)$/i;

/** True for video paths (including wildcard patterns such as `art/thrall-*.webm`). */
export function isVideoPath(path) {
    if (typeof path !== "string") return false;
    return foundry.helpers?.media?.VideoHelper?.hasVideoExtension?.(path) ?? VIDEO_EXT.test(path);
}

function wildcardCapture(pattern, file) {
    try {
        const re = new RegExp("^" + pattern.split("*").map(p => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("(.*)") + "$");
        return decodeURIComponent(file).match(re)?.[1] ?? null;
    } catch (err) {
        return null;
    }
}

/**
 * Whether a configured art path can use the dynamic token ring: "video" (never), "mixed" (a
 * wildcard whose extension isn't fixed, so it depends on the file picked) or "image".
 */
export function artKind(path) {
    if (isVideoPath(path)) return "video";
    if (isWildcardPath(path) && !/\.(webp|png|jpe?g|gif|avif|svg)$/i.test(path)) return "mixed";
    return "image";
}

/**
 * Resolve token art plus its optional portrait and ring subject (cutout) images. Paired files
 * share the art's `*` text: when the art is a wildcard and the same text exists in another
 * pattern (thrall-03.webm -> portrait-03.webp, subject-03.webp), the matching file is used;
 * otherwise a file is picked at random (and later patterns then pair with that pick).
 */
export async function resolveImageSet(art, extras = {}) {
    const resolvedArt = await resolveImagePath(art);
    const out = { art: resolvedArt, portrait: null, ringSubject: null };
    let pairing = true;
    try { pairing = game.settings.get("necromancer-thrall-helper", "pairWildcardFiles"); } catch (err) { /* not registered */ }
    let key = pairing && isWildcardPath(art) ? wildcardCapture(decodeURIComponent(art), resolvedArt) : null;
    for (const name of ["portrait", "ringSubject"]) {
        const path = extras[name];
        if (!path) continue;
        if (!isWildcardPath(path)) {
            out[name] = path;
            continue;
        }
        if (key !== null) {
            const paired = (await listWildcardMatches(path)).find(f => wildcardCapture(path, f) === key);
            if (paired) {
                out[name] = paired;
                continue;
            }
        }
        const picked = await resolveImagePath(path);
        out[name] = picked === FALLBACK_IMG ? null : picked;
        if (pairing && key === null && out[name]) key = wildcardCapture(path, out[name]);
    }
    return out;
}

/**
 * Point a token's ring at the right art. The dynamic ring draws over a transparent cutout, so
 * an explicit ring subject wins. Without one the (still) token art is used, and video art can't
 * be a subject, so the ring is skipped. Returns true when the ring was blocked for that reason,
 * so a caller that applies a saved ring preference afterwards can re-assert it.
 * `artRef` is the value the subject texture holds when it just mirrors the token art.
 */
export function applyRingArt(data, set, artRef) {
    if (!data.ring?.subject) return false;
    if (set.ringSubject) {
        data.ring.subject.texture = set.ringSubject;
        return false;
    }
    if (isVideoPath(set.art)) {
        // Subject textures are image-only; null falls back to texture.src. Clear it explicitly,
        // because the base Thrall prototype ships with its own subject image.
        data.ring.enabled = false;
        data.ring.subject.texture = null;
        return true;
    }
    if (data.ring.subject.texture === artRef) data.ring.subject.texture = set.art;
    return false;
}

/**
 * An image that an <img> tag can show for a token: its stored portrait if it has one, else
 * its art when that is an image, else the actor image (animated art can't go in an <img>).
 */
export function tokenPortrait(tokenDoc) {
    if (!tokenDoc) return FALLBACK_IMG;
    const portrait = tokenDoc.flags?.["necromancer-thrall-helper"]?.portrait;
    if (portrait) return portrait;
    const src = tokenDoc.texture?.src;
    if (src && !isVideoPath(src)) return src;
    const actorImg = tokenDoc.actor?.img;
    return actorImg && !isVideoPath(actorImg) ? actorImg : FALLBACK_IMG;
}

/**
 * Bundled open-license art (see assets/CREDITS.md), cut from assets/thrall.webp by
 * tools/make_thrall_subject.py: a plain token for use without the ring, a ring subject whose
 * lower half is clipped to sit inside the rim, and a portrait.
 * subjectScale is the ring.subject.scale that centres the figure in the rim.
 */
const ASSET_DIR = "modules/necromancer-thrall-helper/assets/";
export const BUNDLED_THRALL = {
    token: ASSET_DIR + "thrall-token.webp",
    subject: ASSET_DIR + "thrall-subject.webp",
    portrait: ASSET_DIR + "thrall-portrait.webp",
    subjectScale: 1
};
export const FALLBACK_THRALL_ART = BUNDLED_THRALL.token;

/**
 * Write the bundled look into a token payload: art, ring subject and its scale, and (unless
 * told otherwise) the portrait flag. The image scale is 1 because the ring sizes the subject.
 * The ring is switched on only with forceRing; otherwise the payload's own setting stands.
 */
export function applyBundledLook(payload, { forceRing = false, portrait = true } = {}) {
    payload.texture = payload.texture || {};
    payload.texture.src = BUNDLED_THRALL.token;
    payload.texture.scaleX = 1;
    payload.texture.scaleY = 1;
    payload.ring = payload.ring || {};
    payload.ring.subject = payload.ring.subject || {};
    payload.ring.subject.texture = BUNDLED_THRALL.subject;
    payload.ring.subject.scale = BUNDLED_THRALL.subjectScale;
    if (forceRing) payload.ring.enabled = true;
    if (portrait) foundry.utils.setProperty(payload, "flags.necromancer-thrall-helper.portrait", BUNDLED_THRALL.portrait);
    return payload;
}

/** The module id a path lives in ("modules/<id>/..."), or null for core/system/world paths. */
function artModuleId(path) {
    const m = /^modules\/([^/]+)\//.exec(typeof path === "string" ? path : "");
    return m ? decodeURIComponent(m[1]) : null;
}

/** True if the path lives in another module that isn't active (e.g. a purchased token pack). */
export function isArtMissing(path) {
    const id = artModuleId(path);
    return !!id && !game.modules.get(id)?.active;
}

/**
 * Swap in the bundled thrall art for any token art from modules that aren't installed. Run on
 * every spawn payload, so each thrall/summon type falls back individually.
 */
export function applyArtFallback(payload) {
    const src = payload.texture?.src;
    const subject = payload.ring?.subject?.texture;
    if (isArtMissing(src)) {
        applyBundledLook(payload, { portrait: false });
    } else if (isArtMissing(subject)) {
        payload.ring.subject.texture = null; // falls back to texture.src
        if (isVideoPath(src)) payload.ring.enabled = false;
    }
    const flags = payload.flags?.["necromancer-thrall-helper"];
    if (isArtMissing(flags?.portrait)) flags.portrait = BUNDLED_THRALL.portrait;
    return payload;
}

/** Repair a freshly imported world actor whose images point at modules that aren't installed. */
export async function repairActorArt(actor) {
    if (!actor) return;
    const updates = {};
    if (isArtMissing(actor.img)) updates.img = BUNDLED_THRALL.portrait;
    if (isArtMissing(actor.prototypeToken?.texture?.src)) updates["prototypeToken.texture.src"] = BUNDLED_THRALL.token;
    if (isArtMissing(actor.prototypeToken?.ring?.subject?.texture)) updates["prototypeToken.ring.subject.texture"] = BUNDLED_THRALL.subject;
    if (Object.keys(updates).length) await actor.update(updates);
}

const STANDARD_ADJECTIVES = [
    "Angry", "Soggy", "Vengeful", "Festering", "Hollow", 
    "Shivering", "Wrinkled", "Spiteful", "Damp", "Putrid", 
    "Screaming", "Moth-Eaten", "Bitter", "Rancid", "Haunted"
];

export function getThrallPresets(actor = null) {
    if (actor) {
        const customFamily = actor.getFlag("necromancer-thrall-helper", "familyTree");
        if (customFamily && Array.isArray(customFamily) && customFamily.length > 0) {
            return customFamily;
        }
    }

    return [
        { id: "uncle-arthur", name: "Uncle Arthur", img: "icons/magic/death/undead-ghost-scream-teal.webp", adjectives: STANDARD_ADJECTIVES },
        { id: "aunt-martha", name: "Aunt Martha", img: "icons/magic/death/undead-skeleton-mage-red.webp", adjectives: STANDARD_ADJECTIVES }
    ];
}

/** The portfolio entry the necromancer marked as their default thrall, if it still exists. */
export function getDefaultPresetId(actor) {
    const id = actor?.getFlag("necromancer-thrall-helper", "defaultFamilyEntryId");
    return id && getThrallPresets(actor).some(p => p.id === id) ? id : null;
}

/** Label for the "(Default Thrall)" option in summon dialogs, naming the default entry if one is set. */
export function defaultThrallLabel(actor) {
    const id = getDefaultPresetId(actor);
    const name = id ? getThrallPresets(actor).find(p => p.id === id)?.name : null;
    const escaped = name ? String(name).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])) : "";
    return name ? `(Default Thrall: ${escaped})` : "(Default Thrall)";
}

export async function prepareThrallPayload(necroActor, presetId = "default") {

    let protoActor = game.actors.find(a => a.name === "Thrall" && a.getFlag("necromancer-thrall-helper", "isBaseThrall"));

    if (!protoActor) {
        const pack = game.packs.get("necromancer-thrall-helper.necro-thralls");
        if (!pack) {
            ui.notifications.error("Could not find the Necromancer Thralls compendium pack.");
            return null;
        }

        const index = await pack.getIndex();
        const thrallEntry = index.find(a => a.name === "Thrall");
        if (!thrallEntry) {
            ui.notifications.error("Could not find the 'Thrall' actor in the compendium.");
            return null;
        }

    
        let folder = game.folders.find(f => f.name === "Necromancer Thralls" && f.type === "Actor");
        if (!folder) {
            folder = await Folder.create({
                name: "Necromancer Thralls",
                type: "Actor",
                color: "#4b5563" 
            });
        }

        protoActor = await game.actors.importFromCompendium(pack, thrallEntry._id, {
            "flags.necromancer-thrall-helper.isBaseThrall": true,
            folder: folder.id
        });
        await repairActorArt(protoActor);
        console.log("Necromancer Thrall Helper | Base Thrall safely imported into its own folder.");
    }

    const necroLevel = necroActor.level || 1;
    const damageDice = Math.max(1, Math.floor((necroLevel - 1) / 4) + 1);
    
    const tokenDocument = await protoActor.getTokenDocument();
    const tokenData = tokenDocument.toObject();
    // The compendium Thrall's own art (from an optional token pack), before any preset overrides it.
    const compendiumLook = { src: tokenData.texture?.src, subject: tokenData.ring?.subject?.texture };

    const customPresets = getThrallPresets(necroActor);
    const defaultPreset = { 
        id: "default", 
        name: "Thrall", 
        img: "systems/pf2e/icons/default-icons/npc.svg", 
        adjectives: STANDARD_ADJECTIVES, 
        isUnique: false 
    };
    
    let preset;
    let portraitPath = null;
    let ringSubjectPath = null;
    if (presetId === "random" && customPresets.length > 0) {
        const activePresetIds = canvas.scene ? canvas.scene.tokens.map(t => t.flags["necromancer-thrall-helper"]?.presetId) : [];
        const availablePresets = customPresets.filter(p => !p.isUnique || !activePresetIds.includes(p.id));

        if (availablePresets.length === 0) {
            preset = defaultPreset;
        } else {
            const randomIndex = Math.floor(Math.random() * availablePresets.length);
            preset = availablePresets[randomIndex];
        }
    } else if (presetId === "default") {
        // A portfolio entry marked as the default replaces the plain thrall, unless it is unique
        // and already on the field.
        const defaultId = getDefaultPresetId(necroActor);
        const defaultEntry = defaultId ? customPresets.find(p => p.id === defaultId) : null;
        const activeIds = canvas.scene ? canvas.scene.tokens.map(t => t.flags["necromancer-thrall-helper"]?.presetId) : [];
        preset = defaultEntry && !(defaultEntry.isUnique && activeIds.includes(defaultEntry.id)) ? defaultEntry : defaultPreset;
    } else {
        preset = customPresets.find(p => p.id === presetId) || defaultPreset;
    }


    let finalName = preset.name;
    if (preset.adjectives && preset.adjectives.length > 0) {
        const randomAdjective = preset.adjectives[Math.floor(Math.random() * preset.adjectives.length)];
        finalName = `${randomAdjective} ${preset.name}`;
    }

    if (preset) {
        tokenData.name = finalName;
        tokenData.texture.src = preset.img;
        
        if (preset.scale !== undefined) {
            tokenData.texture.scaleX = preset.scale;
            tokenData.texture.scaleY = preset.scale;
        }
        // Ring subject scale follows the image scale unless set separately.
        const presetRingScale = preset.ringScale ?? preset.scale;
        if (presetRingScale !== undefined && tokenData.ring?.subject) {
            tokenData.ring.subject.scale = presetRingScale;
        }
        
        if (tokenData.ring) {
            if (preset.ring !== undefined) {
                tokenData.ring.enabled = preset.ring;
            } else {
                const isDefaultLook = preset.id === "default" || tokenData.texture.src.includes("default-icons/npc.svg");
                tokenData.ring.enabled = isDefaultLook;
            }
            if (preset.img) tokenData.ring.subject.texture = preset.img;
        }
    }

    portraitPath = preset?.portrait || null;
    ringSubjectPath = preset?.ringSubject || null;
    tokenData.disposition = 1;


    tokenData.flags = foundry.utils.mergeObject(tokenData.flags || {}, {
        "necromancer-thrall-helper": {
            masterId: necroActor.id,
            damageScale: `${damageDice}d6`,
            presetId: preset?.id || "default"
        },
        pf2e: {
            master: {
                id: necroActor.id
            }
        }
    });


    const existingTraits = protoActor.system?.traits?.value || [];
    const newTraits = [...new Set([...existingTraits, "summoned", "minion"])];

    tokenData.delta = foundry.utils.mergeObject(tokenData.delta || {}, {
        flags: {
            pf2e: {
                master: {
                    id: necroActor.id
                }
            }
        },
        system: {
            traits: {
                value: newTraits
            }
        }
    });
   if (preset.id === "default") {
    const customImg = necroActor.getFlag("necromancer-thrall-helper", "defaultThrallImg");
    portraitPath = necroActor.getFlag("necromancer-thrall-helper", "defaultThrallPortrait") || null;
    ringSubjectPath = necroActor.getFlag("necromancer-thrall-helper", "defaultThrallRingSubject") || null;
    const ringScaleFlag = necroActor.getFlag("necromancer-thrall-helper", "defaultThrallRingScale");
    const useRing = necroActor.getFlag("necromancer-thrall-helper", "defaultRingEnabled");
    const imgScale = necroActor.getFlag("necromancer-thrall-helper", "defaultThrallScale");
    const useBundled = necroActor.getFlag("necromancer-thrall-helper", "useBundledDefault") === true;

    // Look precedence for the plain Thrall (highest first):
    //   1. a custom look: the user's default art (a chosen portfolio profile never reaches here)
    //   2. the bundled art, if "use bundled default" is checked
    //   3. the compendium Thrall's art, if its token pack is active
    //   4. the bundled art, automatically, when that pack is not active
    if (customImg) {
        tokenData.texture.src = customImg;
        if (tokenData.ring) {
            tokenData.ring.subject = tokenData.ring.subject || {};
            tokenData.ring.subject.texture = customImg;
        }
    } else if (useBundled || isArtMissing(compendiumLook.src)) {
        applyBundledLook(tokenData, { forceRing: true, portrait: !portraitPath });
    } else if (compendiumLook.src) {
        tokenData.texture.src = compendiumLook.src;
        if (tokenData.ring?.subject && compendiumLook.subject) tokenData.ring.subject.texture = compendiumLook.subject;
    }

    if (useRing !== undefined) {
        tokenData.ring = tokenData.ring || {};
        tokenData.ring.enabled = useRing;
    }

    if (imgScale !== undefined) {
        tokenData.texture.scaleX = imgScale;
        tokenData.texture.scaleY = imgScale;
    }
    const defaultRingScale = ringScaleFlag ?? imgScale;
    if (defaultRingScale !== undefined && tokenData.ring?.subject) {
        tokenData.ring.subject.scale = defaultRingScale;
    }
}
// --- WILDCARD IMAGES: resolve `thrall-*.webp` to one concrete file per spawn ---
const wildcardSrc = tokenData.texture?.src;
const pair = await resolveImageSet(wildcardSrc, { portrait: portraitPath, ringSubject: ringSubjectPath });
tokenData.texture.src = pair.art;
// Decided on the resolved files: a wildcard can pick a webp on one spawn and a webm on the next.
applyRingArt(tokenData, pair, wildcardSrc);
if (pair.portrait) {
    foundry.utils.setProperty(tokenData, "flags.necromancer-thrall-helper.portrait", pair.portrait);
}

// --- BONE FASCINATION: NIMBLE THRALLS ---
const hasBoneFascination = necroActor.items.some(i => i.slug === "bone" || i.name === "Bone");
    
if (hasBoneFascination) {
    tokenData.delta = tokenData.delta || {};
    tokenData.delta.items = tokenData.delta.items || [];
    
    tokenData.delta.items.push({
        name: "Effect: Bone Fascination",
        type: "effect",
        img: "icons/equipment/feet/boots-collared-green.webp",
        system: {
            description: { value: "Your thralls are well constructed and nimble. They gain a +5 foot bonus to Speed." },
            duration: { value: -1, unit: "unlimited" },
            rules: [
                {
                    key: "FlatModifier",
                    selector: "speed",
                    value: 5,
                    type: "untyped"
                }
            ]
        }
    });
}
return tokenData;
}