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
