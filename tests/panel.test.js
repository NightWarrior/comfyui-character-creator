import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { getLibrary } from '../web/library.js';

class Element {
    constructor(tag) {
        this.tag = tag;
        this.children = [];
        this.attributes = {};
        this.value = '';
        this.classes = new Set();
        this.dataset = {};
        this.style = { setProperty(name, value) { this[name] = value; } };
        this.classList = { toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name) };
    }
    get textContent() { return (this._text ?? '') + this.children.map((child) => child.textContent).join(''); }
    set textContent(value) { this._text = value; this.children = []; }
    append(...children) { this.children.push(...children); }
    scrollTo(options) { this.scrollOptions = options; }
    getBoundingClientRect() { return { top: 0 }; }
    get scrollTop() { return 0; }
    set scrollTop(value) { this.scrolledTo = value; }
    get clientHeight() { return 150; }
    replaceChildren(...children) { this.children = children; }
    replaceChild(replacement, original) { this.children[this.children.indexOf(original)] = replacement; }
    setAttribute(name, value) { this.attributes[name] = value; }
    attachShadow() { this.shadow = new Element('shadow'); return this.shadow; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    focus() { this.focused = true; }
    select() {}
    getContext() { return { drawImage() {} }; }
    toDataURL() { return 'data:image/webp;base64,DDDD'; }
}

function find(root, predicate) {
    if (predicate(root)) return root;
    for (const child of root.children) {
        const result = find(child, predicate);
        if (result) return result;
    }
}

