export const fillPalette = [
    {name:'По теме',value:'auto'},
    {name:'Белый',value:'#ffffff'}, {name:'Светло-серый',value:'#d8d8d8'},
    {name:'Серый',value:'#838a87'}, {name:'Чёрный',value:'#202424'},
    {name:'Жёлтый',value:'#f6dc54'}, {name:'Золотой',value:'#ecb92c'},
    {name:'Оранжевый',value:'#f29a45'}, {name:'Красный',value:'#ea5545'},
    {name:'Розовый',value:'#f3b4bc'}, {name:'Малиновый',value:'#d72d66'},
    {name:'Пурпурный',value:'#bb3d9a'}, {name:'Фиолетовый',value:'#7446a6'},
    {name:'Синий',value:'#3e6fb0'}, {name:'Голубой',value:'#85b5d4'},
    {name:'Бирюзовый',value:'#42b6bd'}, {name:'Лаймовый',value:'#ced959'},
    {name:'Зелёный',value:'#84b859'}, {name:'Тёмно-зелёный',value:'#315a49'},
];

export const validFill = value => value === undefined || value === 'auto' || (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value));

function luminance(hex) {
    const rgb = hex.slice(1).match(/../g).map(channel => parseInt(channel,16)/255);
    const linear = rgb.map(value => value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
    return linear[0]*.2126 + linear[1]*.7152 + linear[2]*.0722;
}

export function fillTextColor(fill) {
    const background = luminance(fill);
    return (background+.05)/.05 >= 1.05/(background+.05) ? '#000000' : '#ffffff';
}

export function fillStyle(node) {
    if (!node.fill || node.fill === 'auto' || !validFill(node.fill)) return '';
    const text = fillTextColor(node.fill);
    return `--node-fill:${node.fill};--node-text:${text};--node-border:${text}55;--node-badge:${text}18;`;
}

export function paletteMarkup(fill='auto') {
    return `<div class="fill-palette" role="group" aria-label="Цвет заливки">${fillPalette.map((color,index)=>`<button type="button" class="fill-swatch ${color.value==='auto'?'fill-auto':''}" data-fill="${index}" title="${color.name}" aria-label="${color.name}" aria-pressed="${fill.toLowerCase()===color.value}" style="--swatch:${color.value==='auto'?'var(--card)':color.value};--swatch-text:${color.value==='auto'?'var(--text)':fillTextColor(color.value)}">${color.value==='auto'?'◐':fill.toLowerCase()===color.value?'✓':''}</button>`).join('')}</div>`;
}
