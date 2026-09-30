import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

async function loadModule(file) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const geometry = await loadModule('../web/geometry.js');
const connections = await loadModule('../web/connections.js');
const colors = await loadModule('../web/colors.js');
const resizing = await loadModule('../web/resize.js');
assert.deepEqual(resizing.resizeBounds({x:0,y:0,width:240,height:180},'nw',-60,-40),{x:-60,y:-40,width:300,height:220});
assert.ok(colors.validFill(undefined));
assert.ok(colors.validFill('auto'));
assert.ok(colors.validFill('#ABC123'));
assert.ok(!colors.validFill('red;display:none'));
assert.equal(colors.fillStyle({fill:'auto'}), '');
assert.equal(colors.fillStyle({fill:'invalid'}), '');
assert.equal(colors.fillTextColor('#ffffff'), '#000000');
assert.equal(colors.fillTextColor('#000000'), '#ffffff');
const themeSource = await readFile(new URL('../web/theme.js', import.meta.url), 'utf8');
assert.equal(connections.edgePriority({a:'a',b:'b'}), 'normal');
assert.equal(connections.edgeDirection({a:'a',b:'b'}), 'forward');
assert.ok(connections.validConnection({a:'a',b:'b'}));
assert.ok(!connections.validConnection({a:'a',b:'b',priority:'unknown'}));
assert.ok(!connections.validConnection({a:'a',b:'b',direction:'unknown'}));
const pair = [{id:'a',title:'Основная',x:0,y:0},{id:'b',title:'Подидея',x:400,y:0}];
assert.match(connections.renderConnections([{a:'a',b:'b'}], pair, null), /marker-end="url\(#arrow-normal\)"/);
assert.match(connections.renderConnections([{a:'a',b:'b',direction:'backward',priority:'high'}], pair, 0), /marker-start="url\(#arrow-high\)"/);
assert.ok(!connections.renderConnections([{a:'a',b:'b',direction:'none'}], pair, null).includes('marker-end='));
assert.match(connections.connectionsMarkdown([{a:'a',b:'b',priority:'high'}], 'a', pair), /Основная → Подидея · Подидея: Подидея · приоритет: Высокий/);
assert.match(connections.connectionsMarkdown([{a:'a',b:'b',direction:'backward'}], 'a', pair), /Подидея → Основная · Основная идея: Подидея/);
// Endpoints stay outside each shape instead of hiding arrows under cards.
for (const shape of ['ellipse','rectangle','rounded','diamond','triangle']) {
    const path = connections.connectionPath({...pair[0],type:'shape',shape}, pair[1], {width:240,height:180}, {width:240,height:180});
    assert.ok(!/NaN|Infinity/.test(path));
    const end = path.match(/ (-?[\d.]+),(-?[\d.]+)$/);
    assert.equal(Number(end[1]), 394);
    assert.equal(Number(end[2]), 90);
}
assert.ok(geometry.strokeTouches([{x:0,y:0},{x:100,y:0}], {x:50,y:-50}, {x:50,y:50}, 2));
assert.ok(!geometry.strokeTouches([{x:0,y:0},{x:100,y:0}], {x:50,y:30}, {x:80,y:30}, 2));
const zoomed = geometry.zoomAt({x:20,y:30,z:1}, {x:150,y:200}, 1.5);
assert.equal((150-zoomed.x)/zoomed.z, 130);
assert.equal((200-zoomed.y)/zoomed.z, 170);

const mediaSource = await readFile(new URL('../web/media.js', import.meta.url), 'utf8');
const media = await import(`data:text/javascript;base64,${Buffer.from(mediaSource).toString('base64')}`);
assert.equal(media.videoReference('https://example.com/video?a=1').sourceType, 'url');
assert.equal(media.videoReference('C:\\Videos\\game.mp4').sourceType, 'path');
assert.throws(() => media.videoReference('javascript:alert(1)'));
assert.match(media.mediaMarkdown({ kind: 'video', name: 'Видео [1]', source: 'https://example.com/a b?q=1' }), /\[Видео \\\[1\\\]\]\(<https:\/\/example.com\/a%20b\?q=1>\)/);
assert.match(media.mediaMarkdown({ kind: 'video', name: 'game.mp4', source: 'C:\\Videos\\game.mp4' }), /C:\\Videos\\game.mp4/);
assert.match(media.mediaMarkdown({ kind: 'video', name: 'old.mp4' }), /путь не указан/);
assert.match(media.renderMedia({ kind: 'video', source: 'https://example.com/video', name: 'video' }, x => x), /rel="noopener noreferrer"/);

