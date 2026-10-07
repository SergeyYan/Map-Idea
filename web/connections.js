import { obstacleRoute, roundedRoute } from './routing.js';
export const priorities = { normal: 'Обычный', important: 'Важный', high: 'Высокий' };
export const directions = { forward: 'A → B · основная → подидея', backward: 'B → A · основная → подидея', both: 'A ↔ B · взаимная связь', none: 'A — B · без направления' };

export const edgePriority = edge => Object.hasOwn(priorities, edge.priority) ? edge.priority : 'normal';
export const edgeDirection = edge => Object.hasOwn(directions, edge.direction) ? edge.direction : 'forward';
export const createConnection = (a, b) => ({ a, b, priority: 'normal', direction: 'forward' });
export const sameConnectionPair = (edge, a, b) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a);
export const validConnection = edge => edge && (edge.priority === undefined || Object.hasOwn(priorities, edge.priority)) && (edge.direction === undefined || Object.hasOwn(directions, edge.direction));

function boundary(node, size, toward) {
    const w = size.width, h = size.height;
    const cx = node.x + w / 2, cy = node.y + h / 2;
    const dx = toward.x - cx, dy = toward.y - cy;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length || (dy === 0 ? 1 : 0), uy = dy / length;
    let distance = Math.min(ux ? w / 2 / Math.abs(ux) : Infinity, uy ? h / 2 / Math.abs(uy) : Infinity);
    if (node.type === 'shape') {
        if (!node.shape || node.shape === 'ellipse') distance = 1 / Math.hypot(ux / (w / 2), uy / (h / 2));
        if (node.shape === 'diamond') distance = 1 / (Math.abs(ux) / (w / 2) + Math.abs(uy) / (h / 2));
        if (node.shape === 'triangle') {
            const vertices = [{x:0,y:-h/2}, {x:w/2,y:h/2}, {x:-w/2,y:h/2}];
            const cross = (x, y, a, b) => x * b - y * a;
            distance = Infinity;
            for (let i = 0; i < vertices.length; i++) {
                const a = vertices[i], b = vertices[(i + 1) % vertices.length];
                const ex = b.x - a.x, ey = b.y - a.y, denominator = cross(ux, uy, ex, ey);
                if (Math.abs(denominator) < 1e-8) continue;
                const t = cross(a.x, a.y, ex, ey) / denominator;
                const s = cross(a.x, a.y, ux, uy) / denominator;
                if (t >= 0 && s >= 0 && s <= 1) distance = Math.min(distance, t);
            }
        }
    }
    return {x: cx + ux * (distance + 6), y: cy + uy * (distance + 6)};
}

export function renderConnections(edges, nodes, selected, sizes = new Map()) {
    const markers = Object.keys(priorities).map(priority => `<marker id="arrow-${priority}" markerWidth="11" markerHeight="10" refX="10" refY="5" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path class="edge-arrow priority-${priority}" d="M0,0 L10,5 L0,10 Z"/></marker>`).join('');
    const byId = new Map(nodes.map(node => [node.id, node]));
    const dimensions = node => sizes.get(node.id)||{width:node.width||240,height:node.height||(node.type==='shape'?180:90)};
    const center = node => {const size=dimensions(node);return {x:node.x+size.width/2,y:node.y+size.height/2};};
    const ports=new Map();const groups=new Map();
    edges.forEach((edge,index)=>{
        for(const [id,otherId,endpoint] of [[edge.a,edge.b,'a'],[edge.b,edge.a,'b']]){
            const node=byId.get(id),other=byId.get(otherId);if(!node||!other)continue;
            const c=center(node),o=center(other),dx=o.x-c.x,dy=o.y-c.y;
            const side=Math.abs(dx)>=Math.abs(dy)?(dx>=0?'e':'w'):(dy>=0?'s':'n');
            const groupKey=JSON.stringify([id,side]);if(!groups.has(groupKey))groups.set(groupKey,[]);
            const port={index,endpoint,node,side,order:['e','w'].includes(side)?o.y:o.x};groups.get(groupKey).push(port);ports.set(`${index}-${endpoint}`,port);
        }
    });
    for(const group of groups.values()){
        group.sort((a,b)=>a.order-b.order||a.index-b.index);
        group.forEach((port,rank)=>{
            const n=port.node,size=dimensions(n),t=.15+.7*(rank+1)/(group.length+1);
            const toward={x:port.side==='w'?n.x:port.side==='e'?n.x+size.width:n.x+size.width*t,y:port.side==='n'?n.y:port.side==='s'?n.y+size.height:n.y+size.height*t};
            port.point=boundary(n,size,toward);
            port.stem={x:port.side==='w'?n.x-24:port.side==='e'?n.x+size.width+24:port.point.x,y:port.side==='n'?n.y-24:port.side==='s'?n.y+size.height+24:port.point.y};
        });
    }
    const rectangles=nodes.map(node=>{const size=dimensions(node);return {left:node.x-24,right:node.x+size.width+24,top:node.y-24,bottom:node.y+size.height+24};});
    return `<defs>${markers}</defs>` + edges.map((edge, index) => {
        const a = byId.get(edge.a), b = byId.get(edge.b);
        if (!a || !b) return '';
        const priority = edgePriority(edge), direction = edgeDirection(edge);
        const from=ports.get(`${index}-a`),to=ports.get(`${index}-b`);
        const route=obstacleRoute(from.stem,to.stem,rectangles);
        // Overlapping cards can leave no free route. Do not draw a line through them.
        if(!route)return '';
        const path=roundedRoute([from.point,...route,to.point]);
        const start = ['backward', 'both'].includes(direction) ? ` marker-start="url(#arrow-${priority})"` : '';
        const end = ['forward', 'both'].includes(direction) ? ` marker-end="url(#arrow-${priority})"` : '';
        return `<g><path class="edge priority-${priority} ${selected === index ? 'selected-edge' : ''}" d="${path}"${start}${end}/><path data-edge="${index}" class="edge-hit" d="${path}"/></g>`;
    }).join('');
}

export function connectionDescription(edge, nodeId, nodes) {
    const other = nodes.find(node => node.id === (edge.a === nodeId ? edge.b : edge.a));
    const direction = edgeDirection(edge);
    const outgoing = direction === 'forward' ? edge.a === nodeId : edge.b === nodeId;
    const relation = direction === 'none' ? 'Связана с' : direction === 'both' ? 'Взаимная связь с' : outgoing ? 'Подидея' : 'Основная идея';
    return `${relation}: ${other?.title || 'Идея'} · приоритет: ${priorities[edgePriority(edge)]}`;
}

export function connectionsMarkdown(edges, nodeId, nodes) {
    const rows = edges.filter(edge => edge.a === nodeId || edge.b === nodeId).map(edge => {
        const a = nodes.find(node => node.id === edge.a), b = nodes.find(node => node.id === edge.b);
        const direction = edgeDirection(edge);
        const title = node => String(node?.title || 'Идея').replace(/[\r\n]/g, ' ');
        const pair = direction === 'backward' ? `${title(b)} → ${title(a)}` : `${title(a)} ${{forward:'→',both:'↔',none:'—'}[direction]} ${title(b)}`;
        return `- ${pair} · ${connectionDescription(edge, nodeId, nodes).replace(/[\r\n]/g, ' ')}`;
    });
    return rows.length ? rows.join('\n') : 'Нет';
}
