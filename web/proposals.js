// Local application of a reviewed proposal. No network or project access.
export function prepareProposal(proposal, document, uid = () => crypto.randomUUID()) {
    if (!proposal || typeof proposal.summary !== 'string' || !Array.isArray(proposal.nodes) || !Array.isArray(proposal.edges) || proposal.nodes.length > 40 || proposal.edges.length > 100) throw Error('Некорректное предложение для карты');
    const keys = new Map(document.nodes.map(n=>[n.id,n.id]));
    const pairs = new Set(document.edges.map(e=>JSON.stringify([e.a,e.b].sort())));
    const right = document.nodes.reduce((max, node) => Math.max(max, node.x + (node.width || 240)), -380) + 380;
    const nodes = proposal.nodes.map((idea, index) => {
        if (typeof idea.key !== 'string' || !idea.key || keys.has(idea.key) || typeof idea.title !== 'string' || !idea.title.trim() || idea.title.length > 200 || typeof idea.note !== 'string' || idea.note.length > 10000 || !['idea','todo','doing','done'].includes(idea.status) || typeof idea.stage !== 'string' || typeof idea.tags !== 'string') throw Error('Некорректная идея в предложении');
        const id = uid();keys.set(idea.key, id);
        return {id, type:'idea', title:idea.title, note:idea.note, status:idea.status, stage:idea.stage, tags:idea.tags, level:1, media:[], x:right + (index % 4) * 380, y:Math.floor(index / 4) * 220};
    });
    const edges = proposal.edges.map(edge => {
        const pair = JSON.stringify([keys.get(edge.a),keys.get(edge.b)].sort());
        if (!keys.has(edge.a) || !keys.has(edge.b) || edge.a === edge.b || pairs.has(pair) || !['normal','important','high'].includes(edge.priority)) throw Error('Некорректная связь в предложении');
        pairs.add(pair);
        return {a:keys.get(edge.a), b:keys.get(edge.b), priority:edge.priority, direction:'forward'};
    });
    return {nodes,edges};
}

export function prepareProject(project, path, document, uid = () => crypto.randomUUID()) {
    const prepared=prepareProposal(project,{nodes:[],edges:[]},uid);
    const imported=new Map(document.nodes.filter(n=>n.projectPath===path).map(n=>[n.projectKey,n]));
    const remap=new Map(), updates=new Map();
    const fields=['title','note','status','stage','tags'];
    prepared.nodes.forEach((fresh,index)=>{
        const key=project.nodes[index].key, old=imported.get(key);
        const base=Object.fromEntries(fields.map(field=>[field,fresh[field]]));
        let node=fresh;
        if(old){
            node={...old};
            for(const field of fields)if(old[field]===old.projectBase?.[field])node[field]=fresh[field];
        }
        node.projectPath=path;node.projectKey=key;node.projectBase=base;
        remap.set(fresh.id,node.id);updates.set(node.id,node);
    });
    const protectedIds=new Set(document.edges.filter(e=>e.projectPath!==path).flatMap(e=>[e.a,e.b]));
    const nodes=document.nodes.filter(n=>{
        if(n.projectPath!==path||updates.has(n.id))return true;
        return (n.media||[]).length||protectedIds.has(n.id)||fields.some(field=>n[field]!==n.projectBase?.[field]);
    }).map(n=>updates.get(n.id)||n);
    for(const node of updates.values())if(!document.nodes.some(n=>n.id===node.id))nodes.push(node);
    const newNodes=nodes.filter(n=>!document.nodes.some(old=>old.id===n.id));
    const right=document.nodes.reduce((max,n)=>Math.max(max,n.x+(n.width||240)),-380)+380;
    newNodes.forEach((n,index)=>{n.x=right+(index%4)*380;n.y=Math.floor(index/4)*220;});
    const live=new Set(nodes.map(n=>n.id));
    const edges=document.edges.filter(e=>e.projectPath!==path&&live.has(e.a)&&live.has(e.b));
    const pairs=new Set(edges.map(e=>JSON.stringify([e.a,e.b].sort())));
    for(const edge of prepared.edges){
        const fresh={...edge,a:remap.get(edge.a),b:remap.get(edge.b),projectPath:path};
        const pair=JSON.stringify([fresh.a,fresh.b].sort());
        if(!pairs.has(pair)){edges.push(fresh);pairs.add(pair);}
    }
    return {nodes,edges,selectedId:prepared.nodes.length?remap.get(prepared.nodes[0].id):null};
}
