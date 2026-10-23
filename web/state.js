export function clampAge(value) {
    const age = Number(value);
    return Number.isFinite(age) ? Math.max(18, Math.min(100, Math.round(age))) : 18;
}

export function normalizeAgeWidget(node) {
    const widget = node.widgets?.find((item) => item.name === 'age');
    if (!widget) return;
    widget.value = widget.value === '' || widget.value == null ? 30 : clampAge(widget.value);
    return widget.value;
}

export function settingsFromWidgets(node, catalog) {
    const settings = {};
    for (const key of ['model', 'template', ...Object.keys(catalog.fields)]) {
        const widget = node.widgets?.find((item) => item.name === key);
        if (!widget) throw new Error(`Missing character widget: ${key}`);
        settings[key] = widget.value;
    }
    const colors = JSON.parse(node.widgets?.find((item) => item.name === 'colors')?.value || '{}');
    if (colors === null || typeof colors !== 'object' || Array.isArray(colors)) throw new Error('Colors must be an object.');
    if (Object.keys(colors).length) settings.colors = colors;
    const clothing = JSON.parse(node.widgets?.find((item) => item.name === 'clothing')?.value || '{}');
    if (clothing === null || typeof clothing !== 'object' || Array.isArray(clothing)) throw new Error('Clothing refinements must be an object.');
    if (Object.keys(clothing).length) settings.clothing = clothing;
    for (const [name, field] of Object.entries(catalog.extra_fields ?? {})) {
        const value = node.widgets?.find((item) => item.name === name)?.value;
        if (value && value !== field.default) settings[name] = value;
    }
    const ageWidget = node.widgets?.find((item) => item.name === 'age');
    if (ageWidget) settings.age = clampAge(ageWidget.value);
    const ethnicity = node.widgets?.find((item) => item.name === 'ethnicity')?.value;
    if (ethnicity && ethnicity !== 'unspecified') settings.ethnicity = ethnicity;
    return settings;
}

export function applySettings(node, settings, catalog) {
    const keys = ['model', 'template', ...Object.keys(catalog.fields)];
    if (Object.keys(settings).filter((key) => !['colors', 'age', 'clothing', 'ethnicity', ...Object.keys(catalog.extra_fields ?? {})].includes(key)).length !== keys.length || keys.some((key) => typeof settings[key] !== 'string')) {
        throw new Error('Character settings do not match this catalog.');
    }
    const widgets = keys.map((key) => {
        const widget = node.widgets?.find((item) => item.name === key);
        if (!widget) throw new Error(`Missing character widget: ${key}`);
        if (node.inputs?.some((input) => input.widget?.name === key && input.link != null)) {
            throw new Error(`Disconnect the ${key} input before importing a character.`);
        }
        return [widget, settings[key]];
    });
    const extraWidgets = Object.entries(catalog.extra_fields ?? {}).flatMap(([name, field]) => {
        const widget = node.widgets?.find((item) => item.name === name);
        if (node.inputs?.some((input) => input.widget?.name === name && input.link != null)) {
            throw new Error(`Disconnect the ${name} input before importing a character.`);
        }
        if (!widget && settings[name] && settings[name] !== field.default) throw new Error(`Reload the node to enable ${field.label}.`);
        return widget ? [[widget, settings[name] ?? field.default]] : [];
    });
    const preset = node.widgets?.find((item) => item.name === 'character_code');
    const colorWidget = node.widgets?.find((item) => item.name === 'colors');
    const ageWidget = node.widgets?.find((item) => item.name === 'age');
    const clothingWidget = node.widgets?.find((item) => item.name === 'clothing');
    const ethnicityWidget = node.widgets?.find((item) => item.name === 'ethnicity');
    if (node.inputs?.some((input) => input.widget?.name === 'ethnicity' && input.link != null)) {
        throw new Error('Disconnect the ethnicity input before importing a character.');
    }
    if (settings.ethnicity && !ethnicityWidget) throw new Error('Reload the node to enable ethnicity.');
    if (node.inputs?.some((input) => input.widget?.name === 'clothing' && input.link != null)) {
        throw new Error('Disconnect the clothing input before importing a character.');
    }
    if (settings.clothing && !clothingWidget) throw new Error('Reload the node to enable clothing refinements.');
    if (node.inputs?.some((input) => input.widget?.name === 'age' && input.link != null)) {
        throw new Error('Disconnect the age input before importing a character.');
    }
    if (settings.age !== undefined && !ageWidget) throw new Error('Reload the node to enable numeric age.');
    if (node.inputs?.some((input) => input.widget?.name === 'colors' && input.link != null)) {
        throw new Error('Disconnect the colors input before importing a character.');
    }
    if (settings.colors && !colorWidget) throw new Error('Reload the node to enable color settings.');
    if (node.inputs?.some((input) => input.widget?.name === 'character_code' && input.link != null)) {
        throw new Error('Disconnect the character_code input before importing a character.');
    }
    for (const [widget, value] of [...widgets, ...extraWidgets]) widget.value = value;
    if (colorWidget) colorWidget.value = JSON.stringify(settings.colors ?? {});
    if (clothingWidget) clothingWidget.value = JSON.stringify(settings.clothing ?? {});
    if (ethnicityWidget) ethnicityWidget.value = settings.ethnicity ?? 'unspecified';
    if (ageWidget) ageWidget.value = clampAge(settings.age ?? {
        twenties: 25, thirties: 35, forties: 45, fifties: 55, older: 70,
    }[settings.life_stage] ?? 30);
    if (preset) preset.value = '';
    for (const [widget, value] of [...widgets, ...extraWidgets]) widget.callback?.(value);
    node.graph?.setDirtyCanvas(true, true);
}

