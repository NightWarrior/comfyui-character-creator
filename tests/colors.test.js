import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { hexToHsv, hsvToHex, normalizeHex, nearestColor, recommendedColors } from '../web/colors.js';

test('suggested palettes follow material and article, keep accent metals separate and never change the saved color', () => {
    const catalog = JSON.parse(readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
    const settings = { upper_garment: 'tshirt', colors: { upper_garment: '#ff0000' }, clothing: { upper_garment: { fabric: 'sheer_mesh' } } };
    const original = structuredClone(settings);
    const mesh = recommendedColors('upper_garment', settings, catalog);
    assert.equal(mesh.length, 6);
    assert.equal(mesh[0].value, '#17151c');
    assert.ok(!mesh.some((color) => color.value === '#ff0000'));
    assert.ok(mesh.every((color) => normalizeHex(color.value) && color.label === nearestColor(color.value, catalog.color_names)));
    const leather = recommendedColors('upper_garment', { ...settings, clothing: { upper_garment: { fabric: 'leather' } } }, catalog);
    assert.notDeepEqual(mesh, leather);
    assert.ok(leather.some((color) => color.value === '#a66c3e'));
    const accents = recommendedColors('upper_garment', settings, catalog, true);
    assert.ok(accents.some((color) => color.value === '#c7a45b'));
    assert.notDeepEqual(recommendedColors('hair_color', {}, catalog), recommendedColors('eye_color', {}, catalog));
    assert.deepEqual(settings, original);
});

test('color popup preserves RGB round trips including greys and hue wrap', () => {
    for (const value of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#fa0000', '#8b3e2e', '#808080', '#f4be90']) {
        assert.equal(hsvToHex(hexToHsv(value)), value);
    }
    assert.equal(hsvToHex({ h: 360, s: 1, v: 1 }), '#ff0000');
});

test('hex edits accept complete colors and leave partial or invalid edits unapplied', () => {
    assert.equal(normalizeHex(' #Fa0 '), '#ffaa00');
    assert.equal(normalizeHex('#ABCDEF'), '#abcdef');
    for (const value of ['', '#', '#ff', '#ff00', '#wrong', 'red', '#1234567']) assert.equal(normalizeHex(value), null);
});

test('color labels use the local verbal dictionary and nearest RGB entry', () => {
    const names = { '#000000': 'black', '#ff0000': 'bright red', '#ffffff': 'white' };
    assert.equal(nearestColor('#fa0000', names), 'bright red');
    assert.equal(nearestColor('#fefefe', names), 'white');
    assert.equal(nearestColor('#010101', names), 'black');
    assert.equal(nearestColor('#888800', { '#ff0000': 'red', '#00ff00': 'green' }), 'green');
});
