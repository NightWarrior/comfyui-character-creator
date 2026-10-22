import assert from 'node:assert/strict';
import test from 'node:test';
import { hexToHsv, hsvToHex, normalizeHex, nearestColor } from '../web/colors.js';

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
