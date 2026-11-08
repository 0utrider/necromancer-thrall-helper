import { isWildcardPath, isVideoPath, artKind, listWildcardMatches } from "../system/thrall-manager.js";
import { notify } from "../system/notify.js";

const RING_HINTS = {
    video: "Dynamic token rings don't support animated art. Set a Ring Subject image to use the ring.",
    mixed: "Ring is skipped automatically for any video file selected (unless a Ring Subject is set).",
    cutout: "Ring requires transparent cutout art. Full-frame images will cover the ring."
};

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PortfolioEditor extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "thrall-portfolio-editor",
        classes: ["necro-dark", "necro-portfolio"],
        tag: "form",
        position: {
            width: 450,
            height: "auto"
        },
        window: {
            title: "Thrall Portfolio",
            icon: "fas fa-book-dead",
            resizable: false
        }
    };

    static PARTS = {
        main: {
            template: "modules/necromancer-thrall-helper/templates/portfolio-editor.hbs"
        }
    };

    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
        this.editingId = null;
    }

    async _prepareContext(options) {
        const customFamily = this.actor.getFlag("necromancer-thrall-helper", "familyTree") || [];
        const defaultId = this.actor.getFlag("necromancer-thrall-helper", "defaultFamilyEntryId");
        const presets = await Promise.all(customFamily.map(async (p) => {
            // The list thumbnail is an <img>, so prefer the portrait and skip animated art.
            const thumbSource = p.portrait || p.img;
            const thumbMatches = isWildcardPath(thumbSource) ? await listWildcardMatches(thumbSource) : [];
            const thumb = isWildcardPath(thumbSource) ? thumbMatches[0] : thumbSource;
            const artMatches = isWildcardPath(p.img) ? (await listWildcardMatches(p.img)).length : 0;
            return {
                ...p,
                isDefault: p.id === defaultId,
                displayImg: thumb && !isVideoPath(thumb) ? thumb : "systems/pf2e/icons/default-icons/npc.svg",
                isWildcard: isWildcardPath(p.img) || isWildcardPath(p.portrait),
                matchCount: artMatches || thumbMatches.length
            };
        }));
        return { presets };
    }

    /** @override */
    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;

        const standardAdjectives = Array.from(html.querySelectorAll("input[name='adjective']")).map(cb => cb.value);

        const exportBtn = html.querySelector("#export-portfolio-btn");
        if (exportBtn) {
            exportBtn.addEventListener("click", (e) => {
                e.preventDefault();
                const customFamily = this.actor.getFlag("necromancer-thrall-helper", "familyTree") || [];
                if (customFamily.length === 0) {
                    return notify("warn", "Your portfolio is empty. Nothing to export!");
                }
                const safeName = (this.actor.name || "necromancer").replace(/[^a-z0-9]/gi, "_").toLowerCase();
                saveDataToFile(JSON.stringify(customFamily, null, 2), "application/json", `${safeName}_thrall_portfolio.json`);
                notify("info", "Thrall Portfolio exported.");
            });
        }

        const importBtn = html.querySelector("#import-portfolio-btn");
        if (importBtn) {
            importBtn.addEventListener("click", (e) => {
                e.preventDefault();
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".json";
                input.addEventListener("change", async (ev) => {
                    const file = ev.target.files?.[0];
                    if (!file) return;
                    try {
                        const text = await readTextFromFile(file);
                        const imported = JSON.parse(text);
                        if (!Array.isArray(imported)) throw new Error("Root JSON must be an array.");
                        const valid = imported.filter(p => p && typeof p.id === "string" && typeof p.name === "string");
                        if (valid.length === 0) throw new Error("No valid thrall presets found in file.");

                        await this.actor.setFlag("necromancer-thrall-helper", "familyTree", valid);
                        notify("info", `Imported ${valid.length} thrall preset(s) into ${this.actor.name}'s portfolio!`);
                        this.resetForm(html);
                        this.render(true);
                    } catch (err) {
                        console.error("Necromancer Helper | Portfolio Import Error:", err);
                        notify("error", "Failed to import portfolio: Invalid JSON file.");
                    }
                });
                input.click();
            });
        }

        const deleteBtns = html.querySelectorAll(".delete-preset-btn");
        deleteBtns.forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                const row = e.currentTarget.closest(".portfolio-row");
                const presetId = row.dataset.id;
                
                let customFamily = this.actor.getFlag("necromancer-thrall-helper", "familyTree") || [];
                customFamily = customFamily.filter(p => p.id !== presetId);
                
                await this.actor.setFlag("necromancer-thrall-helper", "familyTree", customFamily);
                if (this.actor.getFlag("necromancer-thrall-helper", "defaultFamilyEntryId") === presetId) {
                    await this.actor.unsetFlag("necromancer-thrall-helper", "defaultFamilyEntryId");
                }
                if (this.editingId === presetId) this.resetForm(html);
                this.render(true);
            });
        });

        html.querySelector("#reset-default-thrall-btn")?.addEventListener("click", async (e) => {
            e.preventDefault();
            if (this.actor.getFlag("necromancer-thrall-helper", "defaultFamilyEntryId")) {
                await this.actor.unsetFlag("necromancer-thrall-helper", "defaultFamilyEntryId");
                notify("info", "Default thrall reset: the plain Default Thrall is used again.");
            } else {
                notify("info", "No profile is set as the default thrall.");
            }
            html.querySelector("#new-thrall-default").checked = false;
            this.render(true);
        });

        const editBtns = html.querySelectorAll(".edit-preset-btn");
        editBtns.forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                const row = e.currentTarget.closest(".portfolio-row");
                const presetId = row.dataset.id;
                
                const customFamily = this.actor.getFlag("necromancer-thrall-helper", "familyTree") || [];
                const target = customFamily.find(p => p.id === presetId);
                if (!target) return;

                this.editingId = target.id;

                html.querySelector("#new-thrall-name").value = target.name || "";
                html.querySelector("#new-thrall-img").value = target.img || "";
                html.querySelector("#new-thrall-portrait").value = target.portrait || "";
                html.querySelector("#new-thrall-ring-subject").value = target.ringSubject || "";
                updateAllInfo();
                html.querySelector("#new-thrall-unique").checked = !!target.isUnique;
                html.querySelector("#new-thrall-default").checked = this.actor.getFlag("necromancer-thrall-helper", "defaultFamilyEntryId") === target.id;
                html.querySelector("#new-thrall-ring").checked = target.ring !== false;
                html.querySelector("#new-thrall-scale").value = target.scale ?? 1.0;
                html.querySelector("#new-thrall-scale-val").value = target.scale ?? 1.0;
                const ringLinked = target.ringScale === undefined;
                const ringScaleValue = target.ringScale ?? target.scale ?? 1.0;
                html.querySelector("#new-thrall-ring-link").checked = ringLinked;
                html.querySelector("#new-thrall-ring-scale").value = ringScaleValue;
                html.querySelector("#new-thrall-ring-scale").disabled = ringLinked;
                html.querySelector("#new-thrall-ring-scale-val").disabled = ringLinked;
                html.querySelector("#new-thrall-ring-scale-val").value = ringScaleValue;

                const checkboxes = html.querySelectorAll("input[name='adjective']");
                const customAdjs = [];
                
                checkboxes.forEach(cb => {
                    cb.checked = target.adjectives?.includes(cb.value);
                });

                if (target.adjectives) {
                    target.adjectives.forEach(adj => {
                        if (!standardAdjectives.includes(adj)) {
                            customAdjs.push(adj);
                        }
                    });
                }
                html.querySelector("#new-thrall-custom-adj").value = customAdjs.join(", ");

                html.querySelector("#builder-title").textContent = `Edit ${target.name}`;
                const saveBtn = html.querySelector("#save-thrall-btn");
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Update';
            });
        });
        // Each image field supports wildcards (path/thrall-*.webp), a match count,
        // a "make wildcard" button and a file picker.
        // Animated art can't use the dynamic ring. The saved ring preference is left alone (the box
        // is only disabled), so it still applies to still images.
        const updateRingHint = () => {
            const ringBox = html.querySelector("#new-thrall-ring");
            const hint = html.querySelector("#ring-hint");
            const hasSubject = !!html.querySelector("#new-thrall-ring-subject").value.trim();
            // An explicit ring subject (cutout) makes the ring usable whatever the token art is.
            const kind = hasSubject ? "subject" : artKind(html.querySelector("#new-thrall-img").value.trim());
            ringBox.disabled = kind === "video";
            ringBox.title = RING_HINTS.cutout;
            if (hint) hint.textContent = kind === "video" ? RING_HINTS.video : (kind === "mixed" ? RING_HINTS.mixed : RING_HINTS.cutout);
        };

        const imageFields = [
            { input: "#new-thrall-img", info: "#wildcard-info", wild: "#wildcard-btn", pick: "#img-pick-btn", type: "imagevideo", onChange: updateRingHint },
            { input: "#new-thrall-portrait", info: "#portrait-info", wild: "#portrait-wildcard-btn", pick: "#portrait-pick-btn", type: "image" },
            { input: "#new-thrall-ring-subject", info: "#subject-info", wild: "#subject-wildcard-btn", pick: "#subject-pick-btn", type: "image", onChange: updateRingHint }
        ].map(cfg => {
            const input = html.querySelector(cfg.input);
            const info = html.querySelector(cfg.info);
            const update = async () => {
                cfg.onChange?.();
                if (!info) return;
                const val = input.value.trim();
                if (!isWildcardPath(val)) {
                    info.textContent = "";
                    return;
                }
                const count = (await listWildcardMatches(val)).length;
                info.textContent = count
                    ? `${count} file${count === 1 ? "" : "s"} match - one is picked at random each time this thrall is summoned.`
                    : "No files match this pattern (yet).";
            };
            input?.addEventListener("input", update);

            // Turn "art/thrall-01.webp" into "art/thrall-*.webp"
            html.querySelector(cfg.wild)?.addEventListener("click", (e) => {
                e.preventDefault();
                const val = input.value.trim();
                if (!val || isWildcardPath(val)) return;
                const wild = val.replace(/\d+(\.[^./]+)$/, "*$1");
                if (wild === val) {
                    return notify("warn", "Couldn't find a number to replace. Type a pattern like path/thrall-*.webp instead.");
                }
                input.value = wild;
                update();
            });

            html.querySelector(cfg.pick)?.addEventListener("click", (e) => {
                e.preventDefault();
                new FilePicker({
                    type: cfg.type,
                    current: input.value,
                    callback: (path) => {
                        input.value = path;
                        update();
                    }
                }).render(true);
            });
            return { update };
        });
        const updateAllInfo = () => imageFields.forEach(f => f.update());
        updateAllInfo();

        const selectAllBtn = html.querySelector("#select-all-adj-btn");
        if (selectAllBtn) {
            selectAllBtn.addEventListener("click", (e) => {
                e.preventDefault();
                const checkboxes = html.querySelectorAll("input[name='adjective']");
                const allChecked = Array.from(checkboxes.values()).every(cb => cb.checked);
                
                checkboxes.forEach(cb => cb.checked = !allChecked);
                selectAllBtn.textContent = allChecked ? "Select All" : "Deselect All";
            });
        }
        const scaleSlider = html.querySelector("#new-thrall-scale");
        const ringSlider = html.querySelector("#new-thrall-ring-scale");
        const ringLink = html.querySelector("#new-thrall-ring-link");
        const scaleNum = html.querySelector("#new-thrall-scale-val");
        const ringNum = html.querySelector("#new-thrall-ring-scale-val");
        const syncRingSlider = () => {
            ringSlider.disabled = ringLink.checked;
            ringNum.disabled = ringLink.checked;
            if (ringLink.checked) ringSlider.value = scaleSlider.value;
            ringNum.value = ringSlider.value;
        };
        scaleSlider?.addEventListener("input", (e) => {
            scaleNum.value = e.target.value;
            if (ringLink.checked) syncRingSlider();
        });
        // Typed values: clamp to the slider's range and run the slider's own handler.
        for (const [num, slider] of [[scaleNum, scaleSlider], [ringNum, ringSlider]]) {
            num?.addEventListener("change", () => {
                const v = parseFloat(num.value);
                slider.value = Number.isFinite(v) ? v : slider.value;
                slider.dispatchEvent(new Event("input"));
            });
        }
        ringSlider?.addEventListener("input", syncRingSlider);
        ringLink?.addEventListener("change", syncRingSlider);
        const saveBtn = html.querySelector("#save-thrall-btn");
        if (saveBtn) {
            saveBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                const name = html.querySelector("#new-thrall-name").value.trim();
                let img = html.querySelector("#new-thrall-img").value.trim();
                const customAdjRaw = html.querySelector("#new-thrall-custom-adj").value.trim();
                const isUnique = html.querySelector("#new-thrall-unique").checked;
                const useRing = html.querySelector("#new-thrall-ring").checked;
                let portrait = html.querySelector("#new-thrall-portrait").value.trim();
                let ringSubject = html.querySelector("#new-thrall-ring-subject").value.trim();
                const imgScale = parseFloat(html.querySelector("#new-thrall-scale").value);
                const ringLinked = html.querySelector("#new-thrall-ring-link").checked;
                const ringScale = parseFloat(html.querySelector("#new-thrall-ring-scale").value);

                if (!name) {
                    notify("warn", "A thrall name is required.");
                    return;
                }

                if (!img) {
                    img = "systems/pf2e/icons/default-icons/npc.svg";
                } else if (isWildcardPath(img)) {
                    // A HEAD request can't resolve a wildcard; check for matches instead.
                    if ((await listWildcardMatches(img)).length === 0) {
                        notify("warn", `No images match "${img}" yet. The default icon is used until some exist.`);
                    }
                } else {
                    try {
                        const response = await fetch(img, { method: "HEAD" });
                        if (!response.ok) {
                            img = "systems/pf2e/icons/default-icons/npc.svg";
                        }
                    } catch (err) {
                        img = "systems/pf2e/icons/default-icons/npc.svg";
                    }
                }

                if (portrait) {
                    if (isVideoPath(portrait)) {
                        notify("warn", "Portraits must be still images. Animated files can only be used for token art.");
                        portrait = "";
                    } else if (isWildcardPath(portrait)) {
                        if ((await listWildcardMatches(portrait)).length === 0) {
                            notify("warn", `No portraits match "${portrait}" yet. The token art is used until some exist.`);
                        }
                    } else {
                        try {
                            const response = await fetch(portrait, { method: "HEAD" });
                            if (!response.ok) throw new Error("missing");
                        } catch (err) {
                            notify("warn", `Portrait "${portrait}" was not found. Using the token art instead.`);
                            portrait = "";
                        }
                    }
                }
                if (ringSubject) {
                    if (isVideoPath(ringSubject)) {
                        notify("warn", "The ring subject must be a still image (ideally a transparent cutout).");
                        ringSubject = "";
                    } else if (isWildcardPath(ringSubject)) {
                        if ((await listWildcardMatches(ringSubject)).length === 0) {
                            notify("warn", `No ring subjects match "${ringSubject}" yet.`);
                        }
                    } else {
                        try {
                            const response = await fetch(ringSubject, { method: "HEAD" });
                            if (!response.ok) throw new Error("missing");
                        } catch (err) {
                            notify("warn", `Ring subject "${ringSubject}" was not found and was skipped.`);
                            ringSubject = "";
                        }
                    }
                }
                const visuals = { ring: useRing, scale: imgScale };
                if (portrait) visuals.portrait = portrait;
                if (ringSubject) visuals.ringSubject = ringSubject;
                if (!ringLinked) visuals.ringScale = ringScale;

                const checkedCheckboxes = html.querySelectorAll("input[name='adjective']:checked");
                let adjectives = Array.from(checkedCheckboxes).map(cb => cb.value);

                if (customAdjRaw) {
                    const customList = customAdjRaw.split(",").map(s => s.trim()).filter(Boolean);
                    adjectives = [...adjectives, ...customList];
                }

                let customFamily = this.actor.getFlag("necromancer-thrall-helper", "familyTree") || [];
                const makeDefault = html.querySelector("#new-thrall-default").checked;
                let savedId = this.editingId;

                if (this.editingId) {
                    customFamily = customFamily.map(p => {
                        if (p.id === this.editingId) {
                            return {
                                id: this.editingId,
                                name: name,
                                img: img,
                                adjectives: adjectives,
                                isUnique: isUnique, ...visuals
                            };
                        }
                        return p;
                    });
                } else {
                    const newId = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
                    if (customFamily.find(p => p.id === newId)) {
                        notify("warn", "A thrall with a similar name already exists in the portfolio.");
                        return;
                    }

                    savedId = newId;
                    customFamily.push({
                        id: newId,
                        name: name,
                        img: img,
                        adjectives: adjectives,
                        isUnique: isUnique, ...visuals
                    });
                }

                await this.actor.setFlag("necromancer-thrall-helper", "familyTree", customFamily);
                // Checking the box makes this entry the default thrall; unchecking it on the current default clears it.
                const currentDefault = this.actor.getFlag("necromancer-thrall-helper", "defaultFamilyEntryId");
                if (makeDefault) {
                    await this.actor.setFlag("necromancer-thrall-helper", "defaultFamilyEntryId", savedId);
                } else if (currentDefault === savedId) {
                    await this.actor.unsetFlag("necromancer-thrall-helper", "defaultFamilyEntryId");
                }
                this.resetForm(html);
                this.render(true);
            });
        }
    }

    resetForm(html) {
        this.editingId = null;
        html.querySelector("#builder-title").textContent = "Draft New Thrall";
        html.querySelector("#new-thrall-name").value = "";
        html.querySelector("#new-thrall-default").checked = false;
        html.querySelector("#new-thrall-img").value = "";
        html.querySelector("#new-thrall-portrait").value = "";
        html.querySelector("#new-thrall-ring-subject").value = "";
        html.querySelectorAll("#wildcard-info, #portrait-info, #subject-info").forEach(el => el.textContent = "");
        html.querySelector("#new-thrall-ring-link").checked = true;
        html.querySelector("#new-thrall-ring-scale").value = 1.0;
        html.querySelector("#new-thrall-ring-scale").disabled = true;
        html.querySelector("#new-thrall-ring-scale-val").value = "1";
        html.querySelector("#new-thrall-ring-scale-val").disabled = true;
        html.querySelector("#new-thrall-custom-adj").value = "";
        html.querySelector("#new-thrall-ring").checked = true;
        html.querySelector("#new-thrall-scale").value = 1.0;
        html.querySelector("#new-thrall-scale-val").value = "1";
        html.querySelectorAll("input[name='adjective']").forEach(cb => cb.checked = false);
        const saveBtn = html.querySelector("#save-thrall-btn");
        saveBtn.innerHTML = '<i class="fas fa-plus"></i> Add to Portfolio';
    }
}
