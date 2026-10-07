const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const root=path.resolve(__dirname,'..');let saved={nodes:[{id:'manual',type:'idea',x:0,y:0,title:'Моя идея',note:'Сохранить заметку',level:1,status:'idea',stage:'',tags:'',media:[]}],edges:[],strokes:[]},revision=1;
  await page.route('**/api/map',async route=>{if(route.request().method()==='PUT'){const body=route.request().postDataJSON();saved=body.document;await route.fulfill({json:{revision:++revision}});}else await route.fulfill({json:{revision,document:saved}});});
  await page.route('**/api/codex/jobs',r=>r.fulfill({json:{jobs:[{id:'old',state:'error',action:'load',error:'already has an active writer',name:'Старый запрос'}]}}));
  await page.route('**/api/codex/threads**',r=>r.fulfill({json:{threads:[{id:'occupied',name:'Занятый чат',cwd:root,status:{type:'active'}}],cursor:null}}));
  let modelRequests=0;await page.route('**/api/codex/send',r=>{modelRequests++;return r.fulfill({status:500,json:{detail:'Unexpected model request'}});});
  await page.goto('http://127.0.0.1:8001');await page.locator('#codexOpen').click();await page.locator('#codexName').fill('InkMap');await page.locator('#codexFind').click();await page.locator('#codexThread option[value="occupied"]').waitFor({state:'attached'});await page.locator('#codexThread').selectOption('occupied');
  assert.equal(await page.locator('#codexPath').inputValue(),root);
  await page.locator('#codexLoadMode').selectOption('add');await page.locator('#codexLoadMode').selectOption('add');await page.locator('#codexSend').click();await page.waitForFunction(()=>document.querySelectorAll('.node').length>4);
  const count=await page.locator('.node').count(),projectId=await page.locator('.node.selected').getAttribute('data-id');
  assert.match(await page.locator('#codexState').textContent(),/project\.json/);assert.equal(modelRequests,0);
  const manifest=JSON.parse(await fs.readFile(path.join(root,'.inkmap/project.json'),'utf8'));assert.equal(manifest.schemaVersion,1);assert.ok(manifest.nodes.length>3);
  await page.locator('#codexClose').click();await page.keyboard.press('Control+z');assert.equal(await page.locator('.node').count(),1);await page.keyboard.press('Control+Shift+z');assert.equal(await page.locator('.node').count(),count);
  await page.locator('#note').fill('Ручное описание проекта');await page.locator('#codexOpen').click();await page.locator('#codexLoadMode').selectOption('add');await page.locator('#codexLoadMode').selectOption('add');await page.locator('#codexSend').click();await page.waitForFunction(()=>document.getElementById('codexState').textContent.includes('Проект добавлен'));
  assert.equal(await page.locator('.node').count(),count);assert.equal(await page.locator('.node.selected').getAttribute('data-id'),projectId);assert.equal(await page.locator('#note').inputValue(),'Ручное описание проекта');
  await page.locator('#codexClose').click();assert.equal(await page.locator('[data-id="manual"] p').textContent(),'Сохранить заметку');
  await page.waitForFunction(()=>document.getElementById('saveState').textContent==='● Сохранено');await page.reload();assert.equal(await page.locator('.node').count(),count);
  await fs.mkdir(path.join(__dirname,'artifacts'),{recursive:true});await page.screenshot({path:path.join(__dirname,'artifacts/project-file.png')});
  assert.deepEqual(errors,[]);console.log('File browser OK: real project.json/API load despite occupied writer, no model request, idempotent sync, manual notes, Undo/Redo and save/reload; user board untouched');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