// Run the actual editor handlers with a minimal DOM; no browser/visual assertions.
const elements = new Map();
function element(id) {
    if (!elements.has(id)) elements.set(id, {
        innerHTML: '', value: '', style: {}, dataset: {}, children: [], listeners: {},
        offsetWidth: 220, offsetHeight: 320,
        setAttribute(name, value) { this[name] = value; },
        addEventListener(name, handler) { this.listeners[name] = handler; },
        getBoundingClientRect() { return {left:0,top:0,height:600}; },
        setPointerCapture() {}, focus() {}, scrollIntoView() {},
        append(child) { this.children.push(child); },
        querySelector() { return this.children[0]; },
        contains: () => false,
        querySelectorAll(selector) {
            const attribute = selector.slice(1, -1);
            const key = attribute.replace(/^data-/, '').replace(/-([a-z])/g, (_, x) => x.toUpperCase());
            return Array.from(this.innerHTML.matchAll(new RegExp(`${attribute}="(\\d+)"`, 'g')), match => {
                const item = element(`${attribute}-${match[1]}`);
                item.dataset[key] = match[1];
                return item;
            });
        },
    });
    return elements.get(id);
}
const context = vm.createContext({
    ...media, ...geometry, ...connections, ...colors, ...resizing, structuredClone, console, crypto: webcrypto,
    document: { getElementById: element, activeElement: null, addEventListener() {},
        documentElement: {dataset:{}}, body: {classList:{toggle(){}}},
        createElement() { return {setAttribute(){},focus(){}}; } },
    window: { addEventListener() {}, innerWidth:1200, innerHeight:800 },
    localStorage: { setItem(key,value) { this[key]=value; }, getItem(key) { return this[key]; } },
    setTimeout() { return 1; }, clearTimeout() {},
    alert(message) { throw Error(message); },
    confirm() { return true; },
});
let app = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');
app = app.replace(/^import[^\n]+\n/gm, '').split("try{const r=await fetch('/api/map');")[0];
vm.runInContext(themeSource.replace(/^export /gm, ''), context);
vm.runInContext((await readFile(new URL('../web/VoiceRecorder.js',import.meta.url),'utf8')).replace(/^export /gm,''),context);
vm.runInContext(app, context);
vm.runInContext(`
doc={nodes:[{id:'a',title:'A',note:'',level:2,status:'idea',stage:'',tags:'',x:0,y:0,media:[{kind:'video',name:'clip',source:'https://example.com/video'},{kind:'video',name:'local',source:'C:/Videos/game.mp4'}]},{id:'b',title:'B',note:'',level:1,status:'idea',stage:'',tags:'',x:300,y:0,media:[]}],edges:[{a:'a',b:'b'}],strokes:[]};selected='a';render();inspect();
`, context);
element('data-remove-edge-0').onclick();
assert.equal(vm.runInContext('doc.edges.length', context), 0);
vm.runInContext('history()', context);
assert.equal(vm.runInContext('doc.edges.length', context), 1);
vm.runInContext('history(true)', context);
assert.equal(vm.runInContext('doc.edges.length', context), 0);
element('videoSource').value = 'https://example.com/second-video';
element('addVideoSource').onclick();
assert.equal(vm.runInContext('node().media.length', context), 3);
const pathInput = element('data-media-source-1');
pathInput.value = 'D:/Game References/clip.mp4';
pathInput.onchange();
assert.equal(vm.runInContext('node().media[1].source', context), 'D:/Game References/clip.mp4');
vm.runInContext('history()', context);
assert.equal(vm.runInContext('node().media[1].source', context), 'C:/Videos/game.mp4');
vm.runInContext('history(true)', context);
vm.runInContext('download=(name,text)=>{globalThis.exported={name,text};}', context);
element('context').onclick();
assert.equal(context.exported.name, 'IDEAS.md');
assert.match(context.exported.text, /https:\/\/example.com\/video/);
assert.match(context.exported.text, /D:\/Game References\/clip.mp4/);
assert.ok(!context.exported.text.includes('Связи: B'));
// Erasing across a long segment removes the entire stroke, with one Undo entry.
vm.runInContext(`doc.strokes=[[{x:0,y:0},{x:100,y:0}],[{x:0,y:100},{x:100,y:100}]];view={x:0,y:0,z:1};past=[];future=[];setMode('erase');`, context);
const background = {closest:()=>null};
element('canvas').onpointerdown({button:0,target:background,clientX:50,clientY:-20,pointerId:1});
element('canvas').onpointermove({clientX:50,clientY:20});
element('canvas').onpointerup();
assert.equal(vm.runInContext('doc.strokes.length', context), 1);
assert.equal(vm.runInContext('past.length', context), 1);
vm.runInContext('history()', context);
assert.equal(vm.runInContext('doc.strokes.length', context), 2);
vm.runInContext('history(true)', context);
assert.equal(vm.runInContext('doc.strokes.length', context), 1);
// Right-button presses must not start drawing, dragging or erasing.
element('canvas').onpointerdown({button:2,target:background});
assert.equal(vm.runInContext('gesture', context), null);
vm.runInContext("setMode('select');add('shape',{x:50,y:50},'diamond');", context);
assert.match(element('nodes').innerHTML, /shape-diamond/);
element('shapeKind').onchange({target:{value:'triangle'}});
assert.equal(vm.runInContext('node().shape', context), 'triangle');
vm.runInContext('history()', context);
assert.equal(vm.runInContext('node().shape', context), 'diamond');
// Actual context-menu routing for an object, an edge, and empty canvas.
const shapeId = vm.runInContext('selected', context);
const card = {dataset:{id:shapeId}};
const rightClick = target => ({target,clientX:200,clientY:200,preventDefault(){}});
element('contextMenu').children=[];
element('canvas').oncontextmenu(rightClick({closest:s=>s==='.node'?card:null}));
element('contextMenu').children.find(b=>b.textContent==='Форма: Прямоугольник').onclick();
assert.equal(vm.runInContext('node().shape', context), 'rectangle');
element('contextMenu').children=[];
element('canvas').oncontextmenu(rightClick(background));
element('contextMenu').children.find(b=>b.textContent==='Создать: Овал').onclick();
assert.equal(vm.runInContext('node().shape', context), 'ellipse');
vm.runInContext("doc.edges=[{a:'a',b:'b'}];", context);
element('contextMenu').children=[];
element('canvas').oncontextmenu(rightClick({closest:s=>s==='[data-edge]'?{dataset:{edge:'0'}}:null}));
assert.match(element('inspector').innerHTML, /ДЕТАЛИ СВЯЗИ/);
element('edgeTo').onchange({target:{value:shapeId}});
assert.equal(vm.runInContext('doc.edges[0].b', context), shapeId);
vm.runInContext('history()', context);
assert.equal(vm.runInContext('doc.edges[0].b', context), 'b');
// Wheel handler anchors the world position under the mouse cursor.
vm.runInContext('view={x:20,y:30,z:1};', context);
element('canvas').listeners.wheel({deltaY:-50,deltaMode:0,clientX:150,clientY:200,preventDefault(){}});
assert.equal(vm.runInContext('(150-view.x)/view.z', context), 130);
assert.equal(vm.runInContext('(200-view.y)/view.z', context), 170);
const countBeforeTheme = vm.runInContext('past.length', context);
element('theme').onclick();
assert.equal(context.document.documentElement.dataset.theme, 'dark');
assert.equal(context.localStorage['inkmap-theme'], 'dark');
assert.equal(vm.runInContext('past.length', context), countBeforeTheme);
element('theme').onclick();
assert.equal(context.document.documentElement.dataset.theme, 'light');
vm.runInContext("doc.edges=[{a:'a',b:'b'}];selected=null;selectedEdge=0;inspect();", context);
element('edgePriority').onchange({target:{value:'high'}});
assert.match(element('lines').innerHTML, /edge priority-high selected-edge/);
element('edgeDirection').onchange({target:{value:'backward'}});
assert.match(element('lines').innerHTML, /marker-start="url\(#arrow-high\)"/);
vm.runInContext('history()', context);
assert.equal(vm.runInContext('edgeDirection(doc.edges[0])', context), 'forward');
vm.runInContext('history(true)', context);
assert.equal(vm.runInContext('doc.edges[0].direction', context), 'backward');
element('context').onclick();
assert.match(context.exported.text, /B → A · Основная идея: B · приоритет: Высокий/);
element('export').onclick();
const exported = JSON.parse(context.exported.text);
assert.equal(exported.edges[0].priority, 'high');
assert.equal(exported.edges[0].direction, 'backward');
// Import uses the same model and rejects unsupported metadata before mutation.
await element('fileInput').onchange({target:{files:[{name:'map.json',text:async()=>JSON.stringify(exported)}]}});
assert.equal(vm.runInContext('doc.edges[0].priority', context), 'high');
const invalid = structuredClone(exported);
invalid.edges[0].priority = 'invalid';
await assert.rejects(element('fileInput').onchange({target:{files:[{name:'map.json',text:async()=>JSON.stringify(invalid)}]}}), /Некорректная карта/);
assert.equal(vm.runInContext('doc.edges[0].priority', context), 'high');
// New links open their editor and carry explicit defaults.
vm.runInContext("doc.edges=[];setMode('link');", context);
for (const id of ['a','b']) element('canvas').onpointerdown({button:0,clientX:0,clientY:0,target:{closest:selector=>selector==='.node'?{dataset:{id}}:null}});
assert.equal(vm.runInContext('doc.edges[0].priority', context), 'normal');
assert.equal(vm.runInContext('doc.edges[0].direction', context), 'forward');
assert.equal(vm.runInContext('selectedEdge', context), 0);
const historyBeforeDuplicate = vm.runInContext('past.length', context);
vm.runInContext("setMode('link');", context);
for (const id of ['b','a']) element('canvas').onpointerdown({button:0,clientX:0,clientY:0,target:{closest:selector=>selector==='.node'?{dataset:{id}}:null}});
assert.equal(vm.runInContext('doc.edges.length', context), 1);
assert.equal(vm.runInContext('past.length', context), historyBeforeDuplicate);
assert.equal(vm.runInContext('selectedEdge', context), 0);
const parallel = connections.renderConnections([{a:'a',b:'b'},{a:'b',b:'a'}], pair, 0);
const paths = Array.from(parallel.matchAll(/class="edge-hit" d="([^"]+)"/g), match=>match[1]);
assert.equal(paths.length, 2);
assert.notEqual(paths[0], paths[1]);
vm.runInContext("selectedEdge=null;selected='a';inspect();", context);
const redIndex = colors.fillPalette.findIndex(color=>color.name==='Красный');
element(`data-fill-${redIndex}`).onclick();
assert.equal(vm.runInContext('node().fill', context), '#ea5545');
assert.match(element('nodes').innerHTML, /--node-fill:#ea5545/);
vm.runInContext('history()', context);
assert.equal(vm.runInContext('node().fill', context), undefined);
vm.runInContext('history(true)', context);
assert.equal(vm.runInContext('node().fill', context), '#ea5545');
element('customFill').onchange({target:{value:'#123456'}});
assert.equal(vm.runInContext('node().fill', context), '#123456');
assert.match(element('nodes').innerHTML, /--node-text:#ffffff/);
element('export').onclick();
const coloredExport = JSON.parse(context.exported.text);
coloredExport.nodes[0].width=320;coloredExport.nodes[0].height=210;
assert.equal(coloredExport.nodes[0].fill, '#123456');
await element('fileInput').onchange({target:{files:[{name:'colored.json',text:async()=>JSON.stringify(coloredExport)}]}});
assert.equal(vm.runInContext('doc.nodes[0].fill', context), '#123456');
assert.equal(vm.runInContext('doc.nodes[0].width', context),320);
assert.equal(vm.runInContext('doc.nodes[0].height', context),210);
const invalidColor = structuredClone(coloredExport);
invalidColor.nodes[0].fill='red;display:none';
await assert.rejects(element('fileInput').onchange({target:{files:[{name:'invalid.json',text:async()=>JSON.stringify(invalidColor)}]}}), /Некорректная карта/);
vm.runInContext("selected='a';inspect();", context);
element('data-fill-0').onclick();
assert.equal(vm.runInContext('node().fill', context), 'auto');
console.log('OK: editor regressions, edges/arrows/priorities, fills/contrast, Undo/Redo, Markdown/JSON export/import validation');
