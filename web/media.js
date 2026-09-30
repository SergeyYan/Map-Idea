export function videoReference(value) {
    const source = value.trim();
    if (!source) throw new Error('Укажите URL видео или путь к файлу.');
    if (/^https?:\/\//i.test(source)) {
        const url = new URL(source);
        if (!url.hostname) throw new Error('Некорректный URL видео.');
        return { source, sourceType: 'url' };
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(source) && !/^[a-z]:[\\/]/i.test(source)) {
        throw new Error('Для сайта используйте http:// или https://, для файла — путь к нему.');
    }
    if (/[\r\n\0]/.test(source)) throw new Error('Путь должен занимать одну строку.');
    return { source, sourceType: 'path' };
}

export function renderMedia(media, escape) {
    if (media.kind === 'video' && media.source) {
        if (/^https?:\/\//i.test(media.source)) {
            return `<a class="media-reference" href="${escape(media.source)}" target="_blank" rel="noopener noreferrer">▶ ${escape(media.name || 'Открыть видео')}</a>`;
        }
        if (!media.data) return `<p class="media-reference">Видео: ${escape(media.source)}</p>`;
    }
    if (media.kind === 'image') return `<img src="${escape(media.data)}" alt="${escape(media.name)}">`;
    if (['video', 'audio'].includes(media.kind) && media.data) return `<${media.kind} controls src="${escape(media.data)}"></${media.kind}>`;
    return '';
}

export function mediaMarkdown(media) {
    const name = String(media.name || media.kind).replace(/[\r\n]/g, ' ').replace(/[\\[\]]/g, '\\$&');
    if (media.source && /^https?:\/\//i.test(media.source)) {
        const target = media.source.replace(/ /g, '%20').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/[\r\n]/g, '');
        return `- ${media.kind === 'video' ? 'Видео' : 'Вложение'}: [${name}](<${target}>)`;
    }
    if (media.source) {
        const source = String(media.source).replace(/[\r\n]/g, ' ');
        const fence = '`'.repeat(Math.max(0, ...Array.from(source.matchAll(/`+/g), match => match[0].length)) + 1);
        return `- ${name} — путь: ${fence} ${source} ${fence}`;
    }
    return `- ${name}${media.kind === 'video' ? ' — путь не указан; добавьте его в панели вложений' : ''}`;
}
