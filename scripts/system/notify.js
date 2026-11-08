/**
 * Toast notifications filtered by the per-user "notificationLevel" client setting:
 *   all        every message
 *   important  warnings and errors (default)
 *   errors     errors only
 *   none       nothing (suppressed messages are still logged to the console)
 * Pass { force: true } (or use notifyForce) for messages the user must see to act, such as
 * placement instructions and permission denials.
 */
const RANK = { info: 0, warn: 1, error: 2 };
const MIN = { all: 0, important: 1, errors: 2, none: 3 };
const DEDUPE_MS = 1500;
const recent = new Map();

function currentLevel() {
    try {
        return game.settings.get("necromancer-thrall-helper", "notificationLevel") || "important";
    } catch (err) {
        return "important"; // setting not registered yet
    }
}

export function notify(level, msg, opts = {}) {
    // The same toast fired repeatedly (e.g. from a loop) shows once.
    const key = `${level}|${msg}`;
    const now = Date.now();
    if (now - (recent.get(key) ?? 0) < DEDUPE_MS) return;
    recent.set(key, now);
    if (recent.size > 50) for (const [k, t] of recent) if (now - t > DEDUPE_MS) recent.delete(k);

    if (opts.force || RANK[level] >= (MIN[currentLevel()] ?? 1)) return ui.notifications[level](msg, opts);
    console.debug(`necromancer-thrall-helper | ${level}: ${msg}`);
}

export const notifyForce = (level, msg, opts = {}) => notify(level, msg, { ...opts, force: true });
