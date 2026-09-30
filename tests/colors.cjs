const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
    const browser = await chromium.launch({channel:'msedge',headless:true});
    try {
        const page = await browser.newPage({viewport:{width:1440,height:1000}});
        const errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        const shapes=['ellipse','rectangle','rounded','diamond','triangle','idea'];
        let document={nodes:shapes.map((shape,i)=>({id:String(i),type:shape==='idea'?'idea':'shape',shape,x:(i%3)*300,y:i<3?30:310,title:shape==='idea'?'Идея проекта':`Фигура ${i+1}`,note:'Заметка к идее',level:1,status:'idea',stage:'',tags:'проект',media:[]})),edges:[],strokes:[]};
        let revision=1;
        await page.route('**/api/map',async route=>{
            if(route.request().method()==='PUT'){
                const payload=route.request().postDataJSON();
                assert.equal(payload.revision,revision);
                document=payload.document;
                await route.fulfill({json:{revision:++revision}});
            }else await route.fulfill({json:{revision,document}});
        });
        await page.goto('http://127.0.0.1:8000');
        await page.locator('.node').first().waitFor();
        const choices=[['Белый','rgb(255, 255, 255)'],['Жёлтый','rgb(246, 220, 84)'],['Красный','rgb(234, 85, 69)'],['Синий','rgb(62, 111, 176)'],['Фиолетовый','rgb(116, 70, 166)'],['Бирюзовый','rgb(66, 182, 189)']];
        for(let i=0;i<shapes.length;i++){
            await page.locator(`[data-id="${i}"]`).click();
            await page.locator('#inspector').getByRole('button',{name:choices[i][0],exact:true}).click();
            const fill=await page.locator(`[data-id="${i}"]`).evaluate((el,isShape)=>getComputedStyle(el,isShape?'::before':null).backgroundColor,i<5);
            assert.equal(fill,choices[i][1]);
            const text=await page.locator(`[data-id="${i}"] h3`).evaluate(el=>getComputedStyle(el).color);
            assert.ok(['rgb(0, 0, 0)','rgb(255, 255, 255)'].includes(text));
            for(const selector of ['small','p','.badge'])assert.equal(await page.locator(`[data-id="${i}"] ${selector}`).evaluate(el=>getComputedStyle(el).color),text);
        }
        await page.locator('#undo').click();
        const before=await page.locator('[data-id="5"]').evaluate(el=>getComputedStyle(el).backgroundColor);
        assert.notEqual(before,choices[5][1]);
        await page.locator('#redo').click();
        assert.equal(await page.locator('[data-id="5"]').evaluate(el=>getComputedStyle(el).backgroundColor),choices[5][1]);
        // Native custom color picker uses the same mutation and persistence path.
        await page.locator('#customFill').fill('#123456');
        await page.locator('#customFill').dispatchEvent('change');
        assert.equal(await page.locator('[data-id="5"]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(18, 52, 86)');
        assert.equal(await page.locator('[data-id="5"] h3').evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
        await page.locator('[data-id="5"]').click({button:'right'});
        await page.getByRole('menuitem',{name:'Цвет заливки…',exact:true}).click();
        assert.equal(await page.locator('#customFill').evaluate(el=>el===document.activeElement),true);
        const artifacts=path.join(__dirname,'artifacts');
        await fs.mkdir(artifacts,{recursive:true});
        await page.locator('#inspector').evaluate(el=>el.scrollTop=0);
        await page.screenshot({path:path.join(artifacts,'colors-light.png')});
        await page.locator('#theme').click();
        for(let i=0;i<5;i++)assert.equal(await page.locator(`[data-id="${i}"]`).evaluate(el=>getComputedStyle(el,'::before').backgroundColor),choices[i][1]);
        assert.equal(await page.locator('[data-id="5"]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(18, 52, 86)');
        await page.screenshot({path:path.join(artifacts,'colors-dark.png')});
        await page.waitForFunction(()=>document.getElementById('saveState').textContent==='● Сохранено');
        assert.equal(document.nodes[5].fill,'#123456');
        await page.reload();
        await page.locator('.node').first().waitFor();
        assert.equal(await page.locator('[data-id="5"]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(18, 52, 86)');
        await page.locator('[data-id="5"]').click();
        await page.locator('#inspector').getByRole('button',{name:'По теме',exact:true}).click();
        assert.equal(await page.locator('[data-id="5"]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(36, 47, 44)');
        await page.locator('#theme').click();
        assert.equal(await page.locator('[data-id="5"]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 254, 248)');
        assert.deepEqual(errors,[]);
        console.log('Colors browser OK: all five shapes + idea, palette/custom fill, text contrast, Undo/Redo, context menu, themes, reset and save/reload; user data untouched');
    }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
