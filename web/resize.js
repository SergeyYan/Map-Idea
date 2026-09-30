export const resizeDirections=['n','ne','e','se','s','sw','w','nw'];
export const validSize = node => ['width','height'].every(key=>node[key]===undefined||(Number.isFinite(node[key])&&node[key]>0&&node[key]<=3000));
export const sizeStyle = node => `${Number.isFinite(node.width)?`width:${node.width}px;`:''}${Number.isFinite(node.height)?`height:${node.height}px;`:''}`;
export function resizeBounds(start, direction, dx, dy, minHeight=90) {
    let {x,y,width,height}=start;
    if(direction.includes('e'))width=Math.max(180,Math.min(3000,start.width+dx));
    if(direction.includes('s'))height=Math.max(minHeight,Math.min(3000,start.height+dy));
    if(direction.includes('w')){width=Math.max(180,Math.min(3000,start.width-dx));x=start.x+start.width-width;}
    if(direction.includes('n')){height=Math.max(minHeight,Math.min(3000,start.height-dy));y=start.y+start.height-height;}
    return {x,y,width,height};
}
export function resizeHandles() {
    return resizeDirections.map(direction=>`<span class="resize-handle resize-${direction}" data-resize="${direction}" title="Изменить размер" aria-hidden="true"></span>`).join('');
}
