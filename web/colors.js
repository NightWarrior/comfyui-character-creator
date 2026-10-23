export function hexToHsv(hex) {
    const [r, g, b] = hex.slice(1).match(/../g).map((value) => parseInt(value, 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let h = 0;
    if (delta) {
        if (max === r) h = ((g - b) / delta) % 6;
        else if (max === g) h = (b - r) / delta + 2;
        else h = (r - g) / delta + 4;
    }
    return { h: (h * 60 + 360) % 360, s: max ? delta / max : 0, v: max };
}

export function hsvToHex({ h, s, v }) {
    const chroma = v * s, x = chroma * (1 - Math.abs((h / 60) % 2 - 1)), m = v - chroma;
    const sectors = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x]];
    return '#' + sectors[Math.floor(h / 60) % 6].map((value) => Math.round((value + m) * 255).toString(16).padStart(2, '0')).join('');
}

export function normalizeHex(value) {
    const hex = value.trim();
    if (/^#[\da-f]{6}$/i.test(hex)) return hex.toLowerCase();
    if (/^#[\da-f]{3}$/i.test(hex)) return '#' + [...hex.slice(1)].map((digit) => digit + digit).join('').toLowerCase();
    return null;
}

export function nearestColor(hex, names) {
    const rgb = (value) => value.slice(1).match(/../g).map((part) => parseInt(part, 16));
    const target = rgb(hex);
    return Object.entries(names).map(([color, name]) => ({ name,
        distance: rgb(color).reduce((sum, channel, index) => sum + [2, 4, 3][index] * (channel - target[index]) ** 2, 0),
    })).sort((a, b) => a.distance - b.distance)[0]?.name ?? hex;
}

export function recommendedColors(field, settings, catalog, accent = false) {
    const spec = catalog.fields[field] ?? catalog.extra_fields[field];
    const option = { ...spec?.options.find((item) => item.id === settings[field]), ...spec?.option_details?.[settings[field]] };
    const fabric = settings.clothing?.[field]?.fabric;
    const material = fabric && fabric !== 'default' ? fabric : option.fabric;
    let colors;
    if (accent) colors = ['#c7cbd1', '#c7a45b', '#17151c', '#f2eadb', '#742b3e', '#542b46'];
    else if (['mesh', 'sheer_mesh', 'lace', 'opaque-lined lace', 'chiffon', 'sheer_organza', 'organza', 'tulle'].includes(material)) {
        colors = ['#17151c', '#34343c', '#f2eadb', '#bca58b', '#293446', '#542b46'];
    } else if (['plastic', 'pvc', 'vinyl'].includes(material)) colors = ['#17151c', '#34343c', '#f2eadb', '#bfd1d8', '#87979d', '#542b46'];
    else if (['metallic', 'holographic', 'chainmail', 'sequins'].includes(material)) colors = ['#c7cbd1', '#c7a45b', '#916644', '#17151c', '#293446', '#542b46'];
    else if (['leather', 'rexine', 'suede', 'patent'].includes(material)) colors = ['#17151c', '#a66c3e', '#916644', '#742b3e', '#f2eadb', '#34343c'];
    else if (material === 'denim') colors = ['#293446', '#536878', '#87979d', '#17151c', '#f2eadb', '#34343c'];
    else if (material === 'velvet' || settings[field]?.startsWith('goth_')) colors = ['#17151c', '#742b3e', '#245747', '#293446', '#542b46', '#34343c'];
    else if (field === 'skin_tone') colors = ['#f4d6c0', '#d7ad8b', '#bd8663', '#916644', '#65432b', '#38261f'];
    else if (field === 'hair_color') colors = ['#17151c', '#65432b', '#916644', '#8b3e2e', '#d6b85a', '#c7cbd1'];
    else if (field === 'eye_color') colors = ['#65432b', '#245747', '#536878', '#568fba', '#87979d', '#c7a45b'];
    else if (['earrings', 'necklace', 'piercings'].includes(field)) colors = ['#c7cbd1', '#c7a45b', '#916644', '#f2eadb', '#245747', '#542b46'];
    else if (['shoes', 'headwear', 'gloves', 'neckwear'].includes(field)) colors = ['#17151c', '#34343c', '#f2eadb', '#a66c3e', '#293446', '#742b3e'];
    else colors = ['#17151c', '#f2eadb', '#293446', '#742b3e', '#245747', '#542b46'];
    return colors.map((value) => ({ value, label: nearestColor(value, catalog.color_names) }));
}
