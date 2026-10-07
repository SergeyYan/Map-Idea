const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const board={nodes:[{id:'old',type:'idea',x:0,y:0,title:'Моя идея',note:'Важный текст',status:'idea',stage:'',tags:'',level:1,media:[{kind:'audio',name:'voice.webm',data:'data:audio/webm;base64,SECRET'}]}],edges:[],strokes:[]};
  let saved=structuredClone(board),revision=1,jobs=[],sent,sendCount=0,projectLoad;
  await page.route('**/api/map',async r=>{if(r.request().method()==='PUT'){const b=r.request().postDataJSON();saved=b.document;await r.fulfill({json:{revision:++revision}});}else await r.fulfill({json:{revision,document:saved}});});
  await page.route('**/api/codex/**',async r=>{
   const url=r.request().url();
   if(url.includes('/threads'))return r.fulfill({json:{threads:[{id:'chat1',name:'Игра',cwd:'C:/Projects/Game'}],cursor:null}});
   if(url.endsWith('/project')){projectLoad=r.request().postDataJSON();return r.fulfill({json:{path:projectLoad.path,file:projectLoad.path+'/.inkmap/project.json',created:false,notice:'',document:{summary:'Карта проекта',nodes:[{key:'project',title:'Архитектура',note:'Из файла',status:'idea',stage:'Архитектура',tags:''}],edges:[]}}});}
   if(url.endsWith('/send')){sent=r.request().postDataJSON();sendCount++;jobs=[{id:'job'+sendCount,name:'Игра',threadId:'chat1',state:'done',result:{summary:'План проекта',nodes:[{key:'a',title:sent.action==='load'?'Архитектура':'Правила игры',note:'Уточнить победу',status:'todo',stage:'Дизайн',tags:''}],edges:[]}}];return r.fulfill({json:{id:'job'+sendCount,state:'running'}});}
   if(r.request().method()==='DELETE'){jobs=[];return r.fulfill({json:{ok:true}});}
   return r.fulfill({json:{jobs}});
  });
  await page.goto('http://127.0.0.1:8001');await page.locator('[data-id="old"]').click();await page.locator('#codexIdeaButton').click();
  await page.locator('#codexName').fill('Игра');await page.locator('#codexFind').click();await page.locator('#codexThread option[value="chat1"]').waitFor({state:'attached'});
  await page.locator('#codexThread').selectOption('chat1');assert.equal(await page.locator('#codexPath').inputValue(),'C:/Projects/Game');
  await page.locator('#codexSend').click();await page.getByRole('button',{name:'Добавить на доску (1)'}).waitFor();
  assert.ok(!JSON.stringify(sent).includes('SECRET'));assert.equal(sent.action,'send');assert.equal(sent.threadId,'chat1');assert.equal(sent.selectedId,'old');assert.equal(sent.document.nodes[0].note,'Важный текст');
  await page.getByRole('button',{name:'Добавить на доску (1)'}).click();await page.locator('#codexClose').click();assert.equal(await page.locator('.node').count(),2);
  assert.equal(await page.locator('[data-id="old"] p').textContent(),'Важный текст');await page.keyboard.press('Control+z');assert.equal(await page.locator('.node').count(),1);
  await page.keyboard.press('Control+Shift+z');assert.equal(await page.locator('.node').count(),2);
  await page.waitForFunction(()=>document.getElementById('saveState').textContent==='● Сохранено');await page.reload();assert.equal(await page.locator('.node').count(),2);
  await page.locator('#codexOpen').click();assert.equal(await page.locator('#codexName').inputValue(),'Игра');assert.equal(await page.locator('#codexThread').inputValue(),'chat1');assert.equal(await page.locator('#codexSend').textContent(),'Загрузить доску');
  await Promise.all([page.waitForResponse('**/api/codex/project'),page.locator('#codexSend').click()]);assert.equal(sendCount,1);assert.equal(projectLoad.path,'C:/Projects/Game');await page.waitForFunction(()=>document.querySelectorAll('.node').length===1);await page.locator('#codexClose').click();await page.keyboard.press('Control+z');assert.equal(await page.locator('.node').count(),2);
  assert.deepEqual(errors,[]);console.log('Browser OK: project/chat selection, selected idea, proposal preview, append, Undo/Redo, save/reload; transport mocked, no real chat sent');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
