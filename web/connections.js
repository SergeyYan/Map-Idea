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

export function connectionPath(a, b, sizeA = {width:240,height:90}, sizeB = {width:240,height:90}, lane = 0) {
    const centerA = {x:a.x+sizeA.width/2, y:a.y+sizeA.height/2};
    const centerB = {x:b.x+sizeB.width/2, y:b.y+sizeB.height/2};
    let start = boundary(a, sizeA, centerB), end = boundary(b, sizeB, centerA);
    const dx = centerB.x - centerA.x, dy = centerB.y - centerA.y;
    const distance = Math.hypot(dx, dy);
    const nx = distance ? -dy / distance : 0, ny = distance ? dx / distance : 1;
    if (lane) {
        // Separate arrow tips as well as curves. Keep endpoints on each shape's boundary.
        start = boundary(a, sizeA, {x:start.x+nx*lane, y:start.y+ny*lane});
        end = boundary(b, sizeB, {x:end.x+nx*lane, y:end.y+ny*lane});
    }
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const bend = Math.min(180, Math.max(30, Math.hypot(end.x-start.x, end.y-start.y)/2));
    const x = horizontal ? Math.sign(dx || 1) * bend : 0, y = horizontal ? 0 : Math.sign(dy || 1) * bend;
    return `M${start.x},${start.y} C${start.x+x+nx*lane},${start.y+y+ny*lane} ${end.x-x+nx*lane},${end.y-y+ny*lane} ${end.x},${end.y}`;
}

export function renderConnections(edges, nodes, selected, sizes = new Map()) {
    const markers = Object.keys(priorities).map(priority => `<marker id="arrow-${priority}" markerWidth="11" markerHeight="10" refX="10" refY="5" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path class="edge-arrow priority-${priority}" d="M0,0 L10,5 L0,10 Z"/></marker>`).join('');
    const byId = new Map(nodes.map(node => [node.id, node]));
    const groups = new Map();
    const pairKey = edge => JSON.stringify([edge.a, edge.b].sort());
    edges.forEach((edge, index) => {
        const key = pairKey(edge);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(index);
    });
    return `<defs>${markers}</defs>` + edges.map((edge, index) => {
        const a = byId.get(edge.a), b = byId.get(edge.b);
        if (!a || !b) return '';
        const priority = edgePriority(edge), direction = edgeDirection(edge);
        const group = groups.get(pairKey(edge));
        const lane = (group.indexOf(index) - (group.length - 1) / 2) * 36 * (edge.a < edge.b ? 1 : -1);
        const path = connectionPath(a, b, sizes.get(a.id), sizes.get(b.id), lane);
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
