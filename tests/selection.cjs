const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],alerts=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{alerts.push(d.message());await d.dismiss();});
  const make=(id,x)=>({id,x,y:40,type:'idea',title:id,note:'',level:1,status:'idea',tags:'',stage:'',media:[]});
  let document={nodes:[make('a',40),make('b',330),make('c',680)],edges:[{a:'a',b:'b'}],strokes:[]},revision=1;
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
  const canvas=await page.locator('#canvas').boundingBox();
  const drag=async(x,y,dx,dy,button='left')=>{await page.mouse.move(x,y);await page.mouse.down({button});await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up({button});};
  const coords=async()=>page.locator('.node').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.id,x:parseFloat(n.style.left),y:parseFloat(n.style.top)})));
  const initial=await coords();const a=await page.locator('[data-id="a"]').boundingBox(),b=await page.locator('[data-id="b"]').boundingBox();
  await drag(a.x-15,a.y-15,b.x+b.width-a.x+30,b.y+b.height-a.y+30);
  assert.equal(await page.locator('.node.selected').count(),2);assert.equal(await page.locator('.selection-box').count(),0);
  assert.equal(await page.locator('#undo').isDisabled(),true);
  const edge=await page.locator('.edge').getAttribute('d');
  await drag(a.x+20,a.y+20,60,45);const moved=await coords();assert.equal(moved[0].x,initial[0].x+60);assert.equal(moved[1].x,initial[1].x+60);assert.deepEqual(moved[2],initial[2]);assert.notEqual(await page.locator('.edge').getAttribute('d'),edge);
  await page.locator('#undo').click();assert.deepEqual(await coords(),initial);await page.locator('#redo').click();assert.deepEqual(await coords(),moved);
  const before=await page.locator('#world').getAttribute('style');await drag(canvas.x+20,canvas.y+20,70,35,'right');assert.notEqual(await page.locator('#world').getAttribute('style'),before);assert.deepEqual(await coords(),moved);assert.equal(await page.locator('#contextMenu').isHidden(),true);
  await page.mouse.click(canvas.x+20,canvas.y+20,{button:'right'});assert.equal(await page.locator('#contextMenu').isVisible(),true);await page.keyboard.press('Escape');
  await page.locator('#zoomIn').click();await page.locator('#zoomIn').click();
  const aa=await page.locator('[data-id="a"]').boundingBox(),bb=await page.locator('[data-id="b"]').boundingBox();await drag(aa.x-10,aa.y-10,bb.x+bb.width-aa.x+20,bb.y+bb.height-aa.y+20);assert.equal(await page.locator('.selected').count(),2);
  await drag(aa.x+20,aa.y+20,60,36);const zoomed=await coords();assert.ok(Math.abs(zoomed[0].x-moved[0].x-50)<0.1);assert.ok(Math.abs(zoomed[1].y-moved[1].y-30)<0.1);
  await page.waitForFunction(()=>document.querySelector('#saveState').textContent==='● Сохранено');await page.reload();await page.locator('.node').first().waitFor();assert.deepEqual(await coords(),zoomed);
  assert.deepEqual(errors,[]);console.log('OK: area selection, group move, links, one-step Undo/Redo, right pan/menu, zoom, save/reload; isolated board');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
