const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  const node=(id,x,y,width,height,type='idea')=>({id,x,y,width,height,type,shape:'ellipse',title:id,note:'Старая заметка',level:1,status:'idea',tags:'',stage:'',media:[]});
  let document={nodes:[node('A',0,100,240,160),node('B',620,100,280,260,'shape'),node('Препятствие',300,80,200,280),node('D',0,430,240,140)],edges:[{a:'A',b:'B',priority:'high'},{a:'D',b:'B'}],strokes:[]},revision=1;
  await page.route('**/api/map',async route=>{if(route.request().method()==='PUT'){const data=route.request().postDataJSON();assert.equal(data.revision,revision);document=data.document;await route.fulfill({json:{revision:++revision}});}else await route.fulfill({json:{revision,document}});});
  await page.goto('http://127.0.0.1:8000');await page.locator('.edge').first().waitFor();
  const expanded=await page.locator('#canvas').evaluate(el=>el.offsetWidth);
  await page.locator('#inspectorToggle').click();await page.waitForFunction(()=>document.getElementById('inspectorShell').offsetWidth===0);
  assert.equal(await page.locator('#canvas').evaluate(el=>el.offsetWidth),expanded+290);
  assert.equal(await page.locator('#inspector').evaluate(el=>el.inert),true);
  await page.locator('[data-id="A"]').dblclick();await page.locator('.inline-note').waitFor();
  await page.locator('.inline-note').fill('Новая заметка\nВторая строка');await page.locator('.inline-note').press('Control+Enter');
  assert.match(await page.locator('[data-id="A"] p').textContent(),/Новая заметка/);
  await page.keyboard.press('Control+z');assert.equal(await page.locator('[data-id="A"] p').textContent(),'Старая заметка');
  await page.keyboard.press('Control+Shift+z');assert.match(await page.locator('[data-id="A"] p').textContent(),/Новая заметка/);
  await page.locator('[data-id="B"]').dblclick();await page.locator('.inline-note').fill('Не сохранять');await page.locator('.inline-note').press('Escape');
  assert.equal(await page.locator('[data-id="B"] p').textContent(),'Старая заметка');
  await page.locator('[data-id="B"]').dblclick();await page.locator('.inline-note').fill('Заметка в фигуре');
  await page.locator('#theme').click();assert.equal(await page.locator('[data-id="B"] p').textContent(),'Заметка в фигуре');
  const verifyRoutes=async()=>{
   const samples=await page.locator('.edge').evaluateAll(edges=>edges.map(edge=>{const length=edge.getTotalLength();return Array.from({length:501},(_,i)=>{const p=edge.getPointAtLength(length*i/500);return{x:p.x,y:p.y};});}));
   assert.equal(samples.length,2);
   const obstacle=await page.locator('[data-id="Препятствие"]').evaluate(el=>({left:parseFloat(el.style.left),top:parseFloat(el.style.top),right:parseFloat(el.style.left)+el.offsetWidth,bottom:parseFloat(el.style.top)+el.offsetHeight}));
   for(const points of samples)for(const p of points)assert.ok(!(p.x>obstacle.left-6&&p.x<obstacle.right+6&&p.y>obstacle.top-6&&p.y<obstacle.bottom+6),'Connection crosses an obstacle');
   const a=samples[0].at(-1),b=samples[1].at(-1);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>20,'Incoming arrow tips must be distinct');
  };
  await verifyRoutes();
  await page.locator('#inspectorToggle').click();await page.waitForFunction(()=>document.getElementById('inspectorShell').offsetWidth===290);
  await page.locator('[data-id="A"]').click();assert.match(await page.locator('#note').inputValue(),/Новая заметка/);
  await page.locator('#note').fill('Из панели');await page.locator('[data-id="A"]').click();
  await page.locator('[data-id="A"]').dblclick();assert.equal(await page.locator('.inline-note').inputValue(),'Из панели');await page.locator('.inline-note').press('Control+Enter');
  await page.locator('[data-id="Препятствие"]').click();const corner=await page.locator('[data-id="Препятствие"] [data-resize="se"]').boundingBox();
  await page.mouse.move(corner.x+5,corner.y+5);await page.mouse.down();await page.mouse.move(corner.x+45,corner.y+65,{steps:6});await page.mouse.up();await verifyRoutes();
  await page.locator('#inspectorToggle').click();await page.waitForFunction(()=>document.getElementById('inspectorShell').offsetWidth===0);
  const artifacts=path.join(__dirname,'artifacts');await fs.mkdir(artifacts,{recursive:true});await page.screenshot({path:path.join(artifacts,'routing-collapsed.png')});
  await page.waitForFunction(()=>document.getElementById('saveState').textContent==='● Сохранено');
  await page.reload();await page.locator('.edge').first().waitFor();await page.waitForFunction(()=>document.getElementById('inspectorShell').offsetWidth===0);assert.equal(await page.locator('#inspectorShell').evaluate(el=>el.offsetWidth),0);
  assert.equal(document.nodes[0].note,'Из панели');assert.equal(document.nodes[1].note,'Заметка в фигуре');await verifyRoutes();assert.deepEqual(errors,[]);
  console.log('Browser OK: slide panel/persistence, inline idea/shape edits, commit/cancel/blur, shared history and editor sync, obstacle avoidance, separate entry ports, resize and reload; user data untouched');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