test('panel mounts on the node, edits native widgets, restores settings and disposes pending work', async (context) => {
    const catalog = JSON.parse(readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
    catalog.characters = JSON.parse(readFileSync(new URL('../web/characters.json', import.meta.url), 'utf8'));
    const settings = { model: 'qwen_image_2_1', template: 'character', ...Object.fromEntries(Object.entries(catalog.fields).map(([key, field]) => [key, field.default])) };
    let extension;
    let requests = 0;
    let resolvedPrompt = 'A character prompt.';
    let recentHistory = {};
    const originalDocument = globalThis.document;
    const originalAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (callback) => queueMicrotask(callback);
    const originalImage = globalThis.Image;
    globalThis.Image = class { naturalWidth = 1024; naturalHeight = 1024; async decode() {} };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => structuredClone(catalog.characters) });
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const copied = [];
    Object.defineProperty(globalThis, 'navigator', { configurable: true,
        value: { clipboard: { async writeText(value) { copied.push(value); } } } });
    globalThis.document = { createElement: (tag) => new Element(tag),
        createTextNode: (text) => { const node = new Element('#text'); node.textContent = text; return node; } };
    globalThis.__characterTestApp = { registerExtension(value) { extension = value; } };
    globalThis.__characterTestApi = {
        apiURL: (path) => path,
        async fetchApi(path, options = {}) {
            requests++;
            if (path.startsWith('/history')) return { ok: true, json: async () => recentHistory };
            const payload = options.body ? JSON.parse(options.body) : null;
            const data = path.endsWith('/catalog') ? { ...catalog, allow_nsfw: false,
                models: { qwen_image_2_1: 'Qwen Image 2.1', sdxl: 'SDXL', sd: 'Stable Diffusion 1.5' },
                color_fields: Object.keys({ ...catalog.fields, ...catalog.extra_fields }).filter((key) => ({ ...catalog.fields, ...catalog.extra_fields })[key].options.some((option) => option.color_phrase)),
                clothing_fields: ['dress', 'upper_garment', 'lower_garment', 'outerwear', 'shoes', 'headwear', 'gloves'] } : {
                settings: payload.settings ?? { ...settings, hair_style: 'bob' },
                prompt: resolvedPrompt, code: 'CC1.test',
            };
            return { ok: true, async json() { return data; } };
        },
    };
    let source = readFileSync(new URL('../web/character_creator.js', import.meta.url), 'utf8');
    source = source.replace("import { app } from '../../../scripts/app.js';", 'const app = globalThis.__characterTestApp;')
        .replace("import { api } from '../../../scripts/api.js';", 'const api = globalThis.__characterTestApi;')
        .replace("'./icons.js'", JSON.stringify(new URL('../web/icons.js', import.meta.url).href))
        .replace("'./state.js'", JSON.stringify(new URL('../web/state.js', import.meta.url).href))
        .replace("'./prompt.js'", JSON.stringify(new URL('../web/prompt.js', import.meta.url).href))
        .replace("'./library.js'", JSON.stringify(new URL('../web/library.js', import.meta.url).href))
        .replace("'./colors.js'", JSON.stringify(new URL('../web/colors.js', import.meta.url).href))
        .replaceAll('import.meta.url', JSON.stringify(new URL('../web/character_creator.js', import.meta.url).href));
    let node;
    try {
        await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
        class Node {
            constructor() {
                this.widgets = [...Object.entries(settings).map(([name, value]) => ({ name, value, callback() {} })),
                    { name: 'character_code', value: '', callback() {} }, { name: 'controlnets', value: 'disabled', callback() {} },
                    { name: 'colors', value: '{}', callback() {} }, { name: 'age', value: 30, callback() {} }, { name: 'clothing', value: '{}', callback() {} }, { name: 'ethnicity', value: 'unspecified', callback() {} }, ...Object.entries(catalog.extra_fields).map(([name, field]) => ({ name, value: field.default, callback() {} }))];
                this.inputs = [];
                this.graph = { setDirtyCanvas() {} };
                this.size = [400, 600];
                this.resizable = false;
                this.resizeCalls = [];
            }
            addDOMWidget(name, type, host, options) {
                this.panel = host;
                this.panelWidget = { name, type, options, value: '' };
                this.widgets.push(this.panelWidget);
                return this.panelWidget;
            }
            computeSize() { return [670, 650]; }
            onResize(size) { this.resizeCalls.push([...size]); }
            onConnectionsChange() { if (this.simulateConnectionResize) requestAnimationFrame(() => this.setSize([670, 650])); }
            setSize(size) { this.size = size; this.onResize?.(size); }
        }
        await extension.beforeRegisterNodeDef(Node, { name: 'CharacterCreator' });
        node = new Node();
        node.onConfigure();
        const originalWidgetCount = node.widgets.length;
        const originalWidgetValues = node.widgets.map((widget) => widget.value);
        node.widgets.find((widget) => widget.name === 'character_code').inputEl = { style: {} };
        node.onNodeCreated();
        await setImmediate();
        assert.ok(node.panel?.shadow);
        assert.equal(node.widgets.length, originalWidgetCount + 1);
        assert.equal(node.panelWidget.serialize, false);
        const nativeWidgets = node.widgets.filter((widget) => widget.serialize !== false);
        assert.deepEqual(nativeWidgets.map((widget) => widget.value), originalWidgetValues);
        assert.ok(nativeWidgets.every((widget) => widget.hidden && widget.type === 'converted-widget'));
        assert.ok(nativeWidgets.every((widget) => widget.computeSize()[1] < 0));
        assert.ok(nativeWidgets.every((widget) => widget.computeLayoutSize().maxHeight === 0));
        const recreatedWidget = nativeWidgets[0];
        recreatedWidget.hidden = false;
        recreatedWidget.type = 'combo';
        recreatedWidget.computeLayoutSize = () => ({ minHeight: 30 });
        node.onDrawBackground();
        assert.equal(recreatedWidget.hidden, true);
        assert.equal(recreatedWidget.computeLayoutSize().maxHeight, 0);
        assert.equal(node.widgets.find((widget) => widget.name === 'character_code').inputEl.style.display, 'none');
        assert.equal(node.panelWidget.computeSize, undefined);
        assert.equal(node.panelWidget.options.getMinHeight(), 540);
        assert.deepEqual(node.panelWidget.computeLayoutSize(), { minWidth: 550, minHeight: 540 });
        assert.equal(node.resizable, true);
        assert.equal(node.size[1], 800);
        assert.equal(node.panelWidget.width, node.size[0]);
        node.panelWidget.width = 400;
        node.setSize([900, 1100]);
        node.panelWidget.options.onDraw(node.panelWidget);
        assert.equal(node.panelWidget.width, 900);
        assert.deepEqual(node.resizeCalls.at(-1), [900, 1100]);
        node.setSize([720, 1100]);
        node.panelWidget.options.onDraw(node.panelWidget);
        assert.equal(node.panelWidget.width, 720);
        node.setSize([900, 1100]);
        node.panelWidget.width = 400;
        node.onConfigure();
        assert.equal(node.panelWidget.width, 900);
        assert.deepEqual(node.size, [900, 1100]);
        assert.equal(node.panelWidget.computeLayoutSize().maxHeight, undefined);
        const root = node.panel.shadow;
        const familyButton = find(root, (item) => item.attributes['aria-label'] === 'Select model family');
        familyButton.onclick();
        const familyDialog = find(root, (item) => item.attributes['aria-label'] === 'Model families');
        assert.equal(familyDialog.open, true);
        assert.equal(find(familyDialog, (item) => item.attributes['aria-label'] === 'Model family: FLUX').disabled, true);
        for (const [label, id] of [['SDXL', 'sdxl'], ['Stable Diffusion 1.5', 'sd'], ['Qwen Image 2.1', 'qwen_image_2_1']]) {
            familyButton.onclick();
            const choice = find(familyDialog, (item) => item.attributes['aria-label'] === `Model family: ${label}`);
            assert.equal(choice.disabled, false);
            choice.onclick();
            assert.equal(node.widgets.find((widget) => widget.name === 'model').value, id);
            assert.equal(familyButton.textContent, label.toUpperCase());
            assert.equal(familyDialog.open, false);
        }
        familyButton.onclick();
        familyDialog.getBoundingClientRect = () => ({ left: 100, top: 100, right: 600, bottom: 500 });
        const familyBackdrop = { target: familyDialog, clientX: 50, clientY: 50 };
        familyDialog.onpointerdown(familyBackdrop); familyDialog.onclick(familyBackdrop);
        assert.equal(familyDialog.open, false);
        const navigation = find(root, (item) => item.tag === 'nav');
        for (const button of navigation.children) {
            node.panelWidget.width = 400;
            button.onclick();
            // ComfyUI draws the widget before positioning its DOM overlay.
            node.panelWidget.options.onDraw(node.panelWidget);
            assert.equal(node.panelWidget.width, 900, button.textContent);
            assert.deepEqual(node.size, [900, 1100]);
        }
        assert.ok(!find(find(root, (item) => item.tag === 'header'), (item) => item.attributes['aria-label'] === 'Prompt template'));
        find(root, (item) => item.tag === 'button' && item.textContent === 'Settings').onclick();
        const templateSelect = find(root, (item) => item.attributes['aria-label'] === 'Prompt template');
        assert.equal(templateSelect.children.length, 5);
        templateSelect.value = 'outfit'; templateSelect.onchange();
        assert.equal(node.widgets.find((widget) => widget.name === 'template').value, 'outfit');
        assert.match(find(root, (item) => item.attributes['aria-label'] === 'Selected prompt template explanation').textContent, /clothing before hair/);
        templateSelect.value = 'face'; templateSelect.onchange();
        assert.match(find(root, (item) => item.attributes['aria-label'] === 'Selected prompt template explanation').textContent, /does not change the crop/);
        templateSelect.value = 'character'; templateSelect.onchange();
        find(root, (item) => item.tag === 'button' && item.textContent === 'Identity').onclick();

        const ageSlider = find(root, (item) => item.attributes['aria-label'] === 'Age slider');
        const ageNumber = find(root, (item) => item.attributes['aria-label'] === 'Age in years');
        assert.equal(ageSlider.type, 'range');
        assert.equal(ageNumber.type, 'number');
        assert.equal(ageSlider.min, '18');
        assert.equal(ageSlider.max, '100');
        ageSlider.value = '57'; ageSlider.oninput();
        assert.equal(ageNumber.value, '57');
        assert.equal(node.widgets.find((widget) => widget.name === 'age').value, 57);
        ageNumber.value = '14'; ageNumber.onchange();
        assert.equal(ageSlider.value, '18');
        assert.equal(ageNumber.value, '18');
        ageNumber.value = '101'; ageNumber.onblur();
        assert.equal(ageNumber.value, '100');
        ageNumber.value = '15'; ageNumber.onkeydown({ key: 'Enter' });
        assert.equal(ageNumber.value, '18');
        find(root, (item) => item.tag === 'button' && item.textContent === 'Appearance').onclick();
        const previousHair = node.widgets.find((widget) => widget.name === 'hair_style').value;
        const previousSkin = node.widgets.find((widget) => widget.name === 'skin_tone').value;
        find(root, (item) => item.attributes['aria-label'] === 'Ethnicity / heritage: Pakistani').onclick();
        assert.equal(node.widgets.find((widget) => widget.name === 'ethnicity').value, 'pakistani');
        const region = find(root, (item) => item.tag === 'details' && item.children.some((child) => child.tag === 'summary' && child.textContent === 'Asia · South Asia'));
        assert.equal(region.open, true);
        const africa = find(root, (item) => item.tag === 'details' && item.children.some((child) => child.tag === 'summary' && child.textContent === 'Africa'));
        assert.equal(africa.open, false);

        assert.equal(node.widgets.find((widget) => widget.name === 'hair_style').value, previousHair);
        assert.equal(node.widgets.find((widget) => widget.name === 'skin_tone').value, previousSkin);
        find(root, (item) => item.tag === 'button' && item.textContent === 'Identity').onclick();
        find(root, (item) => item.attributes['aria-label'] === 'Gender: Male').onclick();
        assert.equal(node.widgets.find((widget) => widget.name === 'gender').value, 'man');
        assert.equal(node.widgets.find((widget) => widget.name === 'hair_style').value, 'crew_cut');
        find(root, (item) => item.tag === 'button' && item.textContent === 'Hair').onclick();
        assert.ok(find(root, (item) => item.attributes['aria-label'] === 'Hair style: Crew cut'));
        assert.ok(find(root, (item) => item.tag === 'summary' && item.textContent === 'Classic cuts'));
        assert.ok(find(root, (item) => item.tag === 'summary' && item.textContent === 'Braids, locs & protective styles'));
        assert.match(find(root, (item) => item.attributes['aria-label'] === 'Hair style: Crew cut').innerHTML, /data-icon-face="true"/);

        assert.ok(!find(root, (item) => item.attributes['aria-label'] === 'Hair style: Bob'));
        find(root, (item) => item.attributes['aria-label'] === 'Hair finish: Messy').onclick();
        assert.equal(node.widgets.find((widget) => widget.name === 'hair_finish').value, 'messy');
        find(root, (item) => item.tag === 'button' && item.textContent === 'Face & accessories').onclick();
        const earrings = find(root, (item) => item.attributes['aria-label'] === 'Earrings');
        earrings.value = 'hoops'; earrings.onchange();
        assert.equal(node.widgets.find((widget) => widget.name === 'earrings').value, 'hoops');
        const eyeColor = find(root, (item) => item.attributes['aria-label'] === 'Eye color');
        eyeColor.value = 'green'; eyeColor.onchange();
        assert.ok(find(root, (item) => item.attributes['aria-label'] === 'Eye color custom color'));
        node.inputs = [{ widget: { name: 'eye_color' }, link: 91 }];
        node.onConnectionsChange(); await setImmediate();
        assert.equal(find(root, (item) => item.attributes['aria-label'] === 'Eye color').disabled, true);
        node.inputs = [];
        node.onConnectionsChange(); await setImmediate();
        assert.equal(find(root, (item) => item.attributes['aria-label'] === 'Eye color').disabled, false);
        find(root, (item) => item.tag === 'button' && item.textContent === 'Identity').onclick();
        find(root, (item) => item.attributes['aria-label'] === 'Gender: Female').onclick();
        find(root, (item) => item.tag === 'button' && item.textContent === 'Clothing').onclick();
        find(root, (item) => item.attributes['aria-label'] === 'Gloves: Leather gloves').onclick();
        assert.equal(node.widgets.find((widget) => widget.name === 'gloves').value, 'leather');
        assert.ok(find(root, (item) => item.attributes['aria-label'] === 'Gloves custom color'));
        const none = find(root, (item) => item.attributes['aria-label'] === 'Upper garment: None');
        assert.equal(none.disabled, true);
        find(root, (item) => item.attributes['aria-label'] === 'Outfit construction: Dress / one piece').onclick();
        assert.equal(node.widgets.find((widget) => widget.name === 'wardrobe_mode').value, 'dress');
        assert.ok(find(root, (item) => item.attributes['aria-label'] === 'Dress / one piece: Day dress'));
        assert.ok(!find(root, (item) => item.attributes['aria-label'] === 'Upper garment: T-shirt'));
        const picker = find(root, (item) => item.attributes['aria-label'] === 'Dress / one piece custom color');
        assert.equal(picker.type, 'color');
        picker.value = '#ff0000';
        picker.oninput();
        assert.deepEqual(JSON.parse(node.widgets.find((widget) => widget.name === 'colors').value), { dress: '#ff0000' });
        find(root, (item) => item.attributes['aria-label'] === 'Reset Dress / one piece color').onclick();
        assert.equal(node.widgets.find((widget) => widget.name === 'colors').value, '{}');
        const fabric = find(root, (item) => item.attributes['aria-label'] === 'Dress / one piece fabric');
        fabric.value = 'velvet'; fabric.onchange();
        const texture = find(root, (item) => item.attributes['aria-label'] === 'Dress / one piece texture');
        texture.value = 'jacquard'; texture.onchange();
        const embroidery = find(root, (item) => item.attributes['aria-label'] === 'Dress / one piece: Embroidery');
        embroidery.checked = true; embroidery.onchange();
        const accent = find(root, (item) => item.attributes['aria-label'] === 'Dress / one piece Embroidery color');
        accent.value = '#ff0000'; accent.oninput();
        assert.deepEqual(JSON.parse(node.widgets.find((widget) => widget.name === 'clothing').value), {
            dress: { fabric: 'velvet', texture: 'jacquard', details: { embroidery: '#ff0000' } },
        });
        // The custom picker updates the same native color widget, without a browser color dialog.
        const popupPicker = find(root, (item) => item.attributes['aria-label'] === 'Dress / one piece custom color');
        popupPicker.getBoundingClientRect = () => ({ left: 900, top: 650, right: 930, bottom: 680, width: 30, height: 30 });
        const colorDialog = find(root, (item) => item.attributes['aria-label'] === 'Choose color');
        colorDialog.getBoundingClientRect = () => ({ left: 0, top: 0, right: 290, bottom: 430, width: 290, height: 430 });
        popupPicker.onclick({ preventDefault() {} });
        assert.equal(colorDialog.open, true);
        assert.equal(colorDialog.style.left, '722px');
        assert.equal(colorDialog.style.top, '326px');
        const hexColor = find(colorDialog, (item) => item.attributes['aria-label'] === 'Hex color');
        hexColor.value = '#22aa66'; hexColor.oninput();
        assert.equal(find(colorDialog, (item) => item.textContent === 'Reset').disabled, false);
        assert.equal(JSON.parse(node.widgets.find((widget) => widget.name === 'colors').value).dress, '#22aa66');
        hexColor.value = '#22'; hexColor.oninput();
        assert.equal(JSON.parse(node.widgets.find((widget) => widget.name === 'colors').value).dress, '#22aa66');
        find(colorDialog, (item) => item.textContent === 'Done').onclick();
        assert.equal(colorDialog.open, false);
        find(root, (item) => item.tag === 'button' && item.textContent === 'ControlNet').onclick();
        node.inputs = [
            { name: 'controlnets.entries.entry_0', link: 42 },
            { name: 'controlnets.entries.entry_1', link: null },
        ];
        node.graph.links = { 42: { origin_id: 7 } };
        node.graph.getNodeById = () => ({ title: 'Prepared depth entry' });
        const connectionSize = [...node.size];
        node.simulateConnectionResize = true;
        node.onConnectionsChange(); await setImmediate();
        assert.deepEqual(node.size, connectionSize);
        node.simulateConnectionResize = false;
        const connections = find(root, (item) => item.attributes['aria-label'] === 'ControlNet input connections');
        assert.equal(connections.children.length, 2);
        assert.match(connections.textContent, /Connected.*entry_0.*Prepared depth entry/);
        assert.match(connections.textContent, /Empty socket.*entry_1/);
        node.inputs[0].link = null;
        node.onConnectionsChange(); await setImmediate();
        assert.ok(!find(root, (item) => item.attributes['aria-label'] === 'ControlNet input connections').textContent.includes('Connected'));
        node.inputs = [
            { name: 'controlnets.entries.entry_10', link: null },
            { name: 'controlnets.entries.entry_2', link: null },
            { name: 'controlnets.entries.entry_0', link: null },
        ];
        node.onConnectionsChange(); await setImmediate();
        const ordered = find(root, (item) => item.attributes['aria-label'] === 'ControlNet input connections').children;
        assert.match(ordered[0].textContent, /entry_0/);
        assert.match(ordered[1].textContent, /entry_2/);
        assert.match(ordered[2].textContent, /entry_10/);
        node.inputs = [];
        find(root, (item) => item.tag === 'button' && item.textContent === 'Scene').onclick();
        const backgrounds = find(root, (item) => item.dataset.field === 'background');
        const gridTiles = find(backgrounds, (item) => item.className === 'tiles');
        assert.equal(gridTiles.children.filter((item) => !item.hidden).length, 8);
        const showAll = find(backgrounds, (item) => item.className === 'show-more');
        showAll.onclick();
        assert.ok(gridTiles.children.every((item) => !item.hidden));
        showAll.onclick();
        assert.equal(gridTiles.children.filter((item) => !item.hidden).length, 8);
        find(root, (item) => item.tag === 'button' && item.textContent === 'Clothing').onclick();
        const shareBox = find(root, (item) => item.attributes['aria-label'] === 'Shareable character code');
        shareBox.value = 'CC1.import';
        await find(root, (item) => item.tag === 'button' && item.textContent === 'Import').onclick();
        assert.equal(node.widgets.find((widget) => widget.name === 'hair_style').value, 'bob');
        assert.equal(node.widgets.find((widget) => widget.name === 'character_code').value, '');
        await find(root, (item) => item.tag === 'button' && item.textContent === 'Export').onclick();
        assert.equal(shareBox.value, 'CC1.test');
        const promptBox = find(root, (item) => item.attributes['aria-label'] === 'Prompt preview');
        const expandedPrompt = find(root, (item) => item.attributes['aria-label'] === 'Expanded prompt');
        assert.equal(promptBox.attributes['aria-readonly'], 'true');
        assert.equal(promptBox.textContent, 'A character prompt.');
        assert.equal(expandedPrompt.textContent, promptBox.textContent);
        find(root, (item) => item.tag === 'button' && item.textContent === 'Expand').onclick();
        const dialog = find(root, (item) => item.tag === 'dialog');
        assert.equal(dialog.open, true);
        await find(root, (item) => item.tag === 'button' && item.textContent === 'Copy prompt').onclick();
        assert.equal(copied.at(-1), 'A character prompt.');
        find(root, (item) => item.tag === 'button' && item.textContent === 'Close').onclick();
        assert.equal(dialog.open, false);
        context.mock.timers.enable({ apis: ['setTimeout'] });
        try {
            const refreshPrompt = async (text) => {
                resolvedPrompt = text;
                node.widgets.find((widget) => widget.name === 'age').callback();
                await setImmediate();
                context.mock.timers.tick(180);
                await setImmediate();
            };
            await refreshPrompt('A character with red hair prompt.');
            const mark = promptBox.children.find((item) => item.tag === 'mark');
            assert.equal(mark.textContent, 'with red hair');
            assert.equal(mark.className, 'prompt-change');
            assert.equal(promptBox.scrollOptions.behavior, 'smooth');
            find(root, (item) => item.tag === 'button' && item.textContent === 'Expand').onclick();
            assert.equal(expandedPrompt.scrollOptions.behavior, 'smooth');
            await find(root, (item) => item.tag === 'button' && item.textContent === 'Copy prompt').onclick();
            assert.equal(copied.at(-1), resolvedPrompt);
            context.mock.timers.tick(3000);
            assert.equal(mark.className, 'prompt-change');
            context.mock.timers.tick(400);
            assert.equal(mark.className, '');
            assert.equal(promptBox.textContent, resolvedPrompt);
            await refreshPrompt('A character with blue hair prompt.');
            assert.equal(promptBox.children.find((item) => item.tag === 'mark').textContent, 'blue');
            await refreshPrompt('A character prompt.');
            assert.ok(!promptBox.children.some((item) => item.tag === 'mark'));
            // Removing a setting suppresses highlights even when the resulting prose adds replacement wording.
            resolvedPrompt = 'A character with bare hands prompt.';
            find(root, (item) => item.attributes['aria-label'] === 'Gloves: None').onclick();
            await setImmediate();
            context.mock.timers.tick(180);
            await setImmediate();
            assert.equal(promptBox.textContent, resolvedPrompt);
            assert.ok(!promptBox.children.some((item) => item.tag === 'mark'));
            find(root, (item) => item.tag === 'button' && item.textContent === 'Settings').onclick();
            let autoScroll = find(root, (item) => item.attributes['aria-label'] === 'Auto-scroll to changes');
            autoScroll.checked = false; autoScroll.onchange();
            promptBox.scrollOptions = null;
            await refreshPrompt('A character with black hair prompt.');
            assert.ok(promptBox.children.some((item) => item.className === 'prompt-change'));
            assert.equal(promptBox.scrollOptions, null);
            let highlight = find(root, (item) => item.attributes['aria-label'] === 'Highlight prompt changes');
            highlight.checked = false; highlight.onchange();
            assert.ok(!promptBox.children.some((item) => item.className === 'prompt-change'));
            assert.equal(find(root, (item) => item.attributes['aria-label'] === 'Auto-scroll to changes').disabled, true);
            await refreshPrompt('A character with green hair prompt.');
            assert.ok(!promptBox.children.some((item) => item.tag === 'mark'));
            assert.deepEqual(node.properties.character_creator_ui, { scroll_changes: false, highlight_changes: false });
            highlight = find(root, (item) => item.attributes['aria-label'] === 'Highlight prompt changes');
            highlight.checked = true; highlight.onchange();
            autoScroll = find(root, (item) => item.attributes['aria-label'] === 'Auto-scroll to changes');
            autoScroll.checked = true; autoScroll.onchange();
            find(root, (item) => item.tag === 'button' && item.textContent === 'Clothing').onclick();
            find(root, (item) => item.tag === 'button' && item.textContent === 'Close').onclick();
        } finally { context.mock.timers.reset(); }

        node.widgets.find((widget) => widget.name === 'wardrobe_mode').value = 'dress';
        const ageWidget = node.widgets.find((widget) => widget.name === 'age');
        ageWidget.value = '';
        node.onConfigure();
        assert.equal(ageWidget.value, 30);
        assert.equal(ageWidget.serializeValue(), 30);
        ageWidget.value = '64';
        assert.equal(ageWidget.serializeValue(), 64);
        assert.equal(ageWidget.value, 64);
        const saved = Object.fromEntries(node.widgets.filter((widget) => widget.serialize !== false).map((widget) => [widget.name, widget.value]));
        assert.equal(saved.age, 64);
        assert.ok(!Object.hasOwn(saved, 'character_creator_panel'));
        assert.ok(nativeWidgets.every((widget) => widget.hidden));
        assert.ok(find(root, (item) => item.attributes['aria-label'] === 'Dress / one piece: Day dress'));
        find(root, (item) => item.tag === 'button' && item.textContent === 'ControlNet').onclick();
        const toggle = find(root, (item) => item.attributes['aria-label'] === 'Enable ControlNet stack');
        toggle.value = 'enabled';
        toggle.onchange();
        assert.equal(node.widgets.find((widget) => widget.name === 'controlnets').value, 'enabled');
        const rail = find(root, (item) => item.tag === 'nav');
        const railNames = rail.children.map((item) => item.textContent);
        assert.ok(!railNames.includes('About & support'));
        assert.equal(find(root, (item) => item.className === 'support-card'), undefined);
        find(root, (item) => item.tag === 'button' && item.textContent === 'Settings').onclick();
        const supportSection = find(root, (item) => item.className === 'support-section');
        assert.equal(supportSection.tag, 'details');
        assert.equal(supportSection.open, false);
        assert.equal(supportSection.children[0].textContent, 'About & Support');
        assert.equal(find(supportSection, (item) => item.tag === 'h3').textContent, 'Made for your imagination.');
        assert.equal(find(supportSection, (item) => item.tag === 'p').textContent, 'Enjoying Character Creator? Your support helps me improve the node, explore new features, and keep development going.');
        const supportLink = find(supportSection, (item) => item.tag === 'a');
        assert.equal(supportLink.textContent, 'Support Development on Patreon');
        assert.equal(supportLink.href, 'https://patreon.com/NightWarrior');
        assert.equal(supportLink.target, '_blank');
        assert.equal(supportLink.rel, 'noopener noreferrer');
        assert.equal(supportLink.onclick, undefined);
        const githubLink = find(supportSection, (item) => item.textContent === 'View on GitHub');
        assert.equal(githubLink.tag, 'a');
        assert.equal(githubLink.href, 'https://github.com/NightWarrior/comfyui-character-creator');
        assert.equal(githubLink.target, '_blank');
        assert.equal(githubLink.rel, 'noopener noreferrer');
        assert.equal(find(supportSection, (item) => item.className === 'support-credit').textContent, 'Character Creator by NightWarrior · Built for ComfyUI');
        supportSection.open = true; supportSection.ontoggle();
        node.onConfigure();
        assert.equal(find(root, (item) => item.className === 'support-section').open, true);
        assert.ok(find(root, (item) => item.attributes['aria-label'] === 'Prompt template'));
        assert.ok(find(root, (item) => item.attributes['aria-label'] === 'Highlight prompt changes'));
        find(root, (item) => item.tag === 'button' && item.textContent === 'Identity').onclick();
        assert.equal(find(root, (item) => item.className === 'support-card'), undefined);
        await find(root, (item) => item.tag === 'button' && item.textContent === 'Characters').onclick();
        const libraryDialog = find(root, (item) => item.tag === 'dialog' && item.attributes['aria-label'] === 'Characters');
        const grid = find(root, (item) => item.className === 'library-grid');
        assert.equal(libraryDialog.open, true);
        libraryDialog.getBoundingClientRect = () => ({ left: 100, top: 100, right: 800, bottom: 600 });
        const insideDialog = { target: libraryDialog, clientX: 110, clientY: 110 };
        const outsideDialog = { target: libraryDialog, clientX: 50, clientY: 50 };
        libraryDialog.onpointerdown(insideDialog);
        libraryDialog.onclick(insideDialog);
        assert.equal(libraryDialog.open, true);
        libraryDialog.onpointerdown(insideDialog);
        libraryDialog.onclick(outsideDialog);
        assert.equal(libraryDialog.open, true);
        const insideCard = { target: grid, clientX: 200, clientY: 200 };
        libraryDialog.onpointerdown(insideCard);
        libraryDialog.onclick(insideCard);
        assert.equal(libraryDialog.open, true);
        libraryDialog.onpointerdown(outsideDialog);
        libraryDialog.onclick(outsideDialog);
        assert.equal(libraryDialog.open, false);
        await find(root, (item) => item.tag === 'button' && item.textContent === 'Characters').onclick();
        assert.equal(libraryDialog.open, true);
        assert.equal(grid.children.length, 4);
        assert.equal(grid.children.at(-1).attributes['aria-label'], 'Create new character');
        await grid.children[0].onclick();
        getLibrary(catalog).setImage('scarlet', 'data:image/webp;base64,AAAA', 100);
        assert.equal(find(root, (item) => item.className === 'preview').children[0].children[0].src, 'data:image/webp;base64,AAAA');
        getLibrary(catalog).setImage('scarlet', 'data:image/webp;base64,BBBB', 200);
        assert.equal(find(root, (item) => item.className === 'preview').children[0].children[0].src, 'data:image/webp;base64,BBBB');
        assert.equal(find(grid.children[0], (item) => item.tag === 'img').src, 'data:image/webp;base64,BBBB');
        recentHistory = { completed: {
            prompt: [0, 'completed', {
                1: { class_type: 'CharacterCreator', inputs: {} },
                2: { class_type: 'TextEncodeQwenImage21', inputs: { prompt: ['1', 0] } },
                3: { class_type: 'SaveImage', inputs: { images: ['2', 0] } },
            }, { extra_pnginfo: { workflow: { nodes: [{ id: 1, properties: { character_creator_character_id: 'scarlet' } }] } } }],
            outputs: { 3: { images: [{ filename: 'newer.png', type: 'output' }] } },
            status: { messages: [['execution_success', { timestamp: 300 }]] },
        } };
        find(libraryDialog, (item) => item.tag === 'button' && item.textContent === 'Close').onclick();
        await find(root, (item) => item.tag === 'button' && item.textContent === 'Characters').onclick();
        assert.equal(getLibrary(catalog).characters.find((row) => row.id === 'scarlet').image_time, 300);
        assert.equal(find(grid.children[0], (item) => item.tag === 'img').src, 'data:image/webp;base64,DDDD');
        assert.equal(find(root, (item) => item.className === 'preview').children[0].children[0].src, 'data:image/webp;base64,DDDD');
        recentHistory = {};
        assert.equal(node.widgets.find((widget) => widget.name === 'age').value, 24);
        assert.equal(node.widgets.find((widget) => widget.name === 'dress').value, 'qipao');
        assert.equal(JSON.parse(node.widgets.find((widget) => widget.name === 'colors').value).dress, '#fa0000');
        const name = find(root, (item) => item.attributes['aria-label'] === 'Character name');
        name.value = 'Ruby';
        find(libraryDialog, (item) => item.tag === 'button' && item.textContent === 'Rename').onclick();
        assert.equal(grid.children[0].attributes['aria-label'], 'Load character: Ruby');
        await grid.children.at(-1).onclick();
        assert.equal(grid.children.length, 5);
        assert.equal(name.value, 'New character');
        find(libraryDialog, (item) => item.tag === 'button' && item.textContent === 'Delete').onclick();
        assert.equal(grid.children.length, 4);
        assert.equal(node.properties.character_creator_character_id, undefined);
        find(libraryDialog, (item) => item.tag === 'button' && item.textContent === 'Close').onclick();
        assert.equal(libraryDialog.open, false);
        const restored = new Node();
        restored.properties = { character_creator_character_id: 'scarlet', character_creator_layout_version: 1 };
        restored.size = [940, 1200];
        restored.onConfigure();
        restored.size = [940, 1800]; // Native widget restoration may briefly expand the node before the editor mounts.
        restored.onNodeCreated();
        await setImmediate();
        assert.deepEqual(restored.size, [940, 1200]);
        assert.equal(restored.panelWidget.width, 940);
        restored.widgets.find((widget) => widget.name === 'age').value = 77;
        restored.onConfigure();
        await new Promise((resolve) => setTimeout(resolve, 210));
        assert.equal(getLibrary(catalog).characters.find((row) => row.id === 'scarlet').settings.age, 24);
        assert.equal(restored.properties.character_creator_character_id, undefined);
        restored.onRemoved();
        const legacy = new Node();
        legacy.size = [690, 1350];
        legacy.onConfigure();
        legacy.onNodeCreated();
        await setImmediate();
        assert.deepEqual(legacy.size, [960, 800]);
        assert.equal(legacy.properties.character_creator_layout_version, 1);
        legacy.setSize([800, 1000]);
        legacy.onConfigure();
        assert.deepEqual(legacy.size, [800, 1000]);
        legacy.onRemoved();
        const fresh = new Node();
        fresh.size = [690, 1700];
        fresh.onNodeCreated();
        await setImmediate();
        assert.deepEqual(fresh.size, [960, 800]);
        assert.equal(fresh.widgets.find((widget) => widget.name === 'age').value, 24);
        assert.equal(fresh.widgets.find((widget) => widget.name === 'dress').value, 'qipao');
        assert.equal(JSON.parse(fresh.widgets.find((widget) => widget.name === 'colors').value).dress, '#fa0000');
        fresh.onRemoved();
        const cold = new Node();
        cold.comfyClass = 'CharacterCreator';
        const savedNode = { id: 91, type: 'CharacterCreator', size: [960, 800], properties: { character_creator_layout_version: 1 } };
        extension.beforeConfigureGraph({ nodes: [savedNode] });
        savedNode.size[1] = 1700;
        cold.size = [...savedNode.size];
        cold.properties = savedNode.properties;
        cold.onConfigure({ ...savedNode, size: [...savedNode.size] });
        cold.onNodeCreated();
        await cold._characterCreatorReady;
        cold.widgets[0].hidden = false;
        cold.widgets[0].type = 'combo';
        cold.size = [960, 1800];
        extension.loadedGraphNode(cold);
        await extension.afterConfigureGraph();
        assert.deepEqual(cold.size, [960, 800]);
        assert.equal(cold.widgets[0].hidden, true);
        cold.onRemoved();
        const library = getLibrary(catalog);
        const listenerCount = library.listeners.size;
        for (let index = 0; index < 50; index++) {
            const transient = new Node();
            transient.onNodeCreated();
            await transient._characterCreatorReady;
            assert.equal(library.listeners.size, listenerCount + 1);
            transient.onRemoved();
            assert.equal(library.listeners.size, listenerCount);
        }
        const transient = new Node();
        transient.onNodeCreated();
        await transient._characterCreatorReady;
        const fetchApi = globalThis.__characterTestApi.fetchApi;
        let historyRequests = 0, historySignal;
        globalThis.__characterTestApi.fetchApi = (path, options) => {
            if (!path.startsWith('/history')) return fetchApi(path, options);
            historyRequests++;
            historySignal = options.signal;
            return new Promise((resolve, reject) => historySignal.addEventListener('abort', () => reject(historySignal.reason), { once: true }));
        };
        const openCharacters = find(transient.panel.shadow, (item) => item.tag === 'button' && item.attributes.title === undefined && item.textContent === 'Characters');
        const refreshing = openCharacters.onclick();
        await openCharacters.onclick();
        assert.equal(historyRequests, 1);
        const frames = new Map();
        const requestFrame = globalThis.requestAnimationFrame;
        const cancelFrame = globalThis.cancelAnimationFrame;
        globalThis.requestAnimationFrame = (callback) => { frames.set(1, callback); return 1; };
        globalThis.cancelAnimationFrame = (id) => frames.delete(id);
        transient.onConnectionsChange();
        await setImmediate();
        assert.equal(frames.size, 1);
        transient.onRemoved();
        await refreshing;
        assert.equal(historySignal.aborted, true);
        assert.equal(frames.size, 0);
        assert.equal(library.listeners.size, listenerCount);
        globalThis.requestAnimationFrame = requestFrame;
        if (cancelFrame) globalThis.cancelAnimationFrame = cancelFrame;
        else delete globalThis.cancelAnimationFrame;
        globalThis.__characterTestApi.fetchApi = fetchApi;
        node.onRemoved();
        const previousRequests = requests;
        await new Promise((resolve) => setTimeout(resolve, 210));
        assert.equal(requests, previousRequests);
    } finally {
        node?.onRemoved?.();
        globalThis.document = originalDocument;
        if (originalAnimationFrame) globalThis.requestAnimationFrame = originalAnimationFrame;
        else delete globalThis.requestAnimationFrame;
        globalThis.Image = originalImage;
        globalThis.fetch = originalFetch;
        if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
        else delete globalThis.navigator;
        delete globalThis.__characterTestApp;
        delete globalThis.__characterTestApi;
    }
});
