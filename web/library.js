const STORAGE_KEY = 'character-creator.characters.v1';

function sorted(value) {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
    return value;
}

export function characterKey(settings, catalog) {
    const value = { model: 'qwen_image_2_1', template: 'character', age: 30, colors: {}, clothing: {}, ethnicity: 'unspecified' };
    for (const [name, field] of Object.entries({ ...catalog.fields, ...catalog.extra_fields })) value[name] = field.default;
    return JSON.stringify(sorted({ ...value, ...settings }));
}

function nameValue(name) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) throw new Error('Use a character name between 1 and 80 characters.');
    return name.trim();
}

export class CharacterLibrary {
    constructor(storage, starters) {
        this.storage = storage;
        this.listeners = new Set();
        const saved = storage?.getItem(STORAGE_KEY);
        const document = saved === null || saved === undefined ? { version: 1, characters: structuredClone(starters) } : JSON.parse(saved);
        if (document.version !== 1 || !Array.isArray(document.characters)
            || new Set(document.characters.map((row) => row.id)).size !== document.characters.length
            || document.characters.some((row) => typeof row.id !== 'string' || !row.settings || typeof row.settings !== 'object' || typeof row.name !== 'string')) {
            throw new Error('The saved character library is invalid. Export or back up browser storage before resetting it.');
        }
        this.characters = document.characters;
    }

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    commit(characters) {
        this.storage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, characters }));
        this.characters = characters;
        for (const callback of this.listeners) callback();
    }

    add(settings, name = 'New character') {
        const row = { id: crypto.randomUUID(), name: nameValue(name), settings: structuredClone(settings) };
        this.commit([...this.characters, row]);
        return row;
    }

    rename(id, name) {
        const value = nameValue(name);
        this.commit(this.characters.map((row) => row.id === id ? { ...row, name: value } : row));
    }

    remove(id) {
        this.commit(this.characters.filter((row) => row.id !== id));
    }

    update(id, settings, catalog) {
        const row = this.characters.find((row) => row.id === id);
        if (!row || characterKey(row.settings, catalog) === characterKey(settings, catalog)) return;
        this.commit(this.characters.map((row) => row.id === id ? { ...row, settings: structuredClone(settings) } : row));
    }

    setImage(id, image, completedAt) {
        if (!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 200000) throw new Error('Invalid character thumbnail.');
        const row = this.characters.find((row) => row.id === id);
        if (!row || (row.image_time ?? 0) >= completedAt) return;
        this.commit(this.characters.map((row) => row.id === id ? { ...row, image, image_time: completedAt } : row));
    }
}

// Read the executed snapshot, never the current graph: users may edit or queue another character while sampling.
export function generatedCharacters(history, catalog) {
    const graph = history.prompt?.[2];
    if (!graph || !history.outputs) return [];
    const workflowNodes = history.prompt?.[3]?.extra_pnginfo?.workflow?.nodes ?? [];
    function dependsOn(id, ancestor, seen = new Set()) {
        if (seen.has(String(id))) return false;
        seen.add(String(id));
        return Object.values(graph[id]?.inputs ?? {}).some((value) => Array.isArray(value)
            && value.length === 2 && graph[value[0]] && (String(value[0]) === String(ancestor)
                ? value[1] === 0 : dependsOn(value[0], ancestor, seen)));
    }
    const result = [];
    for (const [id, node] of Object.entries(graph)) {
        if (node.class_type !== 'CharacterCreator') continue;
        const imageNodes = Object.entries(history.outputs).filter(([outputId, output]) => output.images?.length && dependsOn(outputId, id));
        imageNodes.sort(([a], [b]) => Number(graph[b]?.class_type === 'SaveImage') - Number(graph[a]?.class_type === 'SaveImage'));
        const image = imageNodes.map(([, output]) => output.images.filter((image) => image.type === 'output' || image.type === 'temp').at(-1)).find(Boolean);
        if (!image) continue;
        const characterId = workflowNodes.find((node) => String(node.id) === id)?.properties?.character_creator_character_id;
        if (characterId) {
            result.push({ characterId, image });
            continue;
        }
        const inputs = node.inputs;
        if (typeof inputs.character_code === 'string' && inputs.character_code.trim()) {
            result.push({ payload: { code: inputs.character_code }, image });
            continue;
        }
        const settings = { model: 'qwen_image_2_1', template: 'character' };
        let connected = false;
        for (const [name, fallback] of Object.entries({ ...Object.fromEntries(Object.entries({ ...catalog.fields, ...catalog.extra_fields }).map(([name, field]) => [name, field.default])), model: settings.model, template: settings.template, age: 30, colors: '{}', clothing: '{}', ethnicity: 'unspecified', character_code: '' })) {
            const value = inputs[name] ?? fallback;
            if (Array.isArray(value)) { connected = true; break; }
            if (name === 'character_code') continue;
            settings[name] = name === 'colors' || name === 'clothing' ? JSON.parse(value) : value;
        }
        if (!connected) result.push({ payload: { settings }, image });
    }
    return result;
}

export function generationTime(history) {
    return history.status?.messages?.findLast(([event]) => event === 'execution_success')?.[1]?.timestamp ?? 0;
}

export async function imageThumbnail(image, api, completedAt, signal) {
    signal?.throwIfAborted();
    const query = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder ?? '', type: image.type });
    if (completedAt) query.set('t', completedAt);
    const source = new Image();
    const cancel = () => { source.src = ''; };
    signal?.addEventListener('abort', cancel, { once: true });
    const canvas = document.createElement('canvas');
    try {
        source.src = api.apiURL(`/view?${query}`);
        await source.decode();
        signal?.throwIfAborted();
        canvas.width = 256;
        canvas.height = 320;
        const scale = Math.max(canvas.width / source.naturalWidth, canvas.height / source.naturalHeight);
        canvas.getContext('2d').drawImage(source, (canvas.width - source.naturalWidth * scale) / 2,
            (canvas.height - source.naturalHeight * scale) / 2, source.naturalWidth * scale, source.naturalHeight * scale);
        return canvas.toDataURL('image/webp', 0.8);
    } finally {
        signal?.removeEventListener('abort', cancel);
        source.src = '';
        canvas.width = canvas.height = 0;
    }
}

let library;
export function getLibrary(catalog) {
    library ??= new CharacterLibrary(globalThis.localStorage, catalog.characters ?? []);
    return library;
}
