import { applyArtFallback, resolvePendingWildcard } from "./thrall-manager.js";
import { notify, notifyForce } from "./notify.js";

let socketlibSocket = undefined;

/** Draw the purple placement highlight on the token layer. Returns the Graphics, or null. */
function drawSpawnMarker(x, y) {
    if (!canvas.ready || !canvas.tokens) return null;
    const gridSize = canvas.grid.size;
    const marker = new PIXI.Graphics();
    marker.beginFill(0x990099, 0.4);
    marker.lineStyle(3, 0xff00ff, 0.9);
    marker.drawRect(0, 0, gridSize, gridSize);
    marker.endFill();
    marker.position.set(x, y);
    marker.zIndex = 2000;
    canvas.tokens.addChild(marker);
    return marker;
}

function clearSpawnMarker(marker) {
    if (!marker || marker.destroyed) return;
    marker.parent?.removeChild(marker);
    marker.destroy();
}

async function requestSpawn(payload, sceneId) {
    const scene = game.scenes.get(sceneId) || canvas.scene || game.scenes.active;
    if (!scene) {
        notify("warn", "No valid scene found to spawn the Thrall.");
        return;
    }

    const isViewingScene = canvas.ready && canvas.scene?.id === scene.id;
    let highlight = null;

    if (isViewingScene) {
        await canvas.pan({ x: payload.x, y: payload.y, duration: 400 });

        if (canvas.ping) {
            canvas.ping({ x: payload.x, y: payload.y });
        }

        highlight = drawSpawnMarker(payload.x, payload.y);
    }

    const masterId = payload.flags?.["necromancer-thrall-helper"]?.masterId;
    const necro = masterId ? game.actors.get(masterId) : null;
    const necroName = necro ? necro.name : "A Necromancer";

    const autoApprove = game.settings.get("necromancer-thrall-helper", "autoApproveSpawns");
    let confirm = !!autoApprove;

    if (!autoApprove) {
        try {
            confirm = await Dialog.confirm({
                title: "Thrall Summon Request",
                content: `<p><b>${necroName}</b> is attempting to summon a Thrall on <b>${scene.name}</b>. Allow?</p>`,
                yes: () => true,
                no: () => false,
                defaultYes: true,
                rejectClose: false
            });
        } catch (e) {
            console.error("Necromancer Helper | Dialog confirmation failed:", e);
            confirm = false;
        }
    }

    clearSpawnMarker(highlight);

    if (!confirm) {
        console.log("Necromancer Thrall Helper | GM denied the spawn request.");
        return;
    }

    const maxSort = Math.max(0, ...scene.tokens.map(t => t.sort || 0));
    const spawnData = foundry.utils.mergeObject(payload, {
        x: payload.x,
        y: payload.y,
        elevation: payload.elevation ?? 0,
        sort: maxSort + 100,
        hidden: false
    });

    await resolvePendingWildcard(spawnData);
    applyArtFallback(spawnData);
    const createdTokens = await scene.createEmbeddedDocuments("Token", [spawnData]);
    
    if (createdTokens && createdTokens.length > 0 && isViewingScene) {
        setTimeout(() => {
            const tokenObj = canvas.tokens?.get(createdTokens[0].id);
            if (tokenObj && tokenObj.parent) {
                tokenObj.parent.addChild(tokenObj);
            }
        }, 100);
    }

    return createdTokens;
}

async function deleteTokenAsGM(tokenId, sceneId) {
    const scene = game.scenes.get(sceneId) || canvas.scene || game.scenes.active;
    if (!scene) return;
    const tokenDoc = scene.tokens.get(tokenId);
    if (tokenDoc) await tokenDoc.delete();
}

async function createHazardAsGM(regionData, drawingData, sceneId) {
    const scene = game.scenes.get(sceneId) || canvas.scene || game.scenes.active;
    if (!scene) return;
    
    const [region] = await scene.createEmbeddedDocuments("Region", [regionData]);
    let drawing = null;
    
    if (drawingData) {
        const [createdDrawing] = await scene.createEmbeddedDocuments("Drawing", [drawingData]);
        drawing = createdDrawing;
    }
    
    return { regionId: region?.id, drawingId: drawing?.id };
}

export const setupSocket = () => {
    if (globalThis.socketlib) {
        socketlibSocket = globalThis.socketlib.registerModule("necromancer-thrall-helper");
        if (socketlibSocket) {
            socketlibSocket.register("requestSpawn", requestSpawn);
            socketlibSocket.register("deleteTokenAsGM", deleteTokenAsGM);
            socketlibSocket.register("createHazardAsGM", createHazardAsGM);
        }
    }
    return !!socketlibSocket;
};

export async function executeSpawn(payload, sceneId = canvas.scene?.id) {
    if (game.user.isGM) {
        const scene = game.scenes.get(sceneId) || canvas.scene || game.scenes.active;
        if (!scene) return;
        const maxSort = Math.max(0, ...scene.tokens.map(t => t.sort || 0));
        const spawnData = foundry.utils.mergeObject(payload, { 
            x: payload.x, 
            y: payload.y, 
            elevation: payload.elevation ?? 0,
            sort: maxSort + 100, 
            hidden: false 
        });
        await resolvePendingWildcard(spawnData);
        applyArtFallback(spawnData);
        const createdTokens = await scene.createEmbeddedDocuments("Token", [spawnData]);
        
        if (createdTokens && createdTokens.length > 0 && canvas.scene?.id === scene.id) {
            setTimeout(() => {
                const tokenObj = canvas.tokens?.get(createdTokens[0].id);
                if (tokenObj && tokenObj.parent) {
                    tokenObj.parent.addChild(tokenObj);
                }
            }, 100);
        }
        return createdTokens;
    } else {
        if (!socketlibSocket) {
            notifyForce("error", "Socketlib connection not established.");
            return;
        }
        // Show the placement while the GM decides; approve, deny and timeout all clear it.
        const marker = canvas.scene?.id === sceneId ? drawSpawnMarker(payload.x, payload.y) : null;
        try {
            return await socketlibSocket.executeAsGM("requestSpawn", payload, sceneId);
        } finally {
            clearSpawnMarker(marker);
        }
    }
}

export async function executeDelete(tokenId, sceneId = canvas.scene?.id) {
    if (game.user.isGM) {
        const scene = game.scenes.get(sceneId) || canvas.scene || game.scenes.active;
        const tokenDoc = scene?.tokens.get(tokenId);
        if (tokenDoc) await tokenDoc.delete();
    } else {
        if (!socketlibSocket) {
            notifyForce("error", "Socketlib connection not established.");
            return;
        }
        await socketlibSocket.executeAsGM("deleteTokenAsGM", tokenId, sceneId);
    }
}

export async function executeHazard(regionData, drawingData, sceneId = canvas.scene?.id) {
    if (game.user.isGM) {
        return await createHazardAsGM(regionData, drawingData, sceneId);
    } else {
        if (!socketlibSocket) {
            notifyForce("error", "Socketlib connection not established.");
            return;
        }
        return await socketlibSocket.executeAsGM("createHazardAsGM", regionData, drawingData, sceneId);
    }
}