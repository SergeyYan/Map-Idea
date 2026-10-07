const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const node=(id,x)=>({id,type:'idea',x,y:40,title:id,note:'Исходная заметка',level:1,status:'idea',stage:'',tags:'',media:[]});
  const original={nodes:[node('A',0),node('B',400)],edges:[{a:'A',b:'B'}],strokes:[[{x:20,y:350},{x:200,y:350}]],codexReceipts:['previous']};
  original.nodes[0].media=[{kind:'image',name:'image.svg',data:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'}];
  let saved=structuredClone(original),revision=1;
  await page.route('**/api/map',async r=>{
   if(r.request().method()==='PUT'){const body=r.request().postDataJSON();assert.equal(body.revision,revision);saved=body.document;await r.fulfill({json:{revision:++revision}});}
   else await r.fulfill({json:{revision,document:saved}});
  });
  await page.route('**/api/codex/**',r=>{
   if(r.request().url().endsWith('/project')){const {path}=r.request().postDataJSON();return r.fulfill({json:{path,file:path+'/.inkmap/project.json',document:{summary:'Карта проекта',nodes:[{key:'root',title:path,note:'Проект',status:'idea',stage:'',tags:''}],edges:[]}}});}
   return r.fulfill({json:{jobs:[],threads:[],cursor:null}});
  });
  const persisted=()=>page.waitForFunction(()=>document.getElementById('saveState').textContent==='● Сохранено');
  await page.goto('http://127.0.0.1:8000');await page.locator('.node').first().waitFor();
  await page.locator('[data-id="A"]').dblclick();await page.locator('.inline-note').fill('Правка перед очисткой');
  await page.locator('#newMap').click();assert.equal(await page.locator('.node').count(),0);assert.equal(await page.locator('.drawing-stroke,.edge').count(),0);
  await persisted();assert.deepEqual(saved,{nodes:[],edges:[],strokes:[]});
  await page.locator('#undo').click();await persisted();assert.equal(saved.nodes[0].note,'Правка перед очисткой');assert.deepEqual(saved.nodes[0].media,original.nodes[0].media);assert.equal(saved.strokes.length,1);assert.deepEqual(saved.codexReceipts,['previous']);
  await page.locator('#redo').click();await persisted();await page.reload();assert.equal(await page.locator('.node').count(),0);
  await page.locator('#add').click();await persisted();
  async function load(path,mode='replace'){
   await page.locator('#codexOpen').click();await page.locator('#codexPath').fill(path);await page.locator('#codexLoadMode').selectOption(mode);
   await page.locator('#codexSend').click();await page.waitForFunction(()=>/Источник:/.test(document.getElementById('codexState').textContent));await page.locator('#codexClose').click();await persisted();
  }
  await load('C:/ProjectOne');assert.equal(saved.nodes.length,1);assert.equal(saved.nodes[0].title,'C:/ProjectOne');
  await load('C:/ProjectTwo');assert.equal(saved.nodes.length,1);assert.equal(saved.nodes[0].title,'C:/ProjectTwo');
  await page.locator('#undo').click();await persisted();assert.equal(saved.nodes[0].title,'C:/ProjectOne');
  await page.locator('#redo').click();await persisted();assert.equal(saved.nodes[0].title,'C:/ProjectTwo');
  await load('C:/ProjectThree','add');assert.equal(saved.nodes.length,2);
  await page.reload();await page.locator('.node').first().waitFor();assert.equal(await page.locator('.node').count(),2);
  assert.deepEqual(errors,[]);console.log('New map OK: clear all objects/metadata, commit inline draft, Undo restores media/strokes, Redo, empty reload, project replacement and explicit append, autosave; isolated API');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
