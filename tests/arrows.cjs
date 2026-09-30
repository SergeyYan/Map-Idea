const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const makeNode = (id, x, shape) => ({ id, x, y:80, type:'shape', shape, title:'Фигура', note:'', level:1, status:'idea', stage:'', tags:'', media:[] });
        // Reproduce the screenshot: two opposite edges with coincident routes,
        // identical titles, oval/triangle endpoints, and the selected red edge.
        let document = {
            nodes:[makeNode('A',0,'ellipse'),makeNode('B',480,'triangle')],
            edges:[{a:'A',b:'B',priority:'high',direction:'forward'},{a:'B',b:'A',priority:'normal',direction:'forward'}],
            strokes:[],
        };
        let revision = 1;
        await page.route('**/api/map', async route => {
            if (route.request().method() === 'PUT') {
                const data = route.request().postDataJSON();
                assert.equal(data.revision, revision);
                document = data.document;
                await route.fulfill({json:{revision:++revision}});
            } else await route.fulfill({json:{revision,document}});
        });
        await page.goto('http://127.0.0.1:8000');
        await page.locator('.edge-hit').first().waitFor();
        await page.locator('#theme').click();
        const sample = async (index, t) => page.locator('.edge-hit').nth(index).evaluate((el,t) => {
            const p = el.getPointAtLength(el.getTotalLength()*t);
            const screen = new DOMPoint(p.x,p.y).matrixTransform(el.getScreenCTM());
            return {x:screen.x,y:screen.y};
        }, t);
        const screenDistance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
        assert.ok(screenDistance(await sample(0,.5),await sample(1,.5))>30, 'Curves must not overlap');
        assert.ok(screenDistance(await sample(0,0),await sample(1,1))>12, 'Arrow tips near A must be separate');
        assert.ok(screenDistance(await sample(0,1),await sample(1,0))>12, 'Arrow tips near B must be separate');
        const middle = await sample(0,.5);
        await page.mouse.click(middle.x,middle.y);
        assert.match(await page.locator('[data-id="A"] small').textContent(), /УЗЕЛ A/);
        assert.match(await page.locator('[data-id="B"] small').textContent(), /УЗЕЛ B/);
        const artifacts = path.join(__dirname,'artifacts');
        await fs.mkdir(artifacts,{recursive:true});
        for (const direction of ['forward','backward','both','none','forward','none']) {
            await page.locator('#edgeDirection').selectOption(direction);
            const red = page.locator('.edge').first();
            assert.equal(await red.getAttribute('marker-start'), ['backward','both'].includes(direction)?'url(#arrow-high)':null);
            assert.equal(await red.getAttribute('marker-end'), ['forward','both'].includes(direction)?'url(#arrow-high)':null);
            assert.equal(await page.locator('.edge').nth(1).getAttribute('marker-end'), 'url(#arrow-normal)');
            assert.equal(await page.locator('.edge').nth(1).getAttribute('marker-start'), null);
            await page.screenshot({path:path.join(artifacts,`arrows-${direction}.png`)});
        }
        // Reverse-order linking opens the existing edge and leaves history unchanged.
        await page.locator('#link').click();
        await page.locator('[data-id="B"]').click();
        await page.locator('[data-id="A"]').click();
        assert.equal(await page.locator('.edge-hit').count(), 2);
        assert.equal(await page.locator('#edgeDirection').inputValue(), 'none');
        await page.locator('#undo').click();
        assert.equal(await page.locator('.edge').first().getAttribute('marker-end'), 'url(#arrow-high)');
        await page.locator('#redo').click();
        assert.equal(await page.locator('.edge').first().getAttribute('marker-end'), null);
        await page.waitForFunction(() => document.getElementById('saveState').textContent === '● Сохранено');
        assert.equal(document.edges.length,2,'Preserve existing duplicates without deleting data');
        assert.equal(document.edges[0].direction,'none');
        assert.equal(document.edges[1].direction,'forward');
        assert.deepEqual(errors,[]);
        console.log('Arrows browser OK: opposite-edge reproduction, separated curves/tips, all directions, A/B labels, duplicate prevention, history and save; user data untouched');
    } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
