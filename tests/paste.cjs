const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],alerts=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{alerts.push(d.message());await d.dismiss();});
  let document={nodes:[],edges:[],strokes:[]},revision=1;
  await page.route('https://inkmap.test/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/api/map'){
    if(route.request().method()==='PUT'){const data=route.request().postDataJSON();assert.equal(data.revision,revision);document=data.document;await route.fulfill({json:{revision:++revision}});}
    else await route.fulfill({json:{revision,document}});return;
   }
   if(url.pathname.startsWith('/api/')){await route.fulfill({json:{threads:[],results:[],connected:false}});return;}
   const file=url.pathname==='/'?'index.html':url.pathname.replace('/static/','');
   await route.fulfill({body:await fs.readFile(path.join(__dirname,'../web',file)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
  });
  await page.goto('https://inkmap.test/');await page.waitForFunction(()=>document.querySelector('#saveState').textContent==='● Сохранено');
  const paste=async(payload,target='body')=>page.evaluate(({payload,target})=>{
   const data=new DataTransfer();
   if(payload.text!==undefined)data.setData('text/plain',payload.text);
   for(const f of payload.files||[])data.items.add(new File([Uint8Array.from(atob(f.data||'YWJj'),c=>c.charCodeAt(0))],f.name,{type:f.type}));
   const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});document.querySelector(target).dispatchEvent(event);return event.defaultPrevented;
  },{payload,target});
  assert.equal(await paste({text:'Первая строка\nПолная заметка'}),true);
  await page.locator('.node').waitFor();assert.equal(await page.locator('.node p').textContent(),'Первая строка\nПолная заметка');
  assert.equal(await paste({text:'Не новая карточка'},'#note'),false);assert.equal(await page.locator('.node').count(),1);
  await page.locator('#undo').click();assert.equal(await page.locator('.node').count(),0);await page.locator('#redo').click();
  await paste({files:[{name:'screen.png',type:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII='},{name:'clip.webm',type:'video/webm'}]});
  await page.locator('.node img').waitFor();assert.equal(await page.locator('.node').count(),3);assert.equal(await page.locator('.node video').count(),1);
  await page.locator('#undo').click();assert.equal(await page.locator('.node').count(),1);await page.locator('#redo').click();
  await page.locator('.node').filter({has:page.locator('img')}).click({position:{x:10,y:10}});
  const image=page.locator('.node img'),before=await image.evaluate(el=>el.getBoundingClientRect().width);
  const handle=await page.locator('.selected [data-resize="w"]').boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2-100,handle.y+handle.height/2);await page.mouse.up();
  assert.ok(await image.evaluate(el=>el.getBoundingClientRect().width)>before+90);
  await page.waitForFunction(()=>document.querySelector('#saveState').textContent==='● Сохранено');assert.equal(document.nodes.length,3);
  await page.reload();await page.locator('.node img').waitFor();assert.equal(await page.locator('.node').count(),3);
  await paste({files:[{name:'bad.exe',type:'application/octet-stream'}]});await page.waitForTimeout(100);assert.equal(await page.locator('.node').count(),3);assert.ok(alerts.some(x=>x.includes('Поддерживаются')));
  assert.deepEqual(errors,[]);console.log('OK: browser paste text/image/video, native field paste, batch Undo/Redo, image resize, save/reload, unsupported file; isolated test board');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

