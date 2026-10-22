export function promptChanges(before, after) {
    if (!before || before === after) return [];
    const words = (text) => [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({
        value: match[0], start: match.index, end: match.index + match[0].length,
    }));
    const previous = words(before);
    const current = words(after);
    let start = 0;
    let oldEnd = previous.length;
    let newEnd = current.length;
    while (start < oldEnd && start < newEnd && previous[start].value === current[start].value) start++;
    while (oldEnd > start && newEnd > start && previous[oldEnd - 1].value === current[newEnd - 1].value) {
        oldEnd--;
        newEnd--;
    }
    const oldWords = previous.slice(start, oldEnd);
    const newWords = current.slice(start, newEnd);
    if (!newWords.length) return [];
    const added = [];
    let i = 0;
    let j = 0;
    const stride = newWords.length + 1;
    if ((oldWords.length + 1) * stride <= 1000000) {
        const lengths = new Uint32Array((oldWords.length + 1) * stride);
        for (let a = oldWords.length - 1; a >= 0; a--) {
            for (let b = newWords.length - 1; b >= 0; b--) {
                lengths[a * stride + b] = oldWords[a].value === newWords[b].value
                    ? 1 + lengths[(a + 1) * stride + b + 1] : Math.max(lengths[(a + 1) * stride + b], lengths[a * stride + b + 1]);
            }
        }
        while (j < newWords.length) {
            if (i < oldWords.length && oldWords[i].value === newWords[j].value) { i++; j++; }
            else if (i < oldWords.length && lengths[(i + 1) * stride + j] >= lengths[i * stride + j + 1]) i++;
            else added.push(j++);
        }
    } else {
        // Bound work for unusually large custom templates; deletion-only edits still produce no additions.
        const positions = new Map();
        oldWords.forEach((word, index) => {
            if (!positions.has(word.value)) positions.set(word.value, []);
            positions.get(word.value).push(index);
        });
        const cursors = new Map();
        for (; j < newWords.length; j++) {
            const matches = positions.get(newWords[j].value) ?? [];
            let cursor = cursors.get(newWords[j].value) ?? 0;
            while (cursor < matches.length && matches[cursor] < i) cursor++;
            cursors.set(newWords[j].value, cursor);
            if (cursor < matches.length) i = matches[cursor] + 1;
            else added.push(j);
        }
    }
    const ranges = [];
    for (let index = 0; index < added.length; index++) {
        const first = added[index];
        let last = first;
        while (added[index + 1] === last + 1) last = added[++index];
        ranges.push([newWords[first].start, newWords[last].end]);
    }
    return ranges;
}

export function renderPrompt(view, text, ranges) {
    const nodes = [];
    const marks = [];
    let offset = 0;
    for (const [start, end] of ranges) {
        nodes.push(document.createTextNode(text.slice(offset, start)));
        const mark = document.createElement('mark');
        mark.className = 'prompt-change';
        mark.textContent = text.slice(start, end);
        marks.push(mark);
        nodes.push(mark);
        offset = end;
    }
    nodes.push(document.createTextNode(text.slice(offset)));
    view.replaceChildren(...nodes);
    return marks;
}

export function scrollPromptToChange(view, mark) {
    if (!mark) return;
    const bounds = view.getBoundingClientRect();
    const scale = view.offsetHeight ? bounds.height / view.offsetHeight : 1;
    const top = view.scrollTop + (mark.getBoundingClientRect().top - bounds.top) / scale;
    view.scrollTo({ top: Math.max(0, top - view.clientHeight / 3), behavior: 'smooth' });
}
