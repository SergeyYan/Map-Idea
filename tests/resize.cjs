const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const make=(id,x,type)=>({id,x,y:50,type,shape:'ellipse',title:id,note:'Заметка',level:1,status:'idea',tags:'',stage:'',media:[]});
  let document={nodes:[make('idea',0,'idea'),make('shape',450,'shape')],edges:[{a:'idea',b:'shape'}],strokes:[]},revision=1;
  await page.route('**/api/map',async route=>{if(route.request().method()==='PUT'){const d=route.request().postDataJSON();assert.equal(d.revision,revision);document=d.document;await route.fulfill({json:{revision:++revision}});}else await route.fulfill({json:{revision,document}});});
  await page.goto('http://127.0.0.1:8000');await page.locator('.node').first().waitFor();
  const dimensions=id=>page.locator(`[data-id="${id}"]`).evaluate(el=>({width:el.offsetWidth,height:el.offsetHeight,x:parseFloat(el.style.left),y:parseFloat(el.style.top)}));
  const drag=async(id,direction,dx,dy)=>{const box=await page.locator(`[data-id="${id}"] [data-resize="${direction}"]`).boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+dx,box.y+box.height/2+dy,{steps:8});await page.mouse.up();};
  const near=(a,b)=>assert.ok(Math.abs(a-b)<1,`${a} != ${b}`);
  for(const shape of ['ellipse','rectangle','rounded','diamond','triangle']){
   await page.locator('[data-id="shape"]').click();await page.locator('#shapeKind').selectOption(shape);
   const before=await dimensions('shape');const path=await page.locator('.edge').getAttribute('d');
   await drag('shape','se',50,60);const after=await dimensions('shape');near(after.width,before.width+50);near(after.height,before.height+60);assert.notEqual(await page.locator('.edge').getAttribute('d'),path);
   await page.locator('#undo').click();const restored=await dimensions('shape');near(restored.width,before.width);near(restored.height,before.height);
   await page.locator('#redo').click();near((await dimensions('shape')).width,after.width);
   await page.locator('#autoSize').click();near((await dimensions('shape')).width,240);
  }
  await page.locator('[data-id="idea"]').click();const original=await dimensions('idea');
  await drag('idea','e',60,0);near((await dimensions('idea')).width,original.width+60);near((await dimensions('idea')).height,original.height);
  await drag('idea','s',0,70);near((await dimensions('idea')).height,original.height+70);
  await page.locator('#zoomIn').click();await page.locator('#zoomIn').click();await page.locator('#zoomIn').click();await page.locator('#zoomIn').click();await page.locator('#zoomIn').click();
  const before=await dimensions('idea');await drag('idea','nw',-60,-45);const after=await dimensions('idea');near(after.width,before.width+40);near(after.height,before.height+30);near(after.x,before.x-40);near(after.y,before.y-30);
  await page.waitForFunction(()=>document.getElementById('saveState').textContent==='● Сохранено');near(document.nodes[0].width,after.width);near(document.nodes[0].height,after.height);
  await page.reload();await page.locator('.node').first().waitFor();const restored=await dimensions('idea');near(restored.width,after.width);near(restored.height,after.height);
  assert.deepEqual(errors,[]);console.log('Resize browser OK: idea + five shapes, width/height/corners, zoom, opposite anchor, links, Undo/Redo, auto reset, save/reload; user data untouched');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
