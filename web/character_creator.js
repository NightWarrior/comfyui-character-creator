import { hexToHsv, hsvToHex, normalizeHex, nearestColor, recommendedColors } from './colors.js';
import { app } from '../../../scripts/app.js';
import { api } from '../../../scripts/api.js';
import { characterPreview, icon } from './icons.js';
import { applySettings, changeGender, clampAge, isRestrictedCharacter, normalizeAgeWidget, optionSections, settingsFromWidgets, visibleFields } from './state.js';
import { promptChanges, renderPrompt, scrollPromptToChange } from './prompt.js';
import { characterKey, generatedCharacters, generationTime, getLibrary, imageThumbnail } from './library.js';

let editorCatalog;
const savedLayouts = new Map();
const pendingPanels = new Set();
let thumbnailError = '';
const GRID_LIMITS = { background: 8, art_style: 7, pose: 6, lighting: 5, expression: 4 };
const SCENE_ASSETS = ['studio', 'garden', 'city', 'beach', 'forest', 'room', 'fantasy', 'cafe', 'library', 'mountains', 'desert', 'snow', 'rooftop', 'workshop', 'palace', 'scifi', 'market'];
const NAV_ICONS = { Identity: 'person', Appearance: 'palette', Hair: 'hair', 'Face & accessories': 'face', Clothing: 'shirt', Scene: 'garden', 'Pose & camera': 'camera', Settings: 'settings', ControlNet: 'connections' };
const PROJECT_REPOSITORY_URL = 'https://github.com/NightWarrior/comfyui-character-creator';

const TEMPLATE_HELP = {
    "character": "A general character description: setting and pose first, then hair, face, build and clothing. Use this as the default layout.",
    "outfit": "Describes clothing before hair, facial details and build, giving the outfit earlier emphasis. It keeps all selected character details. It does not add extra views, change the pose or crop, or automatically create a clothing close-up.",
    "face": "Describes expression, face details, accessories and hair before build and clothing. For a head-and-shoulders image, also choose Portrait under Pose & camera → Framing; this template does not change the crop.",
    "build": "Describes body shape, muscle definition and clothing fit before hair and facial details. Useful when reviewing a character’s silhouette. Your selected pose, crop and garments stay the same.",
    "scene": "Describes the setting, background treatment and lighting before the character’s appearance and outfit. Useful when the environment matters. It does not zoom out or change your chosen framing."
};

const CATEGORY_HELP = {
    Identity: 'Start with the character’s gender and adult age.',
    Appearance: 'Choose skin tone, ethnicity, build, muscle definition and expression.',
    Hair: 'Choose a hairstyle and color, then adjust its finish and volume.',
    Clothing: 'Build an outfit, then customize its colors, materials and details.',
    Scene: 'Choose the setting, background treatment, art style and lighting.',
    'Pose & camera': 'Choose a pose, visible crop and composition.',
    'Face & accessories': 'Fine-tune facial features, makeup, jewelry and accessories.',
    Settings: 'Choose how prompts are organized and how changes appear in the reader. Your character selections stay the same.',
    ControlNet: 'Connect prepared control entries to the left-edge sockets. Entries apply in connection order.',
};

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function dismissOnBackdrop(dialog) {
    const outside = (event) => {
        const bounds = dialog.getBoundingClientRect();
        return event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right
            || event.clientY < bounds.top || event.clientY > bounds.bottom);
    };
    let pressed = false;
    dialog.onpointerdown = (event) => { pressed = outside(event); };
    dialog.onclick = (event) => {
        if (pressed && outside(event)) dialog.close();
        pressed = false;
    };
}

async function jsonRequest(path, options = {}) {
    const response = await api.fetchApi(`/character-creator/${path}`, options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `Character Creator: HTTP ${response.status}`);
    return result;
}

async function editorConfiguration() {
    const [catalog, response] = await Promise.all([
        jsonRequest('catalog'), fetch(new URL('./characters.json', import.meta.url), { cache: 'no-cache' }),
    ]);
    if (!response.ok) throw new Error(`Could not load starter characters: HTTP ${response.status}`);
    return { ...catalog, characters: await response.json() };
}

