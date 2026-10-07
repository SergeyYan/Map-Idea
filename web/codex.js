import { prepareProposal, prepareProject } from './proposals.js';

export function initializeCodex({snapshot, apply, applyProject, flush}) {
    const $=id=>document.getElementById(id);
    const dialog=$('codexDialog');
    let selection=null, busy=false, action='load', refreshing=false, loadingFile=false;
    const pending=new Map();
    const settings=()=>{try{return JSON.parse(localStorage.getItem('inkmap-codex')||'{}');}catch{return {};}};
    const samePath=(a,b)=>String(a||'').replaceAll('\\','/').replace(/\/$/,'').toLowerCase()===String(b||'').replaceAll('\\','/').replace(/\/$/,'').toLowerCase();
    function bind(threadId,path){
        const option=Array.from($('codexThread').options).find(o=>o.value===threadId)||new Option('Связанный чат проекта',threadId);
        option.dataset.path=path;if(!option.parentElement)$('codexThread').add(option);$('codexThread').value=threadId;
    }
    const error=message=>$('codexState').textContent=message;
    async function request(url, options={}) {
        const response=await fetch('/api/codex'+url,options);
        const data=await response.json();
        if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'Ошибка связи с Codex');
        return data;
    }
    async function loadThreads(cursor=null) {
        try {
            const data=await request('/threads?name='+encodeURIComponent($('codexName').value)+(cursor?'&cursor='+encodeURIComponent(cursor):''));
            if(!cursor)$('codexThread').replaceChildren(new Option('Новый чат',''));
            for(const t of data.threads){const option=new Option((t.name||'Без названия')+' · '+(t.cwd||''),t.id);option.dataset.path=t.cwd||'';$('codexThread').add(option);}
            const saved=settings();if(saved.threadId&&saved.name===$('codexName').value&&saved.path===$('codexPath').value&&Array.from($('codexThread').options).some(o=>o.value===saved.threadId))$('codexThread').value=saved.threadId;
            $('codexMore').hidden=!data.cursor;$('codexMore').onclick=()=>loadThreads(data.cursor);
            error('Выберите существующий чат или оставьте «Новый чат».');
        }catch(e){error(e.message);}
    }
    $('codexThread').onchange=()=>{const path=$('codexThread').selectedOptions[0]?.dataset.path;if(path)$('codexPath').value=path;};
    $('codexFind').onclick=()=>loadThreads();
    $('codexClose').onclick=()=>dialog.close();
    function open(kind){
        flush();selection=snapshot().selectedId;action=kind;
        if(kind==='load')$('codexLoadMode').value='replace';
        if(kind==='send'&&!selection){alert('Сначала выберите идею или фигуру на доске.');return;}
        $('codexHeading').textContent=kind==='load'?'Загрузить доску из проекта':'Отправить идею в проект';
        $('codexSend').textContent=kind==='load'?'Загрузить доску':'Отправить идею';
        $('codexProjectOptions').hidden=kind!=='load';$('codexPrompt').disabled=kind==='load';
        $('codexTransferInfo').textContent=kind==='load'?'Загрузка читает локальный файл карты. При первом запуске или выборе обновления создаётся статическая карта исходных файлов и модулей; По умолчанию проект заменяет текущую карту. Чтобы объединить проекты, выберите «Добавить к текущей карте».':'Будут переданы заметки, статусы, связи и ссылки вложений в выбранный чат Codex. Запрос использует лимиты Codex. Занятый чат сначала нужно освободить.';
        $('codexSelected').textContent=kind==='load'?'Карта загружается из папки проекта.':selection?'Будет передана выбранная идея и контекст всей доски.':'Будет передан контекст всей доски.';
        $('codexPrompt').value=kind==='send'?'Добавь выбранную идею в контекст этого проекта. Разбери, как она дополняет текущую реализацию, и предложи следующие шаги.':'Доска будет прочитана из .inkmap/project.json. Если файла нет, InkMap создаст карту структуры файлов и модулей.';
        const saved=settings();$('codexName').value=saved.name||'';$('codexPath').value=saved.path||'';
        $('codexThread').replaceChildren(new Option('Новый чат',''));if(saved.threadId)bind(saved.threadId,saved.path);
        dialog.showModal();refresh();
    }
    $('codexOpen').onclick=()=>open('load');$('codexIdeaButton').onclick=()=>open('send');
    $('codexSend').onclick=async()=>{
        if(loadingFile||(busy&&action!=='load'))return;
        flush();const saved=snapshot().document;const document={nodes:saved.nodes.map(n=>({id:n.id,title:n.title,note:n.note,status:n.status,stage:n.stage,tags:n.tags,media:(n.media||[]).map(m=>({name:m.name,kind:m.kind,source:m.source}))})),edges:saved.edges};
        const body={action,name:$('codexName').value,path:$('codexPath').value,threadId:$('codexThread').value||null,prompt:$('codexPrompt').value,selectedId:selection,document};
        try{localStorage.setItem('inkmap-codex',JSON.stringify({name:body.name,path:body.path,threadId:body.threadId}));}catch{}
        if(action==='load'){
            const replace=$('codexLoadMode').value!=='add';
            loadingFile=true;
            $('codexSend').disabled=true;error('Чтение файла карты проекта…');
            try{
                const data=await request('/project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:body.path,name:body.name,refresh:$('codexRebuild').checked,hooks:$('codexHooks').checked})});
                flush();applyProject(prepareProject(data.document,data.path,replace?{nodes:[],edges:[]}:snapshot().document),{replace});
                error((replace?'Текущая карта заменена. ':'Проект добавлен к карте. ')+'Источник: '+data.file+(data.notice?' · '+data.notice:'')+'. Изменение можно отменить через Undo.');
            }catch(e){error(e.message);}finally{loadingFile=false;$('codexSend').disabled=false;}
            return;
        }
        busy=true;$('codexSend').disabled=true;error('Отправка в Codex…');
        try{const job=await request('/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});pending.set(job.id,body);await refresh();}
        catch(e){error(e.message);busy=false;$('codexSend').disabled=false;}
    };
    async function refresh() {
        if(refreshing||(!dialog.open&&!pending.size))return;
        refreshing=true;
        try{
            const {jobs}=await request('/jobs');busy=jobs.some(j=>j.state==='running');$('codexSend').disabled=loadingFile||(busy&&action!=='load');
            if(busy&&action!=='load')error('Codex изучает проект. Можно закрыть окно и продолжить работу на доске.');
            const list=$('codexResults');list.replaceChildren();
            for(const job of jobs){
                const source=pending.get(job.id)||job;const saved=settings();
                if(job.threadId&&source.path&&source.name===saved.name&&samePath(source.path,saved.path)){
                    try{localStorage.setItem('inkmap-codex',JSON.stringify({...saved,threadId:job.threadId}));}catch{}
                    if($('codexName').value===source.name&&samePath($('codexPath').value,source.path))bind(job.threadId,source.path);
                }
                if(job.state==='done')pending.delete(job.id);
                if(job.state==='error'){pending.delete(job.id);if(source.action==='send')error(job.error);}
                const item=document.createElement('section');item.className='codex-result';
                const title=document.createElement('strong');title.textContent=job.name||'Запрос Codex';item.append(title);
                const answer=document.createElement('p');answer.textContent=job.state==='running'?'Выполняется…':job.state==='error'?job.error:job.result.summary;item.append(answer);
                if(job.threadId){const link=document.createElement('a');link.href='codex://threads/'+encodeURIComponent(job.threadId);link.textContent='Открыть чат в Codex';item.append(link);}
                if(job.state==='done'&&(job.result.nodes?.length||job.result.edges?.length)&&!snapshot().document.codexReceipts?.includes(job.id)){
                    const add=document.createElement('button');add.textContent=job.result.nodes.length?'Добавить на доску ('+job.result.nodes.length+')':'Добавить связи ('+job.result.edges.length+')';
                    add.onclick=async()=>{add.disabled=true;try{flush();const result=prepareProposal(job.result,snapshot().document);apply(result,job.id);await request('/jobs/'+job.id,{method:'DELETE'});await refresh();}catch(e){error(e.message);}};item.append(add);
                }
                if(job.state!=='running'){
                    const remove=document.createElement('button');remove.textContent='Убрать результат';remove.onclick=async()=>{try{await request('/jobs/'+job.id,{method:'DELETE'});await refresh();}catch(e){error(e.message);}};item.append(remove);
                }
                list.append(item);
            }
        }catch(e){error(e.message);}finally{refreshing=false;}
    }
    setInterval(()=>{if(dialog.open||pending.size)refresh();},2000);
}
