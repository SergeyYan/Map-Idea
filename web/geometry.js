function pointSegmentDistance(point, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
    return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

function segmentsIntersect(a, b, c, d) {
    const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}

export function strokeTouches(stroke, from, to, radius) {
    if (stroke.length === 1) return pointSegmentDistance(stroke[0], from, to) <= radius;
    for (let i = 1; i < stroke.length; i++) {
        const a = stroke[i - 1], b = stroke[i];
        if (segmentsIntersect(a, b, from, to) || Math.min(
            pointSegmentDistance(a, from, to), pointSegmentDistance(b, from, to),
            pointSegmentDistance(from, a, b), pointSegmentDistance(to, a, b),
        ) <= radius) return true;
    }
    return false;
}

export function zoomAt(view, point, zoom) {
    const z = Math.max(0.3, Math.min(2, zoom));
    return { x: point.x - (point.x - view.x) * z / view.z, y: point.y - (point.y - view.y) * z / view.z, z };
}
