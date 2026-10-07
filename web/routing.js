function clearSegment(a,b,rectangles) {
    return !rectangles.some(r=>Math.abs(a.y-b.y)<1e-6
        ? a.y>r.top+1e-6&&a.y<r.bottom-1e-6&&Math.max(a.x,b.x)>r.left+1e-6&&Math.min(a.x,b.x)<r.right-1e-6
        : a.x>r.left+1e-6&&a.x<r.right-1e-6&&Math.max(a.y,b.y)>r.top+1e-6&&Math.min(a.y,b.y)<r.bottom-1e-6);
}

function push(heap,item) {
    heap.push(item);let i=heap.length-1;
    while(i){const p=(i-1)>>1;if(heap[p].score<=item.score)break;heap[i]=heap[p];i=p;}heap[i]=item;
}
function pop(heap) {
    const first=heap[0],last=heap.pop();if(!heap.length)return first;
    let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].score<heap[child].score)child++;if(heap[child].score>=last.score)break;heap[i]=heap[child];i=child;}heap[i]=last;return first;
}

export function obstacleRoute(start,end,rectangles) {
    const xs=[...new Set([start.x,end.x,...rectangles.flatMap(r=>[r.left,r.right])])].sort((a,b)=>a-b);
    const ys=[...new Set([start.y,end.y,...rectangles.flatMap(r=>[r.top,r.bottom])])].sort((a,b)=>a-b);
    const goalX=xs.indexOf(end.x),goalY=ys.indexOf(end.y);
    const key=(x,y,axis)=>`${x},${y},${axis}`;
    const first={x:xs.indexOf(start.x),y:ys.indexOf(start.y),axis:0,cost:0,score:0};
    first.key=key(first.x,first.y,0);
    const heap=[],costs=new Map([[first.key,0]]),parents=new Map(),states=new Map([[first.key,first]]),visibility=new Map();push(heap,first);
    while(heap.length){
        const current=pop(heap);if(current.cost!==costs.get(current.key))continue;
        if(current.x===goalX&&current.y===goalY){
            const result=[];let state=current;while(state){result.push({x:xs[state.x],y:ys[state.y]});state=states.get(parents.get(state.key));}return result.reverse();
        }
        for(const [dx,dy,axis] of [[-1,0,1],[1,0,1],[0,-1,2],[0,1,2]]){
            const x=current.x+dx,y=current.y+dy;if(x<0||y<0||x>=xs.length||y>=ys.length)continue;
            const a={x:xs[current.x],y:ys[current.y]},b={x:xs[x],y:ys[y]};
            const segment=[`${current.x},${current.y}`,`${x},${y}`].sort().join('|');
            if(!visibility.has(segment))visibility.set(segment,clearSegment(a,b,rectangles));if(!visibility.get(segment))continue;
            const cost=current.cost+Math.abs(a.x-b.x)+Math.abs(a.y-b.y)+(current.axis&&current.axis!==axis?24:0);
            const id=key(x,y,axis);if(cost>=(costs.get(id)??Infinity))continue;
            const state={x,y,axis,cost,key:id,score:cost+Math.abs(b.x-end.x)+Math.abs(b.y-end.y)};
            costs.set(id,cost);parents.set(id,current.key);states.set(id,state);push(heap,state);
        }
    }
    return null;
}

export function roundedRoute(points) {
    const compact=[];
    for(const p of points){const a=compact.at(-2),b=compact.at(-1);if(b&&p.x===b.x&&p.y===b.y)continue;if(a&&((a.x===b.x&&b.x===p.x)||(a.y===b.y&&b.y===p.y)))compact.pop();compact.push(p);}
    if(!compact.length)return '';
    let path=`M${compact[0].x},${compact[0].y}`;
    for(let i=1;i<compact.length-1;i++){
        const a=compact[i-1],b=compact[i],c=compact[i+1];
        const ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),radius=Math.min(8,ab/2,bc/2);
        const before={x:b.x-(b.x-a.x)*radius/ab,y:b.y-(b.y-a.y)*radius/ab},after={x:b.x+(c.x-b.x)*radius/bc,y:b.y+(c.y-b.y)*radius/bc};
        path+=` L${before.x},${before.y} Q${b.x},${b.y} ${after.x},${after.y}`;
    }
    const end=compact.at(-1);return path+` L${end.x},${end.y}`;
}
