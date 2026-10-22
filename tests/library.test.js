import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CharacterLibrary, characterKey, generatedCharacters, generationTime, imageThumbnail } from '../web/library.js';

const catalog = JSON.parse(readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
const starters = JSON.parse(readFileSync(new URL('../web/characters.json', import.meta.url), 'utf8'));
const cover = 'data:image/webp;base64,AAAA';
function memoryStorage() {
    const values = new Map();
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('library starts with three adults, saves edits and names, and never resurrects deleted characters', () => {
    const storage = memoryStorage();
    const library = new CharacterLibrary(storage, starters);
    assert.equal(library.characters.length, 3);
    assert.equal(library.characters[0].settings.age, 24);
    const original = structuredClone(starters);
    let notifications = 0;
    const unsubscribe = library.subscribe(() => notifications++);
    const added = library.add(starters[0].settings, '  My character  ');
    library.rename(added.id, 'Ruby');
    library.update(added.id, { ...added.settings, age: 27 }, catalog);
    assert.equal(new CharacterLibrary(storage, starters).characters.at(-1).settings.age, 27);
    assert.equal(library.characters.at(-1).name, 'Ruby');
    assert.equal(notifications, 3);
    assert.throws(() => library.rename(added.id, '  '), /name/);
    assert.throws(() => library.add(added.settings, 'x'.repeat(81)), /name/);
    unsubscribe();
    for (const row of [...library.characters]) library.remove(row.id);
    assert.deepEqual(new CharacterLibrary(storage, starters).characters, []);
    assert.deepEqual(starters, original);
});

test('thumbnail updates follow character identity, preserve latest generation and ignore deleted records', () => {
    const library = new CharacterLibrary(memoryStorage(), starters);
    const row = library.characters[0];
    library.setImage(row.id, cover, 200);
    library.setImage(row.id, 'data:image/webp;base64,BBBB', 100);
    assert.equal(library.characters[0].image, cover);
    library.update(row.id, { ...row.settings, age: 29 }, catalog);
    library.setImage(row.id, 'data:image/webp;base64,CCCC', 300);
    assert.equal(library.characters[0].image, 'data:image/webp;base64,CCCC');
    library.remove(row.id);
    library.setImage(row.id, cover, 400);
    assert.ok(!library.characters.some((item) => item.id === row.id));
    assert.throws(() => library.setImage('celeste', 'https://example.com/image.png', 500), /thumbnail/);
});

test('storage errors do not discard an existing library or partially mutate a character', () => {
    const storage = memoryStorage();
    const library = new CharacterLibrary(storage, starters);
    const before = structuredClone(library.characters);
    storage.setItem = () => { throw new Error('Quota exceeded'); };
    assert.throws(() => library.rename('scarlet', 'Lost name'), /Quota/);
    assert.deepEqual(library.characters, before);
    assert.throws(() => new CharacterLibrary({ getItem: () => '{broken' }, starters), SyntaxError);
});

test('character matching normalizes optional defaults and object order', () => {
    const value = starters[0].settings;
    assert.equal(characterKey(value, catalog), characterKey({ ...value, gloves: 'none', ethnicity: 'unspecified' }, catalog));
    assert.notEqual(characterKey(value, catalog), characterKey({ ...value, age: 31 }, catalog));
    assert.equal(characterKey(value, catalog), characterKey({ ...value, colors: Object.fromEntries(Object.entries(value.colors).reverse()) }, catalog));
});

function historyFixture() {
    const inputs = { ...starters[0].settings, colors: JSON.stringify(starters[0].settings.colors), clothing: JSON.stringify(starters[0].settings.clothing) };
    const graph = {
        1: { class_type: 'CharacterCreator', inputs },
        2: { class_type: 'LoadImage', inputs: {} },
        3: { class_type: 'PreviewImage', inputs: { images: ['2', 0] } },
        4: { class_type: 'TextEncodeQwenImage21', inputs: { prompt: ['1', 0] } },
        5: { class_type: 'KSampler', inputs: { positive: ['4', 0] } },
        6: { class_type: 'SaveImage', inputs: { images: ['5', 0] } },
    };
    return { prompt: [0, 'test', graph], outputs: {
        3: { images: [{ filename: 'guide.png', type: 'temp' }] },
        6: { images: [{ filename: 'character.png', subfolder: 'CharacterCreator', type: 'output' }] },
    } };
}

test('history attribution follows output ancestry and uses the executed character, excluding hint previews', () => {
    const history = historyFixture();
    const [match] = generatedCharacters(history, catalog);
    assert.equal(match.image.filename, 'character.png');
    assert.equal(characterKey(match.payload.settings, catalog), characterKey(starters[0].settings, catalog));
    delete history.outputs[6];
    assert.deepEqual(generatedCharacters(history, catalog), []);
});

test('a shared control stack alone does not make a creator the source of the generated character', () => {
    const history = historyFixture();
    history.prompt[2][5].inputs = { model: ['1', 2] };
    assert.deepEqual(generatedCharacters(history, catalog), []);
});

test('queued character identity survives edits and selects the last image in the saved batch', () => {
    const history = historyFixture();
    history.prompt[3] = { extra_pnginfo: { workflow: { nodes: [{ id: 1, properties: { character_creator_character_id: 'scarlet' } }] } } };
    history.prompt[2][1].inputs.age = ['99', 0];
    history.outputs[6].images.push({ filename: 'latest-in-batch.png', type: 'output' });
    const [match] = generatedCharacters(history, catalog);
    assert.equal(match.characterId, 'scarlet');
    assert.equal(match.image.filename, 'latest-in-batch.png');
    assert.equal(match.payload, undefined);
    history.status = { messages: [['execution_start', { timestamp: 100 }], ['execution_success', { timestamp: 300 }]] };
    assert.equal(generationTime(history), 300);
    assert.equal(generationTime({}), 0);
});

test('connected unknown character settings are not attributed to a cover; connected CC1 requires resolve', () => {
    const history = historyFixture();
    history.prompt[2][1].inputs.age = ['99', 0];
    assert.deepEqual(generatedCharacters(history, catalog), []);
    history.prompt[2][1].inputs.character_code = 'CC1.test';
    assert.deepEqual(generatedCharacters(history, catalog)[0].payload, { code: 'CC1.test' });
    history.prompt[2][1].inputs.character_code = ['99', 0];
    assert.deepEqual(generatedCharacters(history, catalog), []);
});

test('thumbnail conversion uses only the local view endpoint and a bounded portrait cover', async () => {
    const originalImage = globalThis.Image;
    const originalDocument = globalThis.document;
    let drawn;
    const urls = [];
    try {
        globalThis.Image = class { naturalWidth = 1024; naturalHeight = 1024; set src(value) { urls.push(value); } async decode() {} };
        const canvas = { getContext: () => ({ drawImage(...args) { drawn = args; } }), toDataURL: () => cover };
        globalThis.document = { createElement: () => canvas };
        assert.equal(await imageThumbnail({ filename: 'render with spaces.png', subfolder: 'CharacterCreator', type: 'output' }, { apiURL: (value) => value }), cover);
        assert.match(urls[0], /^\/view\?/);
        assert.equal(new URL(urls[0], 'http://localhost').searchParams.get('filename'), 'render with spaces.png');
        assert.equal(urls.at(-1), '');
        assert.equal(canvas.width, 0);
        assert.equal(canvas.height, 0);
        assert.equal(drawn[3], 320);
        assert.equal(drawn[4], 320);
    } finally { globalThis.Image = originalImage; globalThis.document = originalDocument; }
});

test('aborting a pending thumbnail releases its image source, canvas and listener', async () => {
    const originalImage = globalThis.Image, originalDocument = globalThis.document;
    const controller = new AbortController();
    const listeners = new Set();
    const signal = { throwIfAborted: () => controller.signal.throwIfAborted(),
        addEventListener: (name, callback, options) => { listeners.add(callback); controller.signal.addEventListener(name, callback, options); },
        removeEventListener: (name, callback) => { listeners.delete(callback); controller.signal.removeEventListener(name, callback); } };
    let source, rejectDecode;
    const canvas = {};
    try {
        globalThis.Image = class {
            constructor() { source = this; }
            set src(value) { this.url = value; if (!value) rejectDecode?.(new DOMException('Decode cancelled', 'AbortError')); }
            decode() { return new Promise((resolve, reject) => { rejectDecode = reject; }); }
        };
        globalThis.document = { createElement: () => canvas };
        const pending = imageThumbnail({ filename: 'image.png', type: 'output' }, { apiURL: (value) => value }, 0, signal);
        controller.abort();
        await assert.rejects(pending, { name: 'AbortError' });
        assert.equal(source.url, '');
        assert.equal(canvas.width, 0);
        assert.equal(listeners.size, 0);
        source = null;
        await assert.rejects(imageThumbnail({}, {}, 0, signal), { name: 'AbortError' });
        assert.equal(source, null);
    } finally { globalThis.Image = originalImage; globalThis.document = originalDocument; }
});
