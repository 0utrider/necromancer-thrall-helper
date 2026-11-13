/**
 * On ready, the active GM is told which necromancer players lack "Use File Browser" (so they
 * can't use the file-picker buttons) and can fix it in one click. Informational only: pasting a
 * path or URL, and wildcard art, work without the permission.
 */
const MODULE = "necromancer-thrall-helper";

function affectedUsers() {
    const necros = game.actors.filter(a => a.class?.slug === "necromancer");
    const rows = [];
    for (const user of game.users) {
        if (user.isGM || user.can("FILES_BROWSE")) continue;
        for (const actor of necros) {
            if (actor.testUserPermission(user, "OWNER")) rows.push({ user, actor });
        }
    }
    return rows;
}

async function grantPlayerRole() {
    const perms = foundry.utils.deepClone(game.settings.get("core", "permissions"));
    const roles = new Set(perms.FILES_BROWSE ?? []);
    roles.add(CONST.USER_ROLES.PLAYER);
    perms.FILES_BROWSE = [...roles];
    await game.settings.set("core", "permissions", perms);
}

export async function checkBrowsePermissions() {
    if (!game.users.activeGM?.isSelf) return;
    if (game.settings.get(MODULE, "suppressBrowseWarning")) return;
    const rows = affectedUsers();
    if (!rows.length) return;

    const esc = foundry.utils.escapeHTML ?? (t => t);
    const seen = new Set();
    const list = rows.map(({ user, actor }) => {
        const trust = seen.has(user.id) ? "" : `<button type="button" data-trust="${user.id}"><i class="fas fa-user-check"></i> Make Trusted Player</button>`;
        seen.add(user.id);
        return `<li style="display:flex;align-items:center;gap:8px;justify-content:space-between;margin:4px 0;"><span><b>${esc(user.name)}</b> &rarr; ${esc(actor.name)}</span>${trust}</li>`;
    }).join("");

    const content = `
        <p>These players own a Necromancer but don't have the <b>Use File Browser</b> permission:</p>
        <ul style="list-style:none;padding:0;">${list}</ul>
        <p>Without it they won't see the file-picker buttons for thrall art. They can paste a path or URL instead, and wildcard art still works.</p>
        <p><small><b>Security:</b> this lets them browse the server's data folders. Trusted Player also grants other core permissions.</small></p>`;

    const { DialogV2 } = foundry.applications.api;
    await DialogV2.wait({
        window: { title: "Thrall Helper: File Browser Permission", icon: "fas fa-folder-open" },
        content,
        rejectClose: false,
        render: (event, dialog) => {
            for (const btn of dialog.element.querySelectorAll("button[data-trust]")) {
                btn.addEventListener("click", async () => {
                    const user = game.users.get(btn.dataset.trust);
                    await user?.update({ role: CONST.USER_ROLES.TRUSTED });
                    btn.disabled = true;
                    btn.textContent = "Trusted";
                });
            }
        },
        buttons: [
            {
                action: "grant",
                label: "Grant Use File Browser to Player role",
                icon: "fas fa-unlock",
                callback: async () => {
                    await grantPlayerRole();
                    ui.notifications.info("Player role can now use the file browser.");
                }
            },
            {
                action: "suppress",
                label: "Don't show again",
                icon: "fas fa-eye-slash",
                callback: () => game.settings.set(MODULE, "suppressBrowseWarning", true)
            },
            { action: "close", label: "Close", icon: "fas fa-times", default: true }
        ]
    });
}
