import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applySettings, changeGender, clampAge, genderOptions, isRestrictedCharacter, normalizeAgeWidget, optionSections, settingsFromWidgets, visibleFields } from '../web/state.js';
import { characterPreview, icon, iconNames } from '../web/icons.js';

const catalog = JSON.parse(readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
const defaults = { model: 'qwen_image_2_1', template: 'character', ...Object.fromEntries(Object.entries(catalog.fields).map(([key, value]) => [key, value.default])) };
const makeNode = () => ({ widgets: [...Object.entries(defaults).map(([name, value]) => ({ name, value })), { name: 'character_code', value: 'old code' }], inputs: [] });

test('SFW preview policy rejects restricted clothes, transparency, modifiers and uncovered saved characters', () => {
    const safe = { ...catalog, allow_nsfw: false };
    assert.equal(isRestrictedCharacter(defaults, safe), false);
    for (const [field, spec] of Object.entries({ ...catalog.fields, ...catalog.extra_fields })) {
        for (const option of spec.options.filter((option) => option.nsfw)) {
            const settings = { ...defaults, [field]: option.id };
            assert.equal(isRestrictedCharacter(settings, safe), true, `${field}: ${option.id}`);
            assert.equal(isRestrictedCharacter(settings, { ...safe, allow_nsfw: true }), false);
        }
    }
    for (const clothing of [
        { upper_garment: { fabric: 'plastic', opacity: 99 } },
        { upper_garment: { fabric: 'lace' } },
        { lower_garment: { hem_length: 'micro' } },
        { upper_garment: { closure: 'open' } },
    ]) assert.equal(isRestrictedCharacter({ ...defaults, clothing }, safe), true);
    assert.equal(isRestrictedCharacter({ ...defaults, upper_garment: 'none' }, safe), true);
    assert.equal(isRestrictedCharacter({ ...defaults, clothing: { upper_garment: { fabric: 'plastic', opacity: 100 } } }, safe), false);
});

test('neckwear is separate from jewelry, has distinct icons and appears in the outfit preview', () => {
    const neckwear = catalog.extra_fields.neckwear;
    assert.equal(neckwear.group, 'Clothing');
    assert.ok(!genderOptions(catalog.extra_fields.necklace, 'woman').some((option) => option.id === 'choker'));
    const drawings = new Set();
    for (const option of neckwear.options.filter((option) => option.id !== 'none')) {
        assert.ok(iconNames.includes(option.icon));
        const drawing = icon(option.icon);
        assert.notEqual(drawing, icon('person'));
        drawings.add(drawing);
        const preview = characterPreview({ ...defaults, neckwear: option.id }, { ...catalog.fields, ...catalog.extra_fields });
        assert.match(preview, /data-garment="neckwear"/);
        assert.ok(!preview.includes('undefined'));
    }
    assert.equal(drawings.size, neckwear.options.length - 1);
    for (const id of ['goth_ensemble', 'goth_suit']) {
        const option = catalog.fields.dress.options.find((option) => option.id === id);
        assert.notEqual(icon(option.icon), icon('gown'));
        assert.match(characterPreview({ ...defaults, wardrobe_mode: 'dress', dress: id }, catalog.fields), /data-garment="dress"/);
    }
});

test('clothing row sections keep every allowed option exactly once and separate underwear from lingerie', () => {
    for (const spec of Object.values({ ...catalog.fields, ...catalog.extra_fields }).filter((field) => field.group === 'Clothing' && field.sections)) {
        for (const gender of ['man', 'woman']) {
            const sections = optionSections(spec, gender);
            const options = sections.flatMap((section) => section.options.map((option) => option.id));
            assert.equal(options[0], 'none');
            assert.equal(new Set(options).size, options.length);
            assert.deepEqual([...options].sort(), genderOptions(spec, gender).map((option) => option.id).sort());
            for (const section of sections) {
                if (!['Underwear', 'Lingerie'].includes(section.label)) continue;
                assert.ok(section.options.every((option) => option.nsfw));
            }
        }
    }
});

test('native widgets supply every character setting and survive round trips', () => {
    const node = makeNode();
    assert.deepEqual(settingsFromWidgets(node, catalog), defaults);
    const settings = { ...defaults, hair_style: 'bob', wardrobe_mode: 'dress' };
    applySettings(node, settings, catalog);
    assert.deepEqual(settingsFromWidgets(node, catalog), settings);
    assert.equal(node.widgets.find((widget) => widget.name === 'character_code').value, '');
});

test('import does not partially mutate controls when a field is linked', () => {
    const node = makeNode();
    node.inputs.push({ widget: { name: 'hair_style' }, link: 0 });
    assert.throws(() => applySettings(node, { ...defaults, gender: 'man', hair_style: 'bob' }, catalog), /Disconnect/);
    assert.deepEqual(settingsFromWidgets(node, catalog), defaults);
});

test('import rejects an externally connected authoritative code', () => {
    const node = makeNode();
    node.inputs.push({ widget: { name: 'character_code' }, link: 7 });
    assert.throws(() => applySettings(node, defaults, catalog), /Disconnect/);
    assert.equal(node.widgets.at(-1).value, 'old code');
});

test('wardrobe picker shows only the active garment family', () => {
    const names = (settings) => visibleFields(settings, catalog, 'Clothing').map(([name]) => name);
    assert.ok(!names(defaults).includes('dress'));
    assert.ok(names(defaults).includes('upper_garment'));
    assert.ok(names({ ...defaults, wardrobe_mode: 'dress' }).includes('dress'));
    assert.ok(!names({ ...defaults, wardrobe_mode: 'dress' }).includes('lower_garment'));
    assert.ok(!visibleFields({ ...defaults, hair_style: 'bald' }, catalog, 'Hair').some(([name]) => name === 'hair_color'));
});

test('every bundled option has a local vector icon', () => {
    for (const field of Object.values(catalog.fields)) {
        for (const option of field.options) {
            assert.ok(iconNames.includes(option.icon), option.id);
            assert.match(icon(option.icon, option.color), /^<svg/);
        }
    }
});

test('icons and preview cannot interpolate markup from custom names or colors', () => {
    const injection = '"><script>alert(1)</script>';
    assert.ok(!icon(injection, injection).includes('<script>'));
    const fields = structuredClone(catalog.fields);
    fields.skin_tone.options[0].color = injection;
    fields.hair_color.options[0].color = injection;
    assert.ok(!characterPreview(defaults, fields).includes('<script>'));
});

test('schematic preview changes with hair, skin and clothing', () => {
    const initial = characterPreview(defaults, catalog.fields);
    for (const changes of [{ hair_style: 'bob' }, { skin_tone: 'dark' }, { upper_garment: 'blouse' }, { wardrobe_mode: 'dress' }]) {
        assert.notEqual(characterPreview({ ...defaults, ...changes }, catalog.fields), initial);
    }
});

test('custom colors survive widget export and import and old codes reset them', () => {
    const node = makeNode();
    node.widgets.push({ name: 'colors', value: '{}' });
    const settings = { ...defaults, colors: { upper_garment: '#ff0000', hair_color: '#0000ff' } };
    applySettings(node, settings, catalog);
    assert.deepEqual(settingsFromWidgets(node, catalog), settings);
    const preview = characterPreview(settings, catalog.fields);
    assert.ok(preview.includes('fill="#ff0000"'));
    assert.ok(preview.includes('fill="#0000ff"'));
    applySettings(node, defaults, catalog);
    assert.equal(node.widgets.at(-1).value, '{}');
    assert.deepEqual(settingsFromWidgets(node, catalog), defaults);
});

function outlineBounds(svg, field) {
    const path = svg.match(new RegExp(`data-garment="${field}"[^>]*>(?:<g[^>]*>)?<path d="([^"]+)"`))?.[1];
    assert.ok(path, `Missing outline for ${field}`);
    let x = 0, y = 0;
    const xs = [], ys = [];
    for (const [, command, parameters] of path.matchAll(/([MLHVQ])([^A-Za-z]*)/g)) {
        const values = parameters.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
        if (command === 'H') {
            for (x of values) { xs.push(x); ys.push(y); }
        } else if (command === 'V') {
            for (y of values) { xs.push(x); ys.push(y); }
        } else {
            for (let i = 0; i < values.length; i += 2) {
                x = values[i]; y = values[i + 1];
                xs.push(x); ys.push(y);
            }
        }
    }
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

test('preview uses fitted garment geometry and draws a shoe for each foot', () => {
    const preview = characterPreview({ ...defaults, upper_garment: 'tank', lower_garment: 'skirt', shoes: 'heels' }, catalog.fields);
    assert.equal((preview.match(/data-foot=/g) ?? []).length, 2);
    assert.match(preview, /data-foot="left"/);
    assert.match(preview, /data-foot="right" transform="translate\(18 0\)"/);
    const top = outlineBounds(preview, 'upper_garment');
    const bottom = outlineBounds(preview, 'lower_garment');
    const shoe = outlineBounds(preview, 'shoes');
    assert.ok(top.bottom >= bottom.top, 'Top and skirt must overlap at the waist');
    assert.ok(top.left < 80 && top.right > 80, 'Top must span the body centre');
    assert.ok(shoe.left <= 65 && shoe.right >= 78, 'Left shoe must cover the left foot');
    assert.ok(shoe.top <= 252 && shoe.bottom >= 262, 'Shoe must reach from the ankle to the sole');
    assert.ok(!characterPreview({ ...defaults, shoes: 'none' }, catalog.fields).includes('data-foot='));
});

test('every bundled garment has a fitted preview in the shared avatar coordinate space', () => {
    for (const field of ['dress', 'upper_garment', 'lower_garment', 'outerwear', 'shoes', 'headwear']) {
        for (const option of catalog.fields[field].options) {
            if (option.id === 'none') continue;
            const settings = { ...defaults, [field]: option.id, wardrobe_mode: field === 'dress' ? 'dress' : 'separates' };
            const preview = characterPreview(settings, catalog.fields);
            assert.ok(preview.includes(`data-garment="${field}"`), `${field}: ${option.id}`);
        }
    }
});

test('male and female catalogs expose different hairstyles and clothing', () => {
    const ids = (field, gender) => genderOptions(catalog.fields[field], gender).map((option) => option.id);
    assert.ok(ids('hair_style', 'man').includes('crew_cut'));
    assert.ok(!ids('hair_style', 'man').includes('bob'));
    assert.ok(ids('hair_style', 'woman').includes('bob'));
    assert.ok(!ids('hair_style', 'woman').includes('crew_cut'));
    assert.ok(ids('upper_garment', 'man').includes('polo'));
    assert.ok(!ids('upper_garment', 'man').includes('blouse'));
    assert.ok(ids('upper_garment', 'woman').includes('blouse'));
    assert.ok(!ids('shoes', 'man').includes('heels'));
    assert.ok(ids('dress', 'man').includes('overalls'));
});

test('switching gender replaces incompatible choices and preserves common choices and colors', () => {
    const node = makeNode();
    node.widgets.find((widget) => widget.name === 'character_code').value = '';
    node.widgets.find((widget) => widget.name === 'upper_garment').value = 'blouse';
    node.widgets.find((widget) => widget.name === 'shoes').value = 'heels';
    node.widgets.push({ name: 'colors', value: '{"hair_color":"#ff0000"}' });
    changeGender(node, 'man', catalog);
    const settings = settingsFromWidgets(node, catalog);
    assert.equal(settings.gender, 'man');
    assert.equal(settings.hair_style, 'crew_cut');
    assert.equal(settings.upper_garment, 'polo');
    assert.equal(settings.shoes, 'sneakers');
    assert.equal(settings.lower_garment, 'jeans');
    assert.deepEqual(settings.colors, { hair_color: '#ff0000' });
    for (const [field, spec] of Object.entries(catalog.fields)) {
        assert.ok(genderOptions(spec, 'man').some((option) => option.id === settings[field]), field);
    }
    assert.match(characterPreview(settings, catalog.fields), /data-avatar="male"/);
    changeGender(node, 'woman', catalog);
    assert.equal(settingsFromWidgets(node, catalog).hair_style, 'long_waves');
});

test('linked choices and explicit imported presets are not overwritten by gender filtering', () => {
    const node = makeNode();
    node.inputs.push({ widget: { name: 'hair_style' }, link: 3 });
    changeGender(node, 'man', catalog);
    assert.equal(settingsFromWidgets(node, catalog).hair_style, defaults.hair_style);
    const imported = { ...defaults, gender: 'man', hair_style: 'long_waves', lower_garment: 'skirt' };
    const target = makeNode();
    applySettings(target, imported, catalog);
    assert.deepEqual(settingsFromWidgets(target, catalog), imported);
});

test('both avatar silhouettes differ even with identical hair and clothes', () => {
    const woman = characterPreview({ ...defaults, hair_style: 'bald' }, catalog.fields);
    const man = characterPreview({ ...defaults, gender: 'man', hair_style: 'bald' }, catalog.fields);
    assert.notEqual(woman, man);
    assert.match(woman, /data-avatar="female"/);
    assert.match(man, /data-avatar="male"/);
    assert.ok(woman.includes('<ellipse cx="80" cy="46"'));
    assert.ok(!man.includes('<ellipse cx="80" cy="46"'), 'Male preview must not reuse the rounded female head');
    assert.match(man, /data-garment="upper_garment"/);
    assert.match(man, /data-garment="lower_garment"/);
});

test('breast choices and preview contours are female only', () => {
    assert.ok(visibleFields(defaults, catalog, 'Appearance').some(([name]) => name === 'bust_size'));
    assert.ok(!visibleFields({ ...defaults, gender: 'man' }, catalog, 'Appearance').some(([name]) => name === 'bust_size'));
    const small = characterPreview({ ...defaults, bust_size: 'small' }, catalog.fields);
    const large = characterPreview({ ...defaults, bust_size: 'full' }, catalog.fields);
    assert.notEqual(small, large);
    assert.match(large, /data-breast-size="full"/);
    assert.ok(!characterPreview({ ...defaults, gender: 'man', bust_size: 'full' }, catalog.fields).includes('data-breast-size='));
});

test('age input clamps and survives export/import including legacy life-stage presets', () => {
    assert.equal(clampAge('12'), 18);
    assert.equal(clampAge('101'), 100);
    assert.equal(clampAge('63'), 63);
    const node = makeNode();
    node.widgets.push({ name: 'age', value: 30 });
    applySettings(node, { ...defaults, age: 16 }, catalog);
    assert.equal(settingsFromWidgets(node, catalog).age, 18);
    applySettings(node, { ...defaults, age: 74 }, catalog);
    assert.equal(settingsFromWidgets(node, catalog).age, 74);
    applySettings(node, { ...defaults, life_stage: 'fifties' }, catalog);
    assert.equal(settingsFromWidgets(node, catalog).age, 55);
});

test('restored hidden age is repaired in place before it reaches the INT input', () => {
    for (const [raw, expected] of [['', 30], [undefined, 30], [null, 30], ['62', 62], [12, 18], [103, 100], ['invalid', 18]]) {
        const node = makeNode();
        const widget = { name: 'age', value: raw };
        node.widgets.push(widget);
        assert.equal(normalizeAgeWidget(node), expected);
        assert.equal(widget.value, expected);
        assert.equal(Number.isInteger(widget.value), true);
    }
});

test('gender lists cover all bundled options and retain shared custom options', () => {
    for (const field of Object.values(catalog.fields)) {
        if (!field.gender_options) continue;
        const covered = new Set(Object.values(field.gender_options).flat());
        assert.equal(covered.size, field.options.length);
        for (const id of covered) assert.ok(field.options.some((option) => option.id === id));
        for (const gender of ['man', 'woman']) assert.ok(genderOptions(field, gender).length);
    }
    const field = structuredClone(catalog.fields.hair_style);
    field.options.push({ id: 'custom_cut' });
    assert.ok(genderOptions(field, 'man').some((option) => option.id === 'custom_cut'));
    assert.ok(genderOptions(field, 'woman').some((option) => option.id === 'custom_cut'));
});


test('shoe orientation and separate hair layers leave the face above rear hair', () => {
    for (const hair of catalog.fields.hair_style.options) {
        const svg = characterPreview({ ...defaults, hair_style: hair.id }, catalog.fields);
        assert.ok(svg.indexOf('data-hair-layer="back"') < svg.indexOf('data-avatar-skin='), hair.id);
        assert.ok(svg.indexOf('data-hair-layer="front"') > svg.indexOf('data-avatar-skin='), hair.id);
    }
    assert.match(characterPreview(defaults, catalog.fields), /data-foot="left" transform="translate\(144 0\) scale\(-1 1\)"/);
});

test('fabric, texture and colored garment details survive imports and reset with old codes', () => {
    const node = makeNode();
    node.widgets.push({ name: 'clothing', value: '{}' });
    const clothing = { upper_garment: { fabric: 'velvet', texture: 'ribbed', details: { piping: '#ff0000' } } };
    applySettings(node, { ...defaults, clothing }, catalog);
    assert.deepEqual(settingsFromWidgets(node, catalog).clothing, clothing);
    assert.match(characterPreview({ ...defaults, clothing }, catalog.fields), /data-detail="piping"[^>]*stroke="#ff0000"/);
    node.inputs.push({ widget: { name: 'clothing' }, link: 3 });
    assert.throws(() => applySettings(node, defaults, catalog), /Disconnect the clothing/);
    node.inputs = [];
    applySettings(node, defaults, catalog);
    assert.equal(node.widgets.find((widget) => widget.name === 'clothing').value, '{}');
});


test('hair sections retain every available style exactly once and respect existing gender menus', () => {
    for (const gender of ['woman', 'man']) {
        const groups = optionSections(catalog.fields.hair_style, gender);
        const ids = groups.flatMap((group) => group.options.map((option) => option.id));
        assert.equal(new Set(ids).size, ids.length);
        assert.deepEqual([...ids].sort(), genderOptions(catalog.fields.hair_style, gender).map((option) => option.id).sort());
        assert.ok(groups.some((group) => group.label === 'Classic cuts'));
        assert.ok(groups.some((group) => group.label === 'Braids, locs & protective styles'));
        for (const field of Object.values(catalog.fields)) {
            const choices = genderOptions(field, gender);
            if (choices.some((option) => option.id === 'none')) assert.equal(choices[0].id, 'none');
        }
    }
    const custom = { ...catalog.fields.hair_style, options: [...catalog.fields.hair_style.options, { id: 'custom_cut' }] };
    assert.ok(optionSections(custom, 'woman').at(-1).options.some((option) => option.id === 'custom_cut'));
});

test('ethnicity is independent, shareable and reset when importing old presets', () => {
    const node = makeNode();
    node.widgets.push({ name: 'ethnicity', value: 'unspecified' });
    assert.ok(visibleFields(defaults, catalog, 'Appearance').some(([name]) => name === 'ethnicity'));
    const groups = optionSections(catalog.ethnicity, defaults.gender);
    const ids = groups.flatMap((group) => group.options.map((option) => option.id));
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual([...ids].sort(), catalog.ethnicity.options.map((option) => option.id).sort());
    assert.equal(groups[0].options[0].id, 'unspecified');
    assert.ok(groups.find((group) => group.label === 'Asia · South Asia').options.some((option) => option.id === 'pakistani'));
    assert.ok(groups.find((group) => group.label === 'Oceania & Australia').options.some((option) => option.id === 'maori'));

    const settings = { ...defaults, ethnicity: 'japanese', hair_style: 'locs', skin_tone: 'deep' };
    applySettings(node, settings, catalog);
    assert.deepEqual(settingsFromWidgets(node, catalog), settings);
    changeGender(node, 'man', catalog);
    assert.equal(settingsFromWidgets(node, catalog).ethnicity, 'japanese');
    node.inputs.push({ widget: { name: 'ethnicity' }, link: 1 });
    assert.throws(() => applySettings(node, defaults, catalog), /Disconnect the ethnicity/);
    node.inputs = [];
    applySettings(node, defaults, catalog);
    assert.equal(node.widgets.at(-1).value, 'unspecified');
});

test('all icons preserve chosen ink with a contrasting outline and hair has a separate face fill', () => {
    for (const name of iconNames) {
        for (const color of ['#000000', '#30313e', '#493c65', '#ffffff']) {
            const svg = icon(name, color);
            assert.ok(svg.includes(`color:${color}`), name);
            assert.match(svg, /data-icon-outline="true" stroke="#eee8f7" stroke-width="5"/);
            assert.match(svg, /data-icon-ink="true" stroke="currentColor"/);
        }
    }
    for (const option of catalog.fields.hair_style.options) {
        const svg = icon(option.icon, '#121212');
        assert.match(svg, /data-icon-face="true"[^>]*fill="#d6d9df"/);
        assert.ok(svg.indexOf('data-icon-face=') < svg.indexOf('data-icon-ink='));
    }
    assert.notEqual(icon('cargo_pants'), icon('chinos'));
    assert.notEqual(icon('lighting_window'), icon('lighting_neon'));
    assert.notEqual(icon('framing_waist_up'), icon('framing_full_body'));
});


test('hair modifiers, face details and gloves are optional and survive preset round trips', () => {
    const node = makeNode();
    node.widgets.push(...Object.entries(catalog.extra_fields).map(([name, field]) => ({ name, value: field.default })));
    const extra = { hair_finish: 'messy', hair_volume: 'airy', eye_color: 'green', lip_makeup: 'matte',
        earrings: 'hoops', necklace: 'pendant', piercings: 'septum', moles: 'upper_lip', gloves: 'long' };
    const settings = { ...defaults, ...extra };
    applySettings(node, settings, catalog);
    assert.deepEqual(settingsFromWidgets(node, catalog), settings);
    for (const group of ['Hair', 'Face & accessories', 'Clothing']) assert.ok(visibleFields(settings, catalog, group).length);
    for (const name of ['hair_finish', 'hair_volume']) assert.ok(!visibleFields({ ...settings, hair_style: 'bald' }, catalog, 'Hair').some(([key]) => key === name));
    node.inputs.push({ widget: { name: 'gloves' }, link: 4 });
    assert.throws(() => applySettings(node, defaults, catalog), /Disconnect the gloves/);
    assert.deepEqual(settingsFromWidgets(node, catalog), settings);
    node.inputs = [];
    applySettings(node, defaults, catalog);
    assert.deepEqual(settingsFromWidgets(node, catalog), defaults);
});

test('new options have local icons and the schematic shows paired gloves and face accents', () => {
    for (const field of Object.values(catalog.extra_fields)) {
        assert.equal(field.options[0].id, 'none');
        for (const option of field.options) assert.ok(iconNames.includes(option.icon), option.icon);
    }
    const fields = { ...catalog.fields, ...catalog.extra_fields };
    for (const option of catalog.extra_fields.gloves.options.filter((item) => item.id !== 'none')) {
        const svg = characterPreview({ ...defaults, gloves: option.id }, fields);
        assert.match(svg, /data-garment="gloves"/);
        assert.equal((svg.match(/data-hand=/g) ?? []).length, 2);
    }
    const svg = characterPreview({ ...defaults, hair_finish: 'messy', eye_color: 'green', lip_makeup: 'matte',
        earrings: 'hoops', piercings: 'septum', necklace: 'pendant', moles: 'upper_lip', eyewear: 'round',
        colors: { eye_color: '#00ff00', gloves: '#cc0000' } }, fields);
    for (const name of ['eye_color', 'lip_makeup', 'earrings', 'piercings', 'necklace', 'moles', 'eyewear']) assert.ok(svg.includes(`data-face-detail="${name}"`), name);
    assert.match(svg, /data-face-detail="eye_color" fill="#00ff00"/);
    assert.match(svg, /data-hair-modifier="true"/);
});
