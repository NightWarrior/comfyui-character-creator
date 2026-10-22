import assert from 'node:assert/strict';
import test from 'node:test';
import { promptChanges, renderPrompt, scrollPromptToChange } from '../web/prompt.js';

test('a very long prompt replaced by one word produces one highlight', () => {
    const before = Array.from({ length: 50000 }, (_, index) => `word${index}`).join(' ');
    assert.deepEqual(promptChanges(before, 'replacement'), [[0, 11]]);
});

test('prompt highlights include added and replaced words, keeping unchanged text unmarked', () => {
    const cases = [
        ['The hair is red.', 'The hair is blue.', ['blue']],
        ['The hair is red.', 'The hair is red and curly.', ['and curly']],
        ['Hair is red. Eyes are blue.', 'Hair is black. Eyes are green.', ['black', 'green']],
        ['An adult aged 30 years.', 'An adult aged 42 years.', ['42']],
        ['The subject is Persian.', 'The subject is Sámi.', ['Sámi']],
    ];
    for (const [before, after, expected] of cases) {
        assert.deepEqual(promptChanges(before, after).map(([start, end]) => after.slice(start, end)), expected);
    }
});

test('initial, unchanged, punctuation-only and removal-only prompts have no highlights', () => {
    for (const [before, after] of [
        ['', 'Initial character prompt.'], ['Same text.', 'Same text.'], ['Prompt.', ''],
        ['A shirt, jeans, gloves.', 'A shirt, jeans.'],
        ['A red shirt with blue jeans and gloves.', 'A shirt with jeans.'],
        ['The hair is red, and curly.', 'The hair is red and curly!'],
        ['The hair is red.', 'The  hair\nis red.'],
    ]) assert.deepEqual(promptChanges(before, after), [], `${before} -> ${after}`);
});

test('large custom templates stay bounded and do not highlight deletions', () => {
    const before = Array.from({ length: 2200 }, (_, index) => `word${index}`).join(' ');
    const after = Array.from({ length: 2200 }, (_, index) => index % 2 ? `word${index}` : '').filter(Boolean).join(' ');
    assert.deepEqual(promptChanges(before, after), []);
});

test('prompt rendering preserves exact selectable text and treats markup as literal text', () => {
    const originalDocument = globalThis.document;
    globalThis.document = {
        createTextNode: (text) => ({ textContent: text }),
        createElement: (tag) => ({ tag, textContent: '' }),
    };
    try {
        const view = { replaceChildren(...nodes) { this.nodes = nodes; } };
        const text = 'The shirt is <red> & blue.';
        const marks = renderPrompt(view, text, [[14, 17], [20, 24]]);
        assert.equal(view.nodes.map((node) => node.textContent).join(''), text);
        assert.equal(marks.length, 2);
        assert.ok(marks.every((mark) => mark.tag === 'mark' && mark.className === 'prompt-change'));
        renderPrompt(view, text, []);
        assert.equal(view.nodes.length, 1);
        assert.equal(view.nodes[0].textContent, text);
    } finally { globalThis.document = originalDocument; }
});

test('scrolling reveals the first changed text within the prompt without moving page focus', () => {
    const view = { scrollTop: 40, clientHeight: 300,
        getBoundingClientRect: () => ({ top: 20 }),
        scrollTo(value) { this.scrolled = value; } };
    scrollPromptToChange(view, { getBoundingClientRect: () => ({ top: 140 }) });
    assert.deepEqual(view.scrolled, { top: 60, behavior: 'smooth' });
    view.scrolled = null;
    scrollPromptToChange(view, undefined);
    assert.equal(view.scrolled, null);
    view.offsetHeight = 300;
    view.getBoundingClientRect = () => ({ top: 20, height: 150 });
    scrollPromptToChange(view, { getBoundingClientRect: () => ({ top: 140 }) });
    assert.deepEqual(view.scrolled, { top: 180, behavior: 'smooth' });
});
