// Damage-type colors and icons shared by the Command Deck buttons and the chat cards.
export const DMG_COLORS = {
    bludgeoning: "#c24fca", piercing: "#c24fca", slashing: "#c24fca", // physical = necromancer magenta
    spirit: "#4fc3d9", vitality: "#f2c94c", void: "#9b59d0",
    bleed: "#d0413b", untyped: "#c24fca"
};
// Card colors: vitality gets a silvery-white card, its icon stays gold.
export const CARD_COLORS = { ...DMG_COLORS, vitality: "#eef2f6" };
export const DMG_ICONS = {
    bludgeoning: "hammer", piercing: "bow-arrow", slashing: "axe",
    spirit: "ghost", vitality: "sun", void: "skull", bleed: "droplet"
};
