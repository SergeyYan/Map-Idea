const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
    const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
    try{
        const page=await browser.newPage({viewport:{width:1440,height:1000},permissions:['microphone']});
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>{
            const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            window.voiceTracks=[];
            navigator.mediaDevices.getUserMedia=async options=>{window.voiceConstraints=options;const stream=await get(options);window.voiceTracks.push(...stream.getTracks());return stream;};
        });
        const make=(id,x,type)=>({id,x,y:40,type,shape:'ellipse',title:id,note:'',level:1,status:'idea',stage:'',tags:'',media:[]});
        let document={nodes:[make('idea',0,'idea'),make('shape',350,'shape')],edges:[],strokes:[]},revision=1;
        await page.route('**/api/map',async route=>{if(route.request().method()==='PUT'){const d=route.request().postDataJSON();assert.equal(d.revision,revision);document=d.document;await route.fulfill({json:{revision:++revision}});}else await route.fulfill({json:{revision,document}});});
        await page.goto('http://127.0.0.1:8000');
        await page.locator('[data-id="idea"]').click();
        await page.locator('#recordVoice').click();
        await page.waitForFunction(()=>document.getElementById('voiceState').textContent.includes('Идёт запись'));
        await page.waitForTimeout(1200);
        await page.locator('[data-id="shape"]').click();
        assert.equal(await page.locator('#recordVoice').isDisabled(),true);
        await page.locator('#voiceStop').click();
        await page.locator('[data-id="idea"] audio').waitFor();
        await page.waitForFunction(()=>window.voiceTracks.every(track=>track.readyState==='ended'));
        assert.equal(await page.evaluate(()=>window.voiceConstraints.audio.channelCount),1);
        await page.locator('[data-id="idea"] audio').evaluate(async el=>{await el.play();});
        assert.equal(await page.locator('[data-id="idea"] audio').evaluate(el=>el.paused),false);
        await page.locator('[data-id="idea"] audio').evaluate(el=>el.pause());
        await page.locator('#undo').click();
        assert.equal(await page.locator('audio').count(),0);
        await page.locator('#redo').click();
        assert.equal(await page.locator('[data-id="idea"] audio').count(),1);
        await page.locator('[data-id="shape"]').click();
        await page.locator('#recordVoice').click();
        await page.waitForFunction(()=>document.getElementById('voiceState').textContent.includes('Идёт запись'));
        await page.waitForTimeout(1200);
        await page.locator('#voiceCancel').click();
        assert.equal(await page.locator('audio').count(),1);
        assert.equal(await page.evaluate(()=>window.voiceTracks.every(track=>track.readyState==='ended')),true);
        await page.locator('#recordVoice').click();
        await page.waitForFunction(()=>document.getElementById('voiceState').textContent.includes('Идёт запись'));
        await page.waitForTimeout(1200);
        await page.locator('#voiceStop').click();
        await page.locator('[data-id="shape"] audio').waitFor();
        await page.waitForFunction(()=>document.getElementById('saveState').textContent==='● Сохранено');
        for(const node of document.nodes){assert.equal(node.media.length,1);assert.equal(node.media[0].kind,'audio');assert.ok(node.media[0].size>0&&node.media[0].size<100000);assert.match(node.media[0].data,/^data:audio\//);}
        await page.reload();
        await page.locator('[data-id="shape"] audio').waitFor();
        assert.equal(await page.locator('audio').count(),2);
        await page.locator('[data-id="idea"]').click();
        // Pending permission cancellation must release a late-arriving stream.
        await page.evaluate(()=>{const original=navigator.mediaDevices.getUserMedia;navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window.resolveVoicePermission=async()=>resolve(await original({audio:true}));});});
        await page.locator('#recordVoice').click();
        await page.locator('#voiceCancel').click();
        await page.evaluate(()=>window.resolveVoicePermission());
        await page.waitForFunction(()=>window.voiceTracks.every(track=>track.readyState==='ended'));
        assert.equal(await page.locator('audio').count(),2);
        await page.evaluate(()=>navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');});
        const dialogPromise=page.waitForEvent('dialog');
        const deniedClick=page.locator('#recordVoice').click();
        const dialog=await dialogPromise;assert.match(dialog.message(),/Доступ к микрофону запрещён/);await dialog.accept();await deniedClick;
        assert.equal(await page.locator('#recordVoice').isEnabled(),true);
        assert.deepEqual(errors,[]);
        console.log('Voice browser OK: real MediaRecorder with synthetic microphone, playback, target switching, cancel/late permission/denial, tracks released, Undo/Redo and save/reload; user data untouched');
    }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
