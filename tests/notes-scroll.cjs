const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],alerts=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{alerts.push(d.message());await d.dismiss();});
  const note=Array.from({length:100},(_,i)=>'Строка '+i+' полный текст заметки').join('\n');
  let document={nodes:[{id:'note',type:'idea',x:30,y:30,title:'Заметка',note,level:1,status:'idea',tags:'',stage:'',media:[]}],edges:[],strokes:[]},revision=1;
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
  const paragraph=page.locator('.node-note');
  assert.equal(await paragraph.textContent(),note);
  const metrics=await paragraph.evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight}));assert.ok(metrics.scroll>metrics.height);
  const zoom=await page.locator('#zoom').textContent();
  await paragraph.hover();await page.mouse.wheel(0,400);await page.waitForTimeout(150);
  assert.ok(await paragraph.evaluate(el=>el.scrollTop)>0);assert.equal(await page.locator('#zoom').textContent(),zoom);
  const before=await page.locator('.node').getAttribute('style');
  const box=await paragraph.boundingBox();
  await page.mouse.move(box.x+box.width-4,box.y+20);await page.mouse.down();await page.mouse.move(box.x+box.width-4,box.y+70);await page.mouse.up();
  assert.equal(await page.locator('.node').getAttribute('style'),before);
  await page.locator('.node h3').click();await page.locator('#level').selectOption('2');assert.equal(await paragraph.textContent(),note);
  await page.locator('#level').selectOption('0');assert.equal(await paragraph.count(),0);
  await page.locator('#level').selectOption('1');assert.equal(await paragraph.textContent(),note);
  await page.waitForFunction(()=>document.querySelector('#saveState').textContent==='● Сохранено');await page.reload();await paragraph.waitFor();assert.equal(await paragraph.textContent(),note);
  assert.deepEqual(errors,[]);assert.deepEqual(alerts,[]);console.log('OK: full note, overflow, real wheel scroll without zoom, scrollbar without card drag, levels, save/reload; isolated board');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