async function updateCharacterCovers(history, completedAt, signal) {
    signal?.throwIfAborted();
    const library = getLibrary(editorCatalog);
    for (const candidate of generatedCharacters(history, editorCatalog)) {
        let matches;
        let settings = candidate.payload?.settings;
        if (candidate.payload?.code) settings = (await jsonRequest('resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(candidate.payload), signal })).settings;
        if (candidate.characterId) matches = library.characters.filter((row) => row.id === candidate.characterId);
        else {
            const key = characterKey(settings, editorCatalog);
            matches = library.characters.filter((row) => characterKey(row.settings, editorCatalog) === key);
        }
        matches = matches.filter((row) => (row.image_time ?? 0) < completedAt);
        if (!matches.length) continue;
        const thumbnail = await imageThumbnail(candidate.image, api, completedAt, signal);
        signal?.throwIfAborted();
        const restricted = !settings || isRestrictedCharacter(settings, { ...editorCatalog, allow_nsfw: false });
        for (const row of matches) library.setImage(row.id, thumbnail, completedAt, restricted);
    }
}

function mountPanel(node, catalog) {
    editorCatalog = catalog;
    const host = element('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = element('link');
    style.rel = 'stylesheet';
    style.href = new URL('./editor.css', import.meta.url).href;
    const header = element('header');
    const modelButton = element('button', 'QWEN IMAGE 2.1');
    modelButton.setAttribute('aria-label', 'Select model family');
    header.append(element('strong', 'Character Creator'), modelButton);
    const charactersButton = element('button');
    charactersButton.innerHTML = icon('person');
    charactersButton.append(element('span', 'Characters'));
    charactersButton.title = 'Open your saved characters';
    header.append(charactersButton);
    const template = element('select');
    template.setAttribute('aria-label', 'Prompt template');
    for (const [key, value] of Object.entries(catalog.templates)) {
        const option = element('option', value.label);
        option.value = key;
        option.title = TEMPLATE_HELP[key] ?? 'A locally configured prompt layout.';
        template.append(option);
    }
    const body = element('div', undefined, 'body');
    const nav = element('nav');
    nav.setAttribute('aria-label', 'Character categories');
    const choices = element('div', undefined, 'choices');
    const preview = element('aside', undefined, 'preview');
    const avatar = element('div', undefined, 'portrait-image');
    const characterTitle = element('h3', 'Character', 'character-title');
    const outfitCard = element('div', undefined, 'outfit-card');
    const outfit = element('div');
    outfitCard.append(element('strong', 'Outfit preview'), outfit);
    const previewCaption = element('small', 'Schematic outfit preview');
    preview.append(avatar, characterTitle, previewCaption, outfitCard);
    body.append(nav, choices, preview);
    const footer = element('footer');
    const status = element('div', 'Choose a category and select visual options.', 'status');
    status.setAttribute('role', 'status');
    const share = element('div', undefined, 'share');
    const code = element('textarea');
    code.placeholder = 'Paste a CC1 code';
    code.maxLength = 32768;
    code.setAttribute('aria-label', 'Shareable character code');
    const importButton = element('button', 'Import');
    const exportButton = element('button', 'Export');
    const copyButton = element('button', 'Copy');
    share.append(element('label', 'Character code'), code, importButton, exportButton, copyButton);
    const prompt = element('div', '');
    prompt.className = 'prompt';
    prompt.tabIndex = 0;
    prompt.setAttribute('role', 'textbox');
    prompt.setAttribute('aria-readonly', 'true');
    prompt.setAttribute('aria-multiline', 'true');
    prompt.setAttribute('aria-label', 'Prompt preview');
    const promptTools = element('div', undefined, 'prompt-tools');
    const expandPrompt = element('button', 'Expand');
    const copyPrompt = element('button', 'Copy prompt');
    promptTools.append(element('strong', 'Generated prompt'), expandPrompt, copyPrompt);
    const promptDialog = element('dialog');
    promptDialog.setAttribute('aria-label', 'Generated prompt');
    const dialogTools = element('div', undefined, 'prompt-tools');
    const closePrompt = element('button', 'Close');
    const dialogCopyPrompt = element('button', 'Copy prompt');
    const expandedPrompt = element('div', '');
    expandedPrompt.className = 'prompt';
    expandedPrompt.tabIndex = 0;
    expandedPrompt.setAttribute('role', 'textbox');
    expandedPrompt.setAttribute('aria-readonly', 'true');
    expandedPrompt.setAttribute('aria-multiline', 'true');
    expandedPrompt.setAttribute('aria-label', 'Expanded prompt');
    dialogTools.append(element('strong', 'Generated prompt'), dialogCopyPrompt, closePrompt);
    promptDialog.append(dialogTools, expandedPrompt);
    footer.append(status, share, promptTools, prompt);
    shadow.append(style, header, body, footer);
    shadow.append(promptDialog);
    dismissOnBackdrop(promptDialog);
    const colorDialog = element('dialog', undefined, 'color-dialog');
    colorDialog.setAttribute('aria-label', 'Choose color');
    const colorHeading = element('div', undefined, 'prompt-tools');
    const closeColor = element('button', 'Close');
    colorHeading.append(element('strong', 'Choose color'), closeColor);
    const saturation = element('div', undefined, 'saturation');
    saturation.setAttribute('aria-label', 'Color saturation and brightness');
    const colorCursor = element('i', undefined, 'color-cursor');
    saturation.append(colorCursor);
    const hue = element('input', undefined, 'hue-slider');
    hue.type = 'range'; hue.min = '0'; hue.max = '359'; hue.step = '1';
    hue.setAttribute('aria-label', 'Color hue');
    const hexRow = element('label', 'Hex', 'color-hex');
    const hex = element('input'); hex.type = 'text'; hex.maxLength = 7;
    hex.setAttribute('aria-label', 'Hex color');
    const colorSample = element('i', undefined, 'color-sample');
    hexRow.append(hex, colorSample);
    const colorName = element('p', undefined, 'color-name');
    colorName.setAttribute('aria-label', 'Color name');
    const suggestedColors = element('div', undefined, 'suggested-colors');
    suggestedColors.setAttribute('aria-label', 'Suggested colors');
    const colorActions = element('div', undefined, 'color-actions');
    const resetColor = element('button', 'Reset');
    const doneColor = element('button', 'Done');
    const dropperColor = element('button', undefined, 'color-dropper');
    dropperColor.innerHTML = icon('eyedropper');
    dropperColor.setAttribute('aria-label', 'Pick from screen');
    dropperColor.disabled = typeof globalThis.EyeDropper !== 'function';
    dropperColor.title = dropperColor.disabled ? 'Screen sampling needs a browser with EyeDropper support on HTTPS or localhost.' : 'Sample a color anywhere on your screen. Press Escape to cancel.';
    colorActions.append(dropperColor, resetColor, doneColor);
    colorDialog.append(colorHeading, saturation, hue, hexRow, colorName, suggestedColors,
        element('p', 'Color names are included in the prompt.', 'help'), colorActions);
    shadow.append(colorDialog);
    dismissOnBackdrop(colorDialog);
    closeColor.onclick = doneColor.onclick = () => colorDialog.close();
    let colorTarget;
    let hsv;
    const paintColor = (value) => {
        hsv = hexToHsv(value);
        hue.value = String(Math.round(hsv.h));
        saturation.style.setProperty('--hue', hsv.h);
        colorCursor.style.left = `${hsv.s * 100}%`;
        colorCursor.style.bottom = `${hsv.v * 100}%`;
        hex.value = value;
        colorSample.style.background = value;
        colorName.textContent = nearestColor(value, catalog.color_names);
        for (const swatch of suggestedColors.children) {
            if (swatch.dataset.color) swatch.setAttribute('aria-pressed', String(swatch.dataset.color === value));
        }
    };
    const changeColor = (value) => {
        paintColor(value);
        colorTarget.picker.value = value;
        colorTarget.picker.oninput();
        resetColor.disabled = !colorTarget.reset;
    };
    dropperColor.onclick = async () => {
        const target = colorTarget;
        colorDialog.classList.toggle('sampling', true);
        try {
            const result = await new globalThis.EyeDropper().open({ signal: controller.signal });
            const value = normalizeHex(result.sRGBHex);
            if (value && colorDialog.open && colorTarget === target) changeColor(value);
        } catch (error) {
            if (error.name !== 'AbortError') status.textContent = 'Screen color sampling is unavailable. Use the color picker or hex field.';
        } finally {
            colorDialog.classList.toggle('sampling', false);
        }
    };
    hue.oninput = () => changeColor(hsvToHex({ ...hsv, h: Number(hue.value) }));
    hex.oninput = () => { const value = normalizeHex(hex.value); if (value) changeColor(value); };
    hex.onchange = () => { if (!normalizeHex(hex.value)) hex.value = colorTarget.picker.value; };
    const moveColor = (event) => {
        const bounds = saturation.getBoundingClientRect();
        changeColor(hsvToHex({ ...hsv,
            s: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
            v: 1 - Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
        }));
    };
    saturation.onpointerdown = (event) => { saturation.setPointerCapture(event.pointerId); moveColor(event); };
    saturation.onpointermove = (event) => { if (event.buttons === 1) moveColor(event); };
    resetColor.onclick = () => { colorDialog.close(); colorTarget.reset?.onclick(); };
    const bindColorPopup = (picker, reset, field, accent = false) => {
        picker.onclick = (event) => {
            event.preventDefault();
            if (picker.disabled) return;
            colorTarget = { picker, reset };
            resetColor.disabled = !reset || reset.disabled;
            paintColor(picker.value);
            const settings = settingsFromWidgets(node, catalog);
            const material = settings.clothing?.[field]?.fabric;
            const label = material && material !== 'default' ? catalog.clothing.fabric[material].label : (catalog.fields[field] ?? catalog.extra_fields[field]).label;
            suggestedColors.replaceChildren(element('small', `Suggested ${accent ? 'accent ' : ''}colors · ${label}`));
            for (const color of recommendedColors(field, settings, catalog, accent)) {
                const swatch = element('button');
                swatch.dataset.color = color.value;
                swatch.style.background = color.value;
                swatch.title = `${color.label} · ${color.value}`;
                swatch.setAttribute('aria-label', `Suggested color: ${color.label} (${color.value})`);
                swatch.setAttribute('aria-pressed', String(picker.value === color.value));
                swatch.onclick = () => changeColor(color.value);
                suggestedColors.append(swatch);
            }
            colorDialog.showModal();
            const bounds = picker.getBoundingClientRect();
            const popup = colorDialog.getBoundingClientRect();
            colorDialog.style.position = 'fixed';
            colorDialog.style.margin = '0';
            colorDialog.style.left = `${Math.max(12, Math.min(bounds.right + 8, (globalThis.innerWidth ?? 1024) - popup.width - 12))}px`;
            colorDialog.style.top = `${Math.max(12, Math.min(bounds.top, (globalThis.innerHeight ?? 768) - popup.height - 12))}px`;
        };
    };
    const modelDialog = element('dialog', undefined, 'model-dialog');
    modelDialog.setAttribute('aria-label', 'Model families');
    const modelTools = element('div', undefined, 'prompt-tools');
    const closeModels = element('button', 'Close');
    modelTools.append(element('strong', 'Model family'), closeModels);
    const modelChoices = element('div', undefined, 'model-choices');
    modelDialog.append(modelTools, modelChoices, element('p', 'Selects the prompt formatter. Load a matching family workflow or checkpoint separately.', 'help model-help'));
    shadow.append(modelDialog);
    dismissOnBackdrop(modelDialog);
    closeModels.onclick = () => modelDialog.close();
    const charactersDialog = element('dialog', undefined, 'characters-dialog');
    charactersDialog.setAttribute('aria-label', 'Characters');
    const libraryHeading = element('div', undefined, 'prompt-tools');
    const closeCharacters = element('button', 'Close');
    const saveCharacter = element('button', 'Save current as new');
    libraryHeading.append(element('strong', 'Characters'), closeCharacters);
    const libraryHelp = element('p', 'Select a character to edit it. Changes save automatically. The latest matching generation becomes its cover; otherwise the outfit preview is shown. Saved in this browser; export a CC1 code to share or back up a character.', 'help');
    const libraryTools = element('div', undefined, 'library-tools');
    const characterName = element('input');
    characterName.type = 'text'; characterName.maxLength = 80;
    characterName.setAttribute('aria-label', 'Character name');
    const renameCharacter = element('button', 'Rename');
    const deleteCharacter = element('button', 'Delete');
    libraryTools.append(characterName, renameCharacter, deleteCharacter, saveCharacter);
    const libraryMessage = element('div', undefined, 'library-message');
    libraryMessage.setAttribute('role', 'status');
    const characterGrid = element('div', undefined, 'library-grid');
    charactersDialog.append(libraryHeading, element('p', 'Choose a saved character or create a new one.', 'help'),
        characterGrid, libraryTools, libraryMessage, libraryHelp,
        element('p', 'Click outside or press Esc to close.', 'modal-hint'));
    shadow.append(charactersDialog);
    let library;
    let libraryLoadError;
    try { library = getLibrary(catalog); libraryLoadError = library.migrationError; } catch (error) { libraryLoadError = error.message; }
    node.properties ??= {};
    const activeCharacter = () => library?.characters.find((row) => row.id === node.properties.character_creator_character_id);
    let promptText = '';
    let highlightTimer;
    let promptMarks = [];
    let expandedMarks = [];
    let skipChangeHighlight = false;
    const readerSettings = () => node.properties?.character_creator_ui ?? {};
    const clearHighlights = () => {
        for (const mark of [...promptMarks, ...expandedMarks]) mark.className = '';
        promptMarks = expandedMarks = [];
    };
    const setPrompt = (value) => {
        const skip = skipChangeHighlight;
        skipChangeHighlight = false;
        if (value === promptText) {
            if (skip) { clearTimeout(highlightTimer); clearHighlights(); }
            return;
        }
        clearTimeout(highlightTimer);
        const ranges = skip || readerSettings().highlight_changes === false ? [] : promptChanges(promptText, value);
        promptText = value;
        promptMarks = renderPrompt(prompt, value, ranges);
        expandedMarks = renderPrompt(expandedPrompt, value, ranges);
        if (readerSettings().scroll_changes !== false) {
            scrollPromptToChange(prompt, promptMarks[0]);
            if (promptDialog.open) scrollPromptToChange(expandedPrompt, expandedMarks[0]);
        }
        if (ranges.length) {
            highlightTimer = setTimeout(clearHighlights, 3400);
        }
    };

    let group = 'Identity';
    let supportExpanded = false;
    let timer;
    let revision = 0;
    let selectionRevision = 0;
    let lastCharacterState;
    let characterEdited = false;
    let removed = false;
    let updateQueued = false;
    let connectionLayout;
    let connectionFrame;
    const scheduleUpdate = () => {
        if (removed || updateQueued) return;
        updateQueued = true;
        queueMicrotask(() => {
            const finish = () => {
                connectionFrame = undefined;
                updateQueued = false;
                if (connectionLayout && !removed) {
                    const size = connectionLayout;
                    connectionLayout = undefined;
                    hideNativeWidgets();
                    node.setSize([size[0], Math.max(size[1], node.computeSize()[1])]);
                }
                update();
            };
            // Autogrow removes disconnected sockets on the next animation frame.
            if (connectionLayout) connectionFrame = requestAnimationFrame(finish);
            else finish();
        });
    };
    const controller = new AbortController();
    const colorLabels = new Map();
    const openGroups = new Map();
    const groups = [...new Set(Object.values({ ...catalog.fields, ...catalog.extra_fields }).map((field) => field.group)), 'Settings', 'ControlNet'];
    groups.splice(groups.indexOf('Face & accessories'), 1);
    groups.splice(groups.indexOf('Hair') + 1, 0, 'Face & accessories');
    const widget = (name) => node.widgets?.find((item) => item.name === name);
    const setStatus = (message, error = false) => {
        status.textContent = message;
        status.classList.toggle('error', error);
    };
    const linked = (name) => node.inputs?.some((input) => input.widget?.name === name && input.link != null);
    const payload = () => {
        if (linked('character_code')) throw new Error('Connected character_code is resolved when the workflow executes.');
        const override = widget('character_code')?.value?.trim();
        if (!override && ['model', 'template', 'colors', 'age', 'clothing', 'ethnicity', ...Object.keys(catalog.fields), ...Object.keys(catalog.extra_fields ?? {})].some(linked)) {
            throw new Error('Connected character settings are resolved when the workflow executes. Use the character_code output to export them.');
        }
        return override ? { code: override } : { settings: settingsFromWidgets(node, catalog) };
    };
    const resolve = (value) => jsonRequest('resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value), signal: controller.signal,
    });
    const previewPrompt = () => {
        const state = JSON.stringify([settingsFromWidgets(node, catalog), widget('character_code')?.value]);
        if (lastCharacterState !== undefined && lastCharacterState !== state) characterEdited = true;
        lastCharacterState = state;
        clearTimeout(timer);
        const current = ++revision;
        timer = setTimeout(async () => {
            if (removed || current !== revision) return;
            try {
                const result = await resolve(payload());
                if (removed || current !== revision) return;
                setPrompt(result.prompt);
                for (const [field, label] of colorLabels) {
                    if (result.color_labels?.[field]) label.textContent = result.color_labels[field];
                }
                renderAvatar(result.settings);
                let saveError;
                try {
                    if (library) {
                        const active = activeCharacter();
                        const key = characterKey(result.settings, catalog);
                        if (active && !characterEdited && characterKey(active.settings, catalog) !== key) {
                            delete node.properties.character_creator_character_id;
                        }
                        if (!activeCharacter()) {
                            const matching = library.characters.find((row) => characterKey(row.settings, catalog) === key);
                            if (matching) node.properties.character_creator_character_id = matching.id;
                        }
                        if (characterEdited) library.update(node.properties.character_creator_character_id, result.settings, catalog);
                        if (active?.id !== activeCharacter()?.id) renderCharacters();
                    }
                } catch (error) { saveError = `Character could not be saved: ${error.message}`; }
                characterEdited = false;
                setStatus(saveError ?? (widget('character_code')?.value?.trim()
                    ? 'Character code overrides controls. Import it here to edit.'
                    : `Prompt ready. Connect prompt → ${result.settings.model === 'qwen_image_2_1' ? 'Text Encode Qwen Image 2.1' : 'CLIP Text Encode'}.`), Boolean(saveError));
            } catch (error) {
                if (removed || current !== revision) return;
                setPrompt('');
                setStatus(error.message, true);
            }
        }, 180);
    };

    function starterPortrait(row) {
        const starter = catalog.characters?.find((item) => item.id === row?.id);
        if (!starter) return null;
        return new URL(`./assets/${starter.id}.png`, import.meta.url).href;
    }

    function renderAvatar(settings = settingsFromWidgets(node, catalog)) {
        const active = activeCharacter();
        characterTitle.textContent = active?.name ?? 'Current character';
        if (isRestrictedCharacter(settings, catalog)) {
            outfit.textContent = 'Restricted selection';
            avatar.replaceChildren();
            previewCaption.textContent = 'Choose covering clothing or enable NSFW in local config.json.';
            return;
        }
        const schematic = characterPreview(settings, { ...catalog.fields, ...catalog.extra_fields });
        outfit.innerHTML = schematic.replaceAll('id="garment-', 'id="outfit-garment-').replaceAll('url(#garment-', 'url(#outfit-garment-');
        const generated = (catalog.allow_nsfw || active?.image_restricted === false) && typeof active?.image === 'string' && /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(active.image) && active.image.length <= 200000;
        const source = active && isRestrictedCharacter(active.settings, catalog) ? null : generated ? active.image : starterPortrait(active);
        if (source) {
            const image = element('img');
            image.src = source;
            image.alt = generated ? `Last generated image of ${active.name}` : `Starter portrait of ${active.name}`;
            image.onerror = () => { avatar.innerHTML = schematic; previewCaption.textContent = 'Schematic preview'; };
            avatar.replaceChildren(image);
            previewCaption.textContent = generated ? 'Last generated image' : 'Starter portrait';
        } else {
            avatar.innerHTML = schematic;
            previewCaption.textContent = 'Schematic preview · Generate to add a portrait';
        }
    }

    function renderCharacters() {
        renderAvatar();
        const active = activeCharacter();
        charactersButton.title = active ? `Characters · ${active.name}` : 'Open your saved characters';
        if (!charactersDialog.open) return;
        characterGrid.replaceChildren();
        characterName.value = active?.name ?? '';
        characterName.disabled = renameCharacter.disabled = deleteCharacter.disabled = !active;
        saveCharacter.disabled = !library;
        libraryMessage.textContent = libraryLoadError ?? thumbnailError;
        for (const [index, row] of (library?.characters ?? []).entries()) {
            const button = element('button', undefined, 'character-card');
            button.setAttribute('aria-label', `Load character: ${row.name}`);
            button.setAttribute('aria-pressed', String(row.id === active?.id));
            const portrait = element('div', undefined, 'portrait');
            const schematic = () => { portrait.innerHTML = characterPreview(row.settings, { ...catalog.fields, ...catalog.extra_fields })
                .replaceAll('id="garment-', `id="library-${index}-garment-`).replaceAll('url(#garment-', `url(#library-${index}-garment-`); };
            if (isRestrictedCharacter(row.settings, catalog)) {
                portrait.textContent = 'NSFW disabled';
                button.disabled = true;
                button.title = 'This character requires allow_nsfw: true in local config.json.';
            } else if ((catalog.allow_nsfw || row.image_restricted === false) && typeof row.image === 'string' && /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(row.image) && row.image.length <= 200000) {
                const image = element('img'); image.src = row.image; image.alt = row.name;
                image.onerror = schematic;
                portrait.append(image);
            } else if (starterPortrait(row)) {
                const image = element('img'); image.src = starterPortrait(row); image.alt = row.name; image.onerror = schematic; portrait.append(image);
            } else schematic();
            button.append(portrait, element('strong', row.name));
            button.onclick = () => selectCharacter(row);
            characterGrid.append(button);
        }
        const add = element('button', undefined, 'new-character');
        add.setAttribute('aria-label', 'Create new character');
        add.append(element('span', '+'), element('strong', 'New character'));
        add.disabled = !library || !catalog.characters?.length;
        add.onclick = async () => {
            try {
                const result = await resolve({ settings: catalog.characters[0].settings });
                const row = library.add(result.settings);
                await selectCharacter(row);
                characterName.focus(); characterName.select();
            } catch (error) { libraryMessage.textContent = error.message; }
        };
        characterGrid.append(add);
    }

    async function selectCharacter(row) {
        const selection = ++selectionRevision;
        try {
            const result = await resolve({ settings: row.settings });
            if (removed || selection !== selectionRevision) return;
            applySettings(node, result.settings, catalog);
            node.properties.character_creator_character_id = row.id;
            skipChangeHighlight = true;
            update();
            renderCharacters();
            node.graph?.setDirtyCanvas(true, true);
        } catch (error) { libraryMessage.textContent = error.message; }
    }

    let refreshingHistory = false;
    charactersButton.onclick = async () => {
        charactersDialog.showModal(); renderCharacters();
        if (refreshingHistory) return;
        refreshingHistory = true;
        try {
            const response = await api.fetchApi('/history?max_items=40', { signal: controller.signal });
            if (!response.ok) throw new Error('Could not read recent generation history.');
            const histories = Object.values(await response.json()).sort((a, b) => generationTime(b) - generationTime(a));
            for (const history of histories) await updateCharacterCovers(history, generationTime(history), controller.signal);
            thumbnailError = '';
            if (!removed) renderCharacters();
        } catch (error) { if (!removed) libraryMessage.textContent = `Character covers could not be refreshed: ${error.message}`; }
        finally { refreshingHistory = false; }
    };
    closeCharacters.onclick = () => charactersDialog.close();
    dismissOnBackdrop(charactersDialog);
    modelButton.onclick = () => {
        modelChoices.replaceChildren();
        const families = { qwen_image_2_1: 'Qwen Image 2.1', sdxl: 'SDXL', sd: 'Stable Diffusion 1.5', z_image_turbo: 'Z-Image Turbo', flux: 'FLUX', sd3: 'Stable Diffusion 3' };
        let plannedHeading = false;
        for (const [id, label] of Object.entries(families)) {
            const supported = Boolean(catalog.models?.[id]);
            if (!supported && !plannedHeading) {
                modelChoices.append(element('small', 'Planned', 'model-planned'));
                plannedHeading = true;
            }
            const button = element('button', undefined, 'tile');
            button.append(element('strong', label), element('small', supported ? 'Available' : 'Planned'));
            button.setAttribute('aria-label', `Model family: ${label}`);
            button.setAttribute('aria-pressed', String(widget('model')?.value === id));
            button.disabled = !supported || modelButton.disabled;
            button.onclick = () => {
                if (button.disabled) return;
                widget('model').value = id;
                widget('model').callback?.(id);
                skipChangeHighlight = false;
                update();
                modelDialog.close();
            };
            modelChoices.append(button);
        }
        modelDialog.showModal();
        const bounds = modelButton.getBoundingClientRect();
        const popup = modelDialog.getBoundingClientRect();
        modelDialog.style.position = 'fixed';
        modelDialog.style.margin = '0';
        modelDialog.style.left = `${Math.max(12, Math.min(bounds.left, (globalThis.innerWidth ?? 1024) - popup.width - 12))}px`;
        modelDialog.style.top = `${Math.max(12, Math.min(bounds.bottom + 8, (globalThis.innerHeight ?? 768) - popup.height - 12))}px`;
    };
    saveCharacter.onclick = async () => {
        try {
            const result = await resolve(payload());
            if (removed) return;
            const row = library.add(result.settings, characterName.value.trim() || 'New character');
            node.properties.character_creator_character_id = row.id;
            renderCharacters();
            node.graph?.setDirtyCanvas(true, true);
        } catch (error) { libraryMessage.textContent = error.message; }
    };
    renameCharacter.onclick = () => {
        try { library.rename(activeCharacter().id, characterName.value); }
        catch (error) { libraryMessage.textContent = error.message; }
    };
    deleteCharacter.onclick = () => {
        const id = activeCharacter()?.id;
        if (!id) return;
        try {
            library.remove(id);
            delete node.properties.character_creator_character_id;
            renderCharacters();
            libraryMessage.textContent = 'Character deleted. Its current settings remain on the node; Save current as new restores it. Generated image files were kept.';
            node.graph?.setDirtyCanvas(true, true);
        } catch (error) { libraryMessage.textContent = error.message; }
    };
    const unsubscribeLibrary = library?.subscribe(renderCharacters);

    function organizeFields(settings) {
        const fields = Array.from(choices.children).filter((child) => child.dataset?.field);
        const rows = new Map(fields.map((child) => [child.dataset.field, child]));
        if (group === 'Face & accessories') {
            choices.replaceChildren(...Array.from(choices.children).filter((child) => !child.dataset?.field));
            const assigned = new Set();
            for (const [label, names] of [
                ['Eyes & brows', ['eye_color', 'eye_shape', 'eyebrows']],
                ['Lips & makeup', ['lip_shape', 'lip_makeup', 'makeup', 'eyeliner']],
                ['Earrings', ['earrings']], ['Neck jewelry', ['necklace']], ['Piercings', ['piercings']],
                ['Moles & freckles', ['moles', 'freckles']], ['Eyewear', ['eyewear']],
            ]) {
                const panel = element('details', undefined, 'face-group');
                panel.open = openGroups.get(label) ?? ['Eyes & brows', 'Lips & makeup'].includes(label);
                panel.ontoggle = () => openGroups.set(label, panel.open);
                const summary = element('summary', label);
                const labels = names.map((name) => {
                    const field = catalog.extra_fields[name];
                    return field.options.find((option) => option.id === (settings[name] ?? field.default))?.label;
                }).filter(Boolean);
                summary.append(element('span', labels.join(' / '), 'group-summary'));
                const content = element('div', undefined, 'face-body');
                content.append(...names.map((name) => rows.get(name)).filter(Boolean));
                for (const name of names) assigned.add(name);
                panel.append(summary, content);
                choices.append(panel);
            }
            for (const [name, field] of rows) if (!assigned.has(name)) choices.append(field);
        } else if (group === 'Clothing') {
            choices.replaceChildren(...Array.from(choices.children).filter((child) => !child.dataset?.field));
            const order = ['wardrobe_mode', 'dress', 'upper_garment', 'lower_garment', 'outerwear', 'headwear', 'neckwear', 'gloves', 'shoes'];
            for (const name of [...order, ...[...rows.keys()].filter((name) => !order.includes(name))]) {
                const field = rows.get(name);
                if (!field) continue;
                field.className += ' clothing-field clothing-section';
                if (name === 'wardrobe_mode') {
                    field.className += ' outfit-setup';
                    Array.from(field.children).find((child) => child.tagName === 'H3').textContent = 'Outfit setup';
                }
                choices.append(field);
                const tiles = Array.from(field.children).find((child) => child.className === 'tiles');
                const selected = Array.from(tiles?.children ?? []).find((tile) => tile.dataset.option === settings[name]);
                if (selected) tiles.scrollLeft = selected.offsetLeft;
            }
        } else if (group === 'Appearance' && rows.has('ethnicity')) {
            const field = rows.get('ethnicity');
            const panel = element('details', undefined, 'ethnicity-picker');
            panel.open = openGroups.get('ethnicity') ?? false;
            panel.ontoggle = () => openGroups.set('ethnicity', panel.open);
            const label = catalog.ethnicity.options.find((option) => option.id === settings.ethnicity)?.label ?? 'None';
            choices.replaceChild(panel, field);
            panel.append(element('summary', `Ethnicity (optional) · ${label}`), field);
        }
    }

    function update() {
        if (removed) return;
        const sameCategory = choices.dataset.category === group;
        const scrollTop = sameCategory ? choices.scrollTop : 0;
        const fieldScroll = new Map(sameCategory ? Array.from(choices.children)
            .filter((section) => section.dataset?.field)
            .map((section) => [section.dataset.field, { left: section.querySelector('.tiles')?.scrollLeft, detailsOpen: section.querySelector('details')?.open }]) : []);
        if (colorDialog.open) colorDialog.close();
        const settings = settingsFromWidgets(node, catalog);
        modelButton.textContent = (catalog.models?.[settings.model] ?? settings.model).toUpperCase();
        modelButton.disabled = Boolean(linked('model') || linked('character_code') || widget('character_code')?.value?.trim());
        template.value = settings.template;
        template.disabled = Boolean(linked('template') || linked('character_code') || widget('character_code')?.value?.trim());
        renderAvatar(settings);
        for (const button of nav.children) button.setAttribute('aria-pressed', String(button.dataset.category === group));
        choices.replaceChildren();
        choices.dataset.category = group;
        const categoryHeading = element('h2', group, 'category-heading');
        const categoryHelp = element('p', CATEGORY_HELP[group], 'help');
        categoryHelp.setAttribute('aria-label', `${group} category description`);
        choices.append(categoryHeading, categoryHelp);
        colorLabels.clear();
        if (group === 'Settings') {
            const section = element('section', undefined, 'field');
            section.append(element('h3', 'Prompt template'),
                element('p', 'Choose which details appear earlier in the description.', 'help'), template);
            const description = element('p', TEMPLATE_HELP[settings.template] ?? 'A locally configured prompt layout. Its configured format determines the description order.', 'help selection-help');
            description.setAttribute('aria-label', 'Selected prompt template explanation');
            section.append(description);
            section.append(element('h3', 'Reader preferences'));
            for (const [key, label, help] of [
                ['highlight_changes', 'Highlight prompt changes', 'Highlight new or replaced words for 3 seconds, then fade. Removals are not highlighted.'],
                ['scroll_changes', 'Auto-scroll to changes', 'Scroll to the first highlighted phrase. Turn off to keep your reading position.'],
            ]) {
                const row = element('label', undefined, 'color-row');
                const check = element('input');
                check.type = 'checkbox';
                check.checked = readerSettings()[key] !== false;
                check.disabled = key === 'scroll_changes' && readerSettings().highlight_changes === false;
                check.setAttribute('aria-label', label);
                check.title = help;
                check.onchange = () => {
                    node.properties ??= {};
                    node.properties.character_creator_ui = { ...readerSettings(), [key]: check.checked };
                    if (key === 'highlight_changes' && !check.checked) { clearTimeout(highlightTimer); clearHighlights(); }
                    update();
                    node.graph?.setDirtyCanvas(true, true);
                };
                row.append(check, element('span', label));
                section.append(row, element('p', help, 'help'));
            }
            section.append(element('p', 'Reader preferences stay with this workflow. Character codes include the template and character choices.', 'help'));
            choices.append(section);
            const supportSection = element('details', undefined, 'support-section');
            supportSection.open = supportExpanded;
            supportSection.ontoggle = () => { supportExpanded = supportSection.open; };
            supportSection.append(element('summary', 'About & Support'));
            const card = element('section', undefined, 'support-card');
            const banner = element('div', undefined, 'support-banner');
            const bannerImage = element('img');
            bannerImage.alt = 'NightWarrior banner';
            bannerImage.src = new URL('./assets/nightwarrior-banner.png', import.meta.url).href;
            bannerImage.onerror = () => { bannerImage.hidden = true; };
            banner.append(bannerImage);
            const profile = element('div', 'NW', 'support-profile');
            const profileImage = element('img');
            profileImage.alt = 'NightWarrior';
            profileImage.src = new URL('./assets/nightwarrior-profile.png', import.meta.url).href;
            profileImage.onerror = () => { profileImage.hidden = true; };
            profile.append(profileImage);
            const copy = element('div', undefined, 'support-copy');
            const support = element('a', 'Support Development on Patreon', 'support-link');
            support.href = 'https://patreon.com/NightWarrior';
            support.target = '_blank'; support.rel = 'noopener noreferrer';
            const github = element('a', 'View on GitHub', 'support-secondary');
            github.href = PROJECT_REPOSITORY_URL;
            github.target = '_blank'; github.rel = 'noopener noreferrer';
            copy.append(element('h3', 'Made for your imagination.'),
                element('p', 'Enjoying Character Creator? Your support helps me improve the node, explore new features, and keep development going.'), support, github,
                element('div', 'Character Creator by NightWarrior · Built for ComfyUI', 'support-credit'));
            card.append(banner, profile, copy);
            supportSection.append(card);
            choices.append(supportSection);
        } else if (group === 'ControlNet') {
            const heading = element('div', undefined, 'control-heading');
            const toggle = element('select');
            toggle.setAttribute('aria-label', 'Enable ControlNet stack');
            for (const state of ['disabled', 'enabled']) {
                const option = element('option', state === 'enabled' ? 'Enabled' : 'Disabled');
                option.value = state;
                toggle.append(option);
            }
            const controlWidget = widget('controlnets');
            toggle.value = controlWidget?.value ?? 'disabled';
            toggle.disabled = Boolean(!controlWidget || linked('controlnets'));
            toggle.onchange = () => {
                const size = [...node.size];
                controlWidget.value = toggle.value;
                controlWidget.callback?.(toggle.value);
                node.setSize(size);
                update();
                node.graph?.setDirtyCanvas(true, true);
            };
            choices.replaceChild(heading, categoryHeading);
            heading.append(categoryHeading, toggle);
            const list = element('div', undefined, 'control-list');
            list.setAttribute('aria-label', 'ControlNet input connections');
            const inputs = (node.inputs ?? []).filter((input) => /^controlnets\.entries\.entry_\d+$/.test(input.name))
                .sort((a, b) => Number(a.name.split('_').at(-1)) - Number(b.name.split('_').at(-1)));
            for (const input of inputs) {
                const row = element('div', undefined, 'control-entry');
                const connected = input.link != null;
                const marker = element('i', undefined, `socket-indicator${connected ? ' connected' : ''}`);
                const link = node.graph?.links?.[input.link] ?? node.graph?.links?.get?.(input.link);
                const source = link && node.graph?.getNodeById?.(link.origin_id);
                const content = element('div');
                content.append(element('strong', connected ? 'Connected' : 'Empty socket'),
                    element('small', input.name), element('small', source?.title ?? (connected ? 'Control entry connected' : 'Connect another entry at the left node edge')));
                row.append(marker, element('span', String(Number(input.name.split('_').at(-1)) + 1)), content);
                list.append(row);
            }
            if (!inputs.length) list.append(element('p', toggle.value === 'enabled'
                ? 'Use the native entry input on the left node edge. A new socket appears after connection.'
                : 'Enable the stack to reveal ControlNet entry inputs on the left node edge.', 'help'));
            choices.append(
                element('p', 'Drag an external Control Entry output to a real socket on the left edge of this node. Entries apply in connection order. The rows below show socket status; they are not connection targets.', 'help'), list,
                element('p', 'Prepare the hint upstream: Canny for edges · Depth for structure · OpenPose for pose. Each external entry node sets strength and start/end. Match the hint dimensions to your generation canvas.', 'connection-note'),
                element('p', 'Qwen: Load Model Patch + prepared hint + VAE → Character Qwen 2.1 Control Entry → left-edge entry socket → controlnet_stack → Apply Character Model Controls. SD / SDXL: ControlNet + prepared hint → Character ControlNet Entry → left-edge entry socket → controlnet_stack → Apply Character ControlNets after text encoding. Use weights compatible with the selected model family.', 'connection-note'));
        } else {
            const fields = visibleFields(settings, catalog, group);
            if (group === 'Appearance') {
                const order = ['skin_tone', 'ethnicity', 'body_shape', 'muscle_tone', 'bust_size', 'expression'];
                fields.sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
            }
            for (const [name, field] of fields) {
                const section = element('section', undefined, 'field');
                section.dataset.field = name;
                if (['skin_tone', 'hair_color', 'eye_color'].includes(name)) section.className += ' swatches';
                if (['hair_finish', 'hair_volume', 'muscle_tone', 'bust_size', 'scene_detail'].includes(name)) section.className += ' compact';
                if (name === 'gender') section.className += ' gender-field';
                if (name === 'wardrobe_mode') section.className += ' segmented';
                if (name === 'background') section.className += ' scene-grid';
                if (name === 'life_stage' && widget('age')) {
                    section.append(element('h3', 'Age'));
                    section.append(element('p', field.description, 'help'));
                    const row = element('div', undefined, 'age-row');
                    const slider = element('input');
                    slider.type = 'range';
                    const number = element('input');
                    number.type = 'number';
                    for (const input of [slider, number]) {
                        input.min = '18'; input.max = '100'; input.step = '1';
                        input.value = String(settings.age);
                        input.disabled = Boolean(linked('age') || linked('character_code') || widget('character_code')?.value?.trim());
                    }
                    slider.setAttribute('aria-label', 'Age slider');
                    number.setAttribute('aria-label', 'Age in years');
                    const setAge = (raw) => {
                        skipChangeHighlight = false;
                        const age = clampAge(raw);
                        widget('age').value = age;
                        slider.value = number.value = String(age);
                        previewPrompt();
                        node.graph?.setDirtyCanvas(true, true);
                    };
                    slider.oninput = () => setAge(slider.value);
                    number.onchange = () => setAge(number.value);
                    number.onblur = () => setAge(number.value);
                    number.onkeydown = (event) => { if (event.key === 'Enter') setAge(number.value); };
                    const range = element('div', undefined, 'age-range');
                    const limits = element('div', undefined, 'range-limits');
                    limits.append(element('span', '18'), element('span', '100'));
                    range.append(slider, limits);
                    row.append(range, number);
                    section.append(row, element('p', 'Adults only · 18–100 years', 'age-caption'));
                    choices.append(section);
                    continue;
                }
                const fieldHeading = element('h3', field.label);
                fieldHeading.title = field.description ?? field.label;
                section.append(fieldHeading);
                if (field.description) {
                    const help = element('p', name === 'composition' ? 'Controls visual balance, spacing, color and mood within your chosen crop.' : field.description, 'help');
                    help.title = field.description;
                    help.setAttribute('aria-label', `${field.label} description`);
                    section.append(help);
                }
                const selectOption = (option) => {
                    skipChangeHighlight = ['none', 'unspecified'].includes(option.id);
                    if (name === 'gender') {
                        changeGender(node, option.id, catalog);
                        update();
                        return;
                    }
                    const input = widget(name);
                    input.value = option.id;
                    if (widget('clothing') && settings.clothing?.[name]) {
                        const clothing = JSON.parse(widget('clothing').value || '{}');
                        clothing[name].details = Object.fromEntries(Object.entries(clothing[name].details ?? {}).filter(([id]) => (field.option_details?.[option.id]?.details ?? option.details)?.includes(id)));
                        const modifiers = field.option_details?.[option.id]?.modifiers ?? option.modifiers ?? {};
                        for (const kind of Object.keys(catalog.clothing.modifiers ?? {})) {
                            if (!modifiers[kind]?.includes(clothing[name][kind])) delete clothing[name][kind];
                        }
                        widget('clothing').value = JSON.stringify(clothing);
                    }
                    if (['skin_tone', 'hair_color', 'eye_color'].includes(name) || !option.color_phrase) {
                        const colors = { ...settings.colors };
                        delete colors[name];
                        if (widget('colors')) widget('colors').value = JSON.stringify(colors);
                    }
                    input.callback?.(option.id);
                    update();
                    node.graph?.setDirtyCanvas(true, true);
                };
                let fieldSelect;
                if (group === 'Face & accessories' && name !== 'eyebrows') {
                    fieldSelect = element('select');
                    fieldSelect.setAttribute('aria-label', field.label);
                    fieldSelect.disabled = Boolean(!widget(name) || linked(name) || linked('character_code') || widget('character_code')?.value?.trim());
                    for (const option of optionSections(field, settings.gender).flatMap((section) => section.options)) {
                        if (option.nsfw && !catalog.allow_nsfw) continue;
                        const choice = element('option', option.id === settings[name] && settings.colors?.[name]
                            ? nearestColor(settings.colors[name], catalog.color_names) : option.label);
                        choice.value = option.id;
                        choice.title = field.option_details?.[option.id]?.description ?? option.phrase ?? option.label;
                        fieldSelect.append(choice);
                    }
                    fieldSelect.value = settings[name] ?? field.default;
                    fieldSelect.onchange = () => selectOption(field.options.find((option) => option.id === fieldSelect.value));
                    section.append(fieldSelect);
                } else {
                    const groups = optionSections(field, settings.gender);
                    const dividedRow = group === 'Clothing' && name !== 'wardrobe_mode';
                    const labels = new Map(groups.flatMap((section) => section.options.map((option) => [option.id, section.label])));
                    for (const optionGroup of dividedRow ? [{ options: groups.flatMap((section) => section.options) }] : groups) {
                        const collapsible = field.collapsible_sections || (name === 'hair_style' && optionGroup.label);
                        const optionContainer = collapsible ? element('details', undefined, 'option-section') : section;
                        if (collapsible) {
                            optionContainer.open = openGroups.get(`${name}:${optionGroup.label}`) ?? optionGroup.options.some((option) => option.id === (settings[name] ?? field.default));
                            optionContainer.ontoggle = () => openGroups.set(`${name}:${optionGroup.label}`, optionContainer.open);
                            optionContainer.append(element('summary', optionGroup.label));
                            section.append(optionContainer);
                        } else if (optionGroup.label) section.append(element('h4', optionGroup.label, 'option-heading'));
                        if (optionGroup.description) optionContainer.append(element('p', optionGroup.description, 'connection-note'));
                        const tiles = element('div', undefined, 'tiles');
                        let previousLabel;
                        for (const option of optionGroup.options) {
                            if (option.nsfw && !catalog.allow_nsfw) continue;
                            const label = labels.get(option.id);
                            if (dividedRow && label && label !== previousLabel) {
                                const divider = element('span', label, 'garment-divider');
                                divider.setAttribute('role', 'separator');
                                divider.setAttribute('aria-orientation', 'vertical');
                                divider.setAttribute('aria-label', label);
                                tiles.append(divider);
                                previousLabel = label;
                            }
                            const button = element('button', undefined, 'tile');
                            button.dataset.option = option.id;
                            button.setAttribute('aria-pressed', String((settings[name] ?? field.default) === option.id));
                            button.setAttribute('aria-label', `${field.label}: ${option.label}`);
                            button.title = field.option_details?.[option.id]?.description ?? (option.phrase || option.label);
                            const needsCoverage = !catalog.allow_nsfw && ['dress', 'upper_garment', 'lower_garment'].includes(name)
                                && !(option.covers?.length);
                            button.disabled = Boolean(!widget(name) || needsCoverage || linked(name) || linked('character_code') || widget('character_code')?.value?.trim());
                            if (needsCoverage) button.title = 'Requires allow_nsfw: true in local config.json';
                            const ink = name === 'hair_style'
                                ? settings.colors?.hair_color ?? catalog.fields.hair_color.options.find((item) => item.id === settings.hair_color)?.color
                                : option.color;
                            button.innerHTML = icon(name === 'gender' ? (option.id === 'woman' ? 'female' : 'male') : option.icon, ink);
                            if (name === 'background' && SCENE_ASSETS.includes(option.id)) {
                                const thumbnail = element('i', undefined, 'scene-thumb');
                                const index = SCENE_ASSETS.indexOf(option.id);
                                thumbnail.style.backgroundImage = `url("${new URL('./assets/scene-atlas.png', import.meta.url).href}")`;
                                thumbnail.style.backgroundPosition = `${(index % 5) * 25}% ${Math.floor(index / 5) * (100 / 3)}%`;
                                button.replaceChildren(thumbnail);
                            }
                            button.append(element('span', option.label));
                            button.onclick = () => selectOption(option);
                            tiles.append(button);
                        }
                        const limit = GRID_LIMITS[name];
                        const items = Array.from(tiles.children);
                        if (limit && items.length > limit) {
                            const key = `all:${name}`;
                            const visibleIds = items.slice(0, limit).map((tile) => tile.dataset.option);
                            const current = settings[name] ?? field.default;
                            if (!visibleIds.includes(current)) visibleIds[limit - 1] = current;
                            const more = element('button', undefined, 'show-more');
                            const show = () => {
                                const expanded = openGroups.get(key) ?? false;
                                for (const tile of items) {
                                    tile.hidden = !expanded && !visibleIds.includes(tile.dataset.option);
                                }
                                more.textContent = expanded ? 'Show fewer' : `Show all ${items.length}`;
                                more.setAttribute('aria-expanded', String(expanded));
                            };
                            more.onclick = () => { openGroups.set(key, !(openGroups.get(key) ?? false)); show(); };
                            show();
                            optionContainer.append(tiles, more);
                        } else optionContainer.append(tiles);
                    }
                }
                const selected = { ...field.options.find((option) => option.id === settings[name]), ...field.option_details?.[settings[name]] };
                const isGarment = catalog.clothing_fields?.includes(name);
                const materials = isGarment ? element('div', undefined, 'garment-materials') : section;
                if (isGarment) section.append(materials);
                if (selected.description) {
                    const help = element('p', `${selected.label}: ${selected.description.split(/(?<=\.)\s/)[0]}`, 'help selection-help');
                    help.title = selected.description;
                    help.setAttribute('aria-label', `${field.label} selected option explanation`);
                    section.append(help);
                }
                if (catalog.color_fields?.includes(name) && selected?.color_phrase && widget('colors')) {
                    if (fieldSelect) section.className += ' inline-color';
                    const row = element('div', undefined, 'color-row');
                    const picker = element('input');
                    picker.type = 'color';
                    picker.value = settings.colors?.[name] ?? selected.color ?? '#808080';
                    picker.setAttribute('aria-label', `${field.label} custom color`);
                    picker.title = 'Choose a custom color';
                    picker.disabled = Boolean(linked(name) || linked('colors') || linked('character_code') || widget('character_code')?.value?.trim());
                    const label = element('span', settings.colors?.[name] ?? 'Item color');
                    colorLabels.set(name, label);
                    const reset = element('button', 'Reset');
                    reset.setAttribute('aria-label', `Reset ${field.label} color`);
                    reset.disabled = picker.disabled || !settings.colors?.[name];
                    picker.oninput = () => {
                        skipChangeHighlight = false;
                        const colors = JSON.parse(widget('colors').value || '{}');
                        colors[name] = picker.value;
                        widget('colors').value = JSON.stringify(colors);
                        label.textContent = picker.value;
                        if (fieldSelect) {
                            const choice = Array.from(fieldSelect.children).find((option) => option.value === fieldSelect.value);
                            choice.textContent = nearestColor(picker.value, catalog.color_names);
                        }
                        reset.disabled = false;
                        renderAvatar();
                        previewPrompt();
                        node.graph?.setDirtyCanvas(true, true);
                    };
                    reset.onclick = () => {
                        skipChangeHighlight = true;
                        const colors = JSON.parse(widget('colors').value || '{}');
                        delete colors[name];
                        widget('colors').value = JSON.stringify(colors);
                        update();
                        node.graph?.setDirtyCanvas(true, true);
                    };
                    bindColorPopup(picker, reset, name);
                    row.append(picker, label, reset);
                    materials.append(row);
                }
                if (selected?.phrase && catalog.clothing && widget('clothing') && (catalog.clothing_fields ?? ['dress', 'upper_garment', 'lower_garment', 'outerwear', 'shoes', 'headwear']).includes(name)) {
                    const refinements = settings.clothing?.[name] ?? {};
                    const disabled = Boolean(linked(name) || linked('clothing') || linked('character_code') || widget('character_code')?.value?.trim());
                    const save = (patch) => {
                        skipChangeHighlight = Object.values(patch).includes('default');
                        const clothing = JSON.parse(widget('clothing').value || '{}');
                        clothing[name] = { ...clothing[name], ...patch };
                        if (patch.fabric && !catalog.clothing.fabric[patch.fabric].transparency) delete clothing[name].opacity;
                        if (patch.sleeve_length && !['default', 'long'].includes(patch.sleeve_length)) delete clothing[name].sleeve_roll;
                        widget('clothing').value = JSON.stringify(clothing);
                        update();
                        node.graph?.setDirtyCanvas(true, true);
                    };
                    for (const kind of ['fabric', 'texture']) {
                        const row = element('label', kind === 'fabric' ? 'Fabric / material' : 'Surface / texture', 'color-row');
                        const select = element('select');
                        select.setAttribute('aria-label', `${field.label} ${kind}`);
                        for (const [id, spec] of Object.entries(catalog.clothing[kind])) {
                            if (spec.nsfw && !catalog.allow_nsfw) continue;
                            const option = element('option', spec.label);
                            option.value = id;
                            option.title = spec.description;
                            select.append(option);
                        }
                        select.value = refinements[kind] ?? 'default';
                        select.title = catalog.clothing[kind][select.value].description;
                        row.title = select.title;
                        select.disabled = disabled;
                        select.onchange = () => save({ [kind]: select.value });
                        row.append(select);
                        materials.append(row);
                    }
                    const modifications = element('div', undefined, 'garment-modifiers');
                    for (const [kind, supported] of Object.entries(selected.modifiers ?? {})) {
                        if (kind === 'sleeve_roll' && !['default', 'long'].includes(refinements.sleeve_length ?? 'default')) continue;
                        const spec = catalog.clothing.modifiers[kind];
                        const row = element('label', undefined, 'garment-modifier');
                        row.append(element('span', spec.label));
                        const select = element('select');
                        select.setAttribute('aria-label', `${field.label} ${kind}`);
                        for (const id of ['default', ...supported]) {
                            const item = spec.options[id];
                            if (!catalog.allow_nsfw && (item.nsfw || ['open', 'unzipped'].includes(id) && ['upper_garment', 'dress'].includes(name))) continue;
                            const option = element('option', item.label);
                            option.value = id;
                            option.title = item.description;
                            select.append(option);
                        }
                        select.value = refinements[kind] ?? 'default';
                        select.title = spec.options[select.value].description;
                        row.title = select.title;
                        select.disabled = disabled;
                        select.onchange = () => save({ [kind]: select.value });
                        row.append(select);
                        modifications.append(row);
                    }
                    if (modifications.children.length) section.append(modifications);
                    if (catalog.clothing.fabric[refinements.fabric ?? 'default'].transparency) {
                        const row = element('label', 'Material opacity', 'garment-opacity');
                        row.title = '100% is fully opaque. Lower values describe increasing transparency; image models approximate these values.';
                        const slider = element('input');
                        slider.type = 'range'; slider.min = catalog.allow_nsfw ? '0' : '100'; slider.max = '100'; slider.step = '1';
                        slider.value = String(refinements.opacity ?? 100);
                        slider.setAttribute('aria-label', `${field.label} opacity`);
                        const number = element('input');
                        number.type = 'number'; number.min = slider.min; number.max = '100'; number.step = '1'; number.value = slider.value;
                        number.setAttribute('aria-label', `${field.label} opacity percent`);
                        slider.disabled = number.disabled = disabled || !catalog.allow_nsfw;
                        slider.oninput = () => {
                            number.value = slider.value;
                            const clothing = JSON.parse(widget('clothing').value || '{}');
                            clothing[name] = { ...clothing[name], opacity: Number(slider.value) };
                            widget('clothing').value = JSON.stringify(clothing);
                            renderAvatar(); previewPrompt();
                            node.graph?.setDirtyCanvas(true, true);
                        };
                        number.onchange = () => save({ opacity: Math.max(Number(slider.min), Math.min(100, Math.round(Number(number.value) || 0))) });
                        slider.onchange = () => save({ opacity: Number(slider.value) });
                        row.append(slider, number, element('span', '%'));
                        section.append(row);
                        if (!catalog.allow_nsfw) section.append(element('p', 'Transparency requires allow_nsfw: true in local config.json.', 'help'));
                    }
                    if (selected.details?.length) {
                        const detailsPanel = element('details');
                        detailsPanel.open = Boolean(Object.keys(refinements.details ?? {}).length);
                        const summary = element('summary', 'Garment details & accent colors');
                        summary.title = 'Enable decorative or functional details for this garment. Each enabled detail has its own accent color. Hover over a detail to learn what it adds.';
                        detailsPanel.append(summary);
                        for (const id of selected.details) {
                            const spec = catalog.clothing.details[id];
                            const row = element('label', undefined, 'color-row');
                            row.title = spec.description;
                            const check = element('input');
                            check.type = 'checkbox';
                            check.checked = Boolean(refinements.details?.[id]);
                            check.disabled = disabled;
                            check.setAttribute('aria-label', `${field.label}: ${spec.label}`);
                            check.title = spec.description;
                            const color = element('input');
                            color.type = 'color';
                            color.value = refinements.details?.[id] ?? '#e8d5a8';
                            color.disabled = disabled || !check.checked;
                            color.setAttribute('aria-label', `${field.label} ${spec.label} color`);
                            color.title = `Choose the accent color for ${spec.label.toLowerCase()}. ${spec.description}`;
                            const setDetail = () => {
                                skipChangeHighlight = !check.checked;
                                const current = JSON.parse(widget('clothing').value || '{}');
                                const details = { ...current[name]?.details };
                                if (check.checked) details[id] = color.value;
                                else delete details[id];
                                // Keep this panel open while adjusting several accents.
                                current[name] = { ...current[name], details };
                                widget('clothing').value = JSON.stringify(current);
                                color.disabled = disabled || !check.checked;
                                renderAvatar();
                                previewPrompt();
                                node.graph?.setDirtyCanvas(true, true);
                            };
                            check.onchange = color.oninput = setDetail;
                            const reset = { disabled: !check.checked, onclick: () => { check.checked = false; setDetail(); } };
                            bindColorPopup(color, reset, name, true);
                            row.append(check, element('span', spec.label), color);
                            detailsPanel.append(row);
                        }
                        section.append(detailsPanel);
                    }
                }
                choices.append(section);
            }
        }
        organizeFields(settings);
        choices.scrollTop = scrollTop;
        for (const section of choices.children) {
            const saved = fieldScroll.get(section.dataset?.field);
            const tiles = section.querySelector('.tiles');
            const details = section.querySelector('details');
            if (tiles && saved?.left !== undefined) tiles.scrollLeft = saved.left;
            if (details && saved?.detailsOpen !== undefined) details.open = saved.detailsOpen;
        }
        previewPrompt();
    }

    for (const name of groups) {
        const button = element('button');
        button.dataset.category = name;
        button.innerHTML = icon(NAV_ICONS[name]);
        button.append(element('span', name));
        button.onclick = () => { group = name; update(); choices.scrollTop = 0; };
        nav.append(button);
    }
    template.onchange = () => {
        skipChangeHighlight = false;
        const input = widget('template');
        input.value = template.value;
        input.callback?.(template.value);
        update();
    };
    importButton.onclick = async () => {
        try {
            const result = await resolve({ code: code.value.trim() });
            if (removed) return;
            skipChangeHighlight = false;
            applySettings(node, result.settings, catalog);
            delete node.properties.character_creator_character_id;
            update();
            setStatus('Character imported. Controls now contain its settings.');
        } catch (error) { if (!removed) setStatus(error.message, true); }
    };
    exportButton.onclick = async () => {
        try {
            const result = await resolve(payload());
            if (removed) return;
            code.value = result.code;
            setPrompt(result.prompt);
            setStatus('Character exported. The code contains character settings; graph connections remain in the workflow.');
        } catch (error) { if (!removed) setStatus(error.message, true); }
    };
    copyButton.onclick = async () => {
        try {
            if (!code.value.trim()) throw new Error('Export a character first.');
            await navigator.clipboard.writeText(code.value);
            setStatus('Character code copied.');
        } catch (error) {
            code.focus(); code.select();
            setStatus(`Select and copy the code: ${error.message}`, true);
        }
    };
    expandPrompt.onclick = () => {
        promptDialog.showModal();
        if (readerSettings().scroll_changes !== false) scrollPromptToChange(expandedPrompt, expandedMarks[0]);
    };
    closePrompt.onclick = () => promptDialog.close();
    copyPrompt.onclick = dialogCopyPrompt.onclick = async () => {
        try {
            if (!promptText) throw new Error('The prompt is not ready yet.');
            await navigator.clipboard.writeText(promptText);
            setStatus('Prompt copied.');
        } catch (error) {
            const target = promptDialog.open ? expandedPrompt : prompt;
            target.focus();
            const range = document.createRange();
            range.selectNodeContents(target);
            const selection = document.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            setStatus(`Select and copy the prompt: ${error.message}`, true);
        }
    };
    const domWidget = node.addDOMWidget('character_creator_panel', 'CHARACTER_CREATOR_PANEL', host,
        { serialize: false, getMinHeight: () => 540,
            onDraw: (widget) => { widget.width = node.size[0]; } });
    domWidget.serialize = false;
    domWidget.computeLayoutSize = () => ({ minWidth: 550, minHeight: 540 });
    node.resizable = true;
    normalizeAgeWidget(node);
    if (widget('age')) widget('age').serializeValue = () => normalizeAgeWidget(node);
    const nativeNames = new Set(['model', 'template', 'character_code', 'controlnets', 'colors', 'age', 'clothing', 'ethnicity', ...Object.keys(catalog.fields), ...Object.keys(catalog.extra_fields ?? {})]);
    const hiddenSize = () => [0, -4];
    const hiddenLayout = () => ({ minWidth: 0, minHeight: 0, maxHeight: 0 });
    const hideNativeWidgets = () => {
        for (const input of node.widgets ?? []) {
            if (!nativeNames.has(input.name)) continue;
            input.hidden = true;
            input.type = 'converted-widget';
            input.computeSize = hiddenSize;
            input.computeLayoutSize = hiddenLayout;
            if (input.inputEl) input.inputEl.style.display = 'none';
            if (input.element) input.element.style.display = 'none';
        }
    };
    hideNativeWidgets();
    const previousDrawBackground = node.onDrawBackground;
    node.onDrawBackground = function () {
        hideNativeWidgets();
        domWidget.width = this.size[0];
        return previousDrawBackground?.apply(this, arguments);
    };
    const previousConnectionsChange = node.onConnectionsChange;
    node.onConnectionsChange = function () {
        connectionLayout ??= [...this.size];
        const result = previousConnectionsChange?.apply(this, arguments);
        scheduleUpdate();
        return result;
    };
    const previousConfigure = node.onConfigure;
    node.onConfigure = function () {
        const result = previousConfigure?.apply(this, arguments);
        lastCharacterState = undefined;
        characterEdited = false;
        normalizeAgeWidget(node);
        hideNativeWidgets();
        domWidget.width = this.size[0];
        update();
        return result;
    };
    for (const input of node.widgets ?? []) {
        if (!nativeNames.has(input.name)) continue;
        const callback = input.callback;
        input.callback = function () {
            const result = callback?.apply(this, arguments);
            hideNativeWidgets();
            scheduleUpdate();
            return result;
        };
    }
    const onRemoved = node.onRemoved;
    node.onRemoved = function () {
        removed = true;
        revision++;
        clearTimeout(timer);
        clearTimeout(highlightTimer);
        if (connectionFrame !== undefined) cancelAnimationFrame(connectionFrame);
        connectionLayout = undefined;
        controller.abort();
        unsubscribeLibrary?.();
        if (promptDialog.open) promptDialog.close();
        if (charactersDialog.open) charactersDialog.close();
        if (modelDialog.open) modelDialog.close();
        if (colorDialog.open) colorDialog.close();
        return onRemoved?.apply(this, arguments);
    };
    node._characterCreatorRestoreLayout = () => {
        hideNativeWidgets();
        const savedSize = node._characterCreatorConfiguredSize ?? node.size;
        const hasSavedLayout = node._characterCreatorConfigured && node._characterCreatorConfiguredLayout === 1;
        const initialHeight = hasSavedLayout ? savedSize[1] : 960;
        node.setSize([Math.max(savedSize[0], hasSavedLayout ? 670 : 960), Math.max(initialHeight, node.computeSize()[1])]);
        node.properties.character_creator_layout_version = 1;
        domWidget.width = node.size[0];
    };
    node._characterCreatorRestoreLayout();
    update();
}

app.registerExtension({
    name: 'CharacterCreator.VisualEditor',
    beforeConfigureGraph(workflow) {
        savedLayouts.clear();
        pendingPanels.clear();
        for (const graph of [workflow, ...(workflow.definitions?.subgraphs ?? [])]) {
            const graphId = graph === workflow ? 'root' : graph.id;
            for (const node of graph.nodes ?? []) {
                if (node.type === 'CharacterCreator' && Array.isArray(node.size)) savedLayouts.set(`${graphId}:${node.id}`, {
                    size: [...node.size], version: node.properties?.character_creator_layout_version,
                });
            }
        }
    },
    loadedGraphNode(node) {
        if (node.comfyClass === 'CharacterCreator') pendingPanels.add(node._characterCreatorReady);
    },
    async afterConfigureGraph() {
        const panels = [...pendingPanels];
        pendingPanels.clear();
        for (const node of await Promise.all(panels)) node?._characterCreatorRestoreLayout();
        savedLayouts.clear();
    },
    setup() {
        api.addEventListener('execution_success', async ({ detail }) => {
            if (!editorCatalog || !detail.prompt_id) return;
            const completedAt = Date.now();
            try {
                let history;
                for (let attempt = 0; attempt < 3 && !history; attempt++) {
                    // Completion may arrive just before the queue publishes its history entry.
                    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
                    const response = await api.fetchApi(`/history/${encodeURIComponent(detail.prompt_id)}`);
                    if (!response.ok) throw new Error('Could not read completed generation history.');
                    history = (await response.json())[detail.prompt_id];
                }
                if (!history) return;
                await updateCharacterCovers(history, generationTime(history) || detail.timestamp || completedAt);
                thumbnailError = '';
            } catch (error) { thumbnailError = `Character cover could not be saved: ${error.message}`; }
        });
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== 'CharacterCreator') return;
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            this._characterCreatorConfigured = true;
            const graphId = this.graph?.rootGraph && this.graph.rootGraph !== this.graph ? this.graph.id : 'root';
            const saved = savedLayouts.get(`${graphId}:${arguments[0]?.id ?? this.id}`);
            this._characterCreatorConfiguredSize = [...(saved?.size ?? arguments[0]?.size ?? this.size)];
            this._characterCreatorConfiguredLayout = saved ? saved.version : (arguments[0]
                ? arguments[0].properties?.character_creator_layout_version : this.properties?.character_creator_layout_version);
            return onConfigure?.apply(this, arguments);
        };
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onCreated?.apply(this, arguments);
            this._characterCreatorReady = editorConfiguration().then((catalog) => {
                if (!this.graph) return;
                if (!this._characterCreatorConfigured) applySettings(this, catalog.characters[0].settings, catalog);
                mountPanel(this, catalog);
                return this;
            }).catch((error) => {
                this.addWidget('text', 'Character Creator error', error.message, () => {}, { serialize: false });
            });
            return result;
        };
    },
});
