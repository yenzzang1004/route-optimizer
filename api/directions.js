export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }

  const { origin, waypoints } = body || {};
  if (!origin || !waypoints) return res.status(400).json({ error: 'origin and waypoints required' });

  const ID = process.env.NAVER_CLIENT_ID;
  const SECRET = process.env.NAVER_CLIENT_SECRET;
  if (!ID || !SECRET) return res.status(500).json({ error: 'API key not set' });

  // 주소 → 좌표 변환
  const toCoord = async (addr) => {
    const clean = addr.replace(/\(.*?\)/g, '').replace(/\s+\d+층.*$/, '').replace(/\s+[A-Z]동.*/, '').trim();
    try {
      const r = await fetch(`https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(clean)}`, {
        headers: { 'X-NCP-APIGW-API-KEY-ID': ID, 'X-NCP-APIGW-API-KEY': SECRET }
      });
      const d = await r.json();
      if (d.addresses && d.addresses.length > 0) return { x: parseFloat(d.addresses[0].x), y: parseFloat(d.addresses[0].y) };
    } catch(e) {}
    return null;
  };

  // 두 좌표 간 직선 거리 (빠른 계산용)
  const getDist = (a, b) => Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

  try {
    // 1. 출발지 좌표 변환
    const originCoord = await toCoord(origin);
    if (!originCoord) return res.status(200).json({ error: '출발지 좌표 변환 실패', order: null });

    // 2. 경유지 좌표 변환
    const wpCoords = await Promise.all(waypoints.map(w => toCoord(w)));

    // 3. 출발지 기준 Nearest Neighbor 최적화
    const n = wpCoords.length;
    const visited = new Array(n).fill(false);
    const order = [];
    let current = originCoord;

    for (let step = 0; step < n; step++) {
      let minDist = Infinity, minIdx = -1;
      for (let j = 0; j < n; j++) {
        if (visited[j] || !wpCoords[j]) continue;
        const dist = getDist(current, wpCoords[j]);
        if (dist < minDist) { minDist = dist; minIdx = j; }
      }
      if (minIdx === -1) break;
      visited[minIdx] = true;
      order.push(minIdx);
      current = wpCoords[minIdx];
    }

    return res.status(200).json({ order, status: 'OK', originCoord });

  } catch (err) {
    return res.status(500).json({ error: 'failed', detail: err.message });
  }
}
