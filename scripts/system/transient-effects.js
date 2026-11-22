// Effects that last for one Strike (like Thrall Charge). They are tagged with a flag when created and
// removed by whichever happens first: the Strike misses, the damage is rolled, the necromancer's turn
// ends, combat ends, the scene loads, or the next charge starts. Every removal tolerates "already gone".

const MODULE = "necromancer-thrall-helper";

/** Flags that mark an effect as lasting one Strike. */
export function transientFlags(necroActor, kind = "strike", extra = {}) {
    const combat = game.combat;
    return { [MODULE]: { transient: kind, masterId: necroActor?.id ?? null, combatId: combat?.id ?? null, round: combat?.round ?? null, ...extra } };
}

/**
 * Duration for a one-Strike effect. "Until the end of this turn" (0 rounds) only while combat is
 * running on the necromancer's own turn; anywhere else 0 rounds could count as already expired.
 */
export function oneStrikeDuration(necroActor) {
    const combat = game.combat;
    const onTurn = combat?.started && necroActor && combat.combatant?.actor?.id === necroActor.id;
    return onTurn
        ? { value: 0, unit: "rounds", sustained: false, expiry: "turn-end" }
        : { value: 1, unit: "rounds", sustained: false, expiry: "turn-end" };
}

/** Delete effects by id from an actor, ignoring any that are already gone. */
export async function deleteIfExists(actor, ids) {
    const live = (ids ?? []).filter(id => actor?.items?.has(id));
    if (!live.length) return;
    await actor.deleteEmbeddedDocuments("Item", live).catch(err => console.warn("Necromancer Thrall Helper | Transient cleanup:", err));
}

function isTransient(item, kind, masterId) {
    const f = item.flags?.[MODULE];
    return f?.transient === kind && (masterId === undefined || f.masterId === masterId);
}

/** Remove every transient effect of this kind on a scene's tokens (optionally only those from one necromancer). */
export async function purgeTransient(scene, { kind = "strike", masterId } = {}) {
    if (!scene) return;
    for (const token of scene.tokens) {
        const actor = token.actor;
        if (!actor) continue;
        await deleteIfExists(actor, actor.items.filter(i => isTransient(i, kind, masterId)).map(i => i.id));
    }
}

/**
 * Watch one thrall's chat messages after a Strike. Removes the effects on a miss (when watchMiss is
 * set) or on the damage roll, and destroys the thrall after damage for a kamikaze. A timeout is the
 * last resort.
 */
export function watchStrikeCleanup({ tokenDoc, effectIds = [], watchMiss = true, onDamage = null, timeoutMs = 120000 }) {
    const hookId = Hooks.on("createChatMessage", async (msg) => {
        if (msg.speaker?.token !== tokenDoc.id) return;
        const ctx = msg.flags?.pf2e?.context;
        if (watchMiss && ctx?.type === "attack-roll" && ["failure", "criticalFailure"].includes(ctx.outcome)) {
            Hooks.off("createChatMessage", hookId);
            await deleteIfExists(tokenDoc.actor, effectIds);
        } else if (ctx?.type === "damage-roll") {
            Hooks.off("createChatMessage", hookId);
            await deleteIfExists(tokenDoc.actor, effectIds);
            if (onDamage) await onDamage();
        }
    });
    setTimeout(() => {
        Hooks.off("createChatMessage", hookId);
        deleteIfExists(tokenDoc.actor, effectIds);
    }, timeoutMs);
}

export function setupTransientEffectHooks() {
    const isActiveGM = () => game.users.activeGM?.isSelf;

    // The necromancer's turn just ended: nothing of theirs may carry a one-Strike effect past it.
    Hooks.on("updateCombat", (combat, changed) => {
        if (!isActiveGM() || (changed.turn === undefined && changed.round === undefined)) return;
        const ended = combat.previous?.combatantId ? combat.combatants.get(combat.previous.combatantId) : null;
        const actorId = ended?.actor?.id;
        if (actorId) purgeTransient(combat.scene, { masterId: actorId });
    });

    Hooks.on("deleteCombat", (combat) => {
        if (isActiveGM()) purgeTransient(combat.scene);
    });

    const onScene = () => { if (isActiveGM()) purgeTransient(canvas.scene); };
    Hooks.on("canvasReady", onScene);
    if (canvas?.ready) onScene();
}