export function visibleFields(settings, catalog, group) {
    return [...Object.entries(catalog.fields), ...Object.entries(catalog.extra_fields ?? {}), ...(catalog.ethnicity ? [['ethnicity', catalog.ethnicity]] : [])].filter(([name, field]) => {
        if (field.group !== group) return false;
        if (name === 'bust_size' && settings.gender !== 'woman') return false;
        if (name === 'dress') return settings.wardrobe_mode === 'dress';
        if (['upper_garment', 'lower_garment'].includes(name)) return settings.wardrobe_mode !== 'dress';
        if (['hair_color', 'hair_finish', 'hair_volume'].includes(name)) return settings.hair_style !== 'bald';
        return true;
    });
}

export function genderOptions(field, gender) {
    const lists = field.gender_options;
    if (!lists) return field.options.filter((option) => !field.hidden_options?.includes(option.id));
    const known = new Set(Object.values(lists).flat());
    const allowed = lists[gender] ?? [];
    return [...allowed.map((id) => field.options.find((option) => option.id === id)).filter(Boolean),
        ...field.options.filter((option) => !known.has(option.id))];
}

export function isRestrictedCharacter(settings, catalog) {
    if (catalog.allow_nsfw) return false;
    const fields = { ...catalog.fields, ...catalog.extra_fields };
    if (catalog.templates?.[settings.template]?.nsfw || Object.entries(fields).some(([name, field]) =>
        field.options.find((option) => option.id === (settings[name] ?? field.default))?.nsfw)) return true;
    for (const [name, refinements] of Object.entries(settings.clothing ?? {})) {
        if ((refinements.opacity ?? 100) < 100) return true;
        if (['fabric', 'texture'].some((kind) => catalog.clothing[kind][refinements[kind] ?? 'default']?.nsfw)) return true;
        if (Object.entries(catalog.clothing.modifiers).some(([kind, spec]) => spec.options[refinements[kind] ?? 'default']?.nsfw)) return true;
        if (['upper_garment', 'dress'].includes(name) && ['open', 'unzipped'].includes(refinements.closure)) return true;
    }
    const garments = settings.wardrobe_mode === 'dress' ? ['dress'] : ['upper_garment', 'lower_garment'];
    const coverage = new Set(garments.flatMap((name) => fields[name].options.find((option) => option.id === settings[name])?.covers ?? []));
    return !coverage.has('upper') || !coverage.has('lower');
}

export function optionSections(field, gender) {
    const options = genderOptions(field, gender);
    if (!field.sections) return [{ options }];
    const assigned = new Set(field.sections.flatMap((section) => section.options));
    const sections = field.sections.map((section) => ({ ...section,
        options: options.filter((option) => section.options.includes(option.id)),
    })).filter((section) => section.options.length);
    const other = options.filter((option) => !assigned.has(option.id));
    if (other.length) sections.push({ label: field.group === 'Clothing' ? 'Other items' : 'Other styles', options: other });
    return sections;
}

export function changeGender(node, gender, catalog) {
    const settings = settingsFromWidgets(node, catalog);
    const changed = [];
    for (const [name, field] of Object.entries(catalog.fields)) {
        const widget = node.widgets.find((item) => item.name === name);
        if (node.inputs?.some((input) => input.widget?.name === name && input.link != null)) continue;
        const options = genderOptions(field, gender).filter((option) => !option.nsfw || catalog.allow_nsfw);
        let value = name === 'gender' ? gender : settings[name];
        if (!options.some((option) => option.id === value)) {
            value = (options.find((option) => option.id !== 'none') ?? options[0]).id;
        }
        if (widget.value !== value) {
            widget.value = value;
            changed.push(widget);
            const clothingWidget = node.widgets.find((item) => item.name === 'clothing');
            if (settings.clothing?.[name] && clothingWidget && !node.inputs?.some((input) => input.widget?.name === 'clothing' && input.link != null)) {
                const clothing = JSON.parse(clothingWidget.value || '{}');
                const option = field.options.find((item) => item.id === value);
                const metadata = { ...option, ...field.option_details?.[value] };
                for (const kind of Object.keys(catalog.clothing.modifiers)) {
                    if (!metadata.modifiers?.[kind]?.includes(clothing[name][kind])) delete clothing[name][kind];
                }
                clothing[name].details = Object.fromEntries(Object.entries(clothing[name].details ?? {}).filter(([id]) => metadata.details?.includes(id)));
                clothingWidget.value = JSON.stringify(clothing);
            }
        }
    }
    for (const widget of changed) widget.callback?.(widget.value);
    node.graph?.setDirtyCanvas(true, true);
}
