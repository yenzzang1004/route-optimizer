export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }

  const { origin, destination, waypoints } = body || {};
  if (!origin || !destination) return res.status(400).json({ error: 'origin and destination required' });

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

  // 두 좌표 간 실제 도로 거리 (네이버 Directions)
  const getDist = async (from, to) => {
    try {
      const url = `https://maps.apigw.ntruss.com/map-direction/v1/driving?start=${from.x},${from.y}&goal=${to.x},${to.y}&option=trafast`;
      const r = await fetch(url, { headers: { 'X-NCP-APIGW-API-KEY-ID': ID, 'X-NCP-APIGW-API-KEY': SECRET } });
      const d = await r.json();
      if (d.code === 0) return d.route.trafast[0].summary.distance;
    } catch(e) {}
    // fallback: 직선 거리
    return Math.sqrt(Math.pow(from.x - to.x, 2) + Math.pow(from.y - to.y, 2)) * 111000;
  };

  try {
    // 1. 모든 주소 좌표 변환
    const originCoord = await toCoord(origin);
    const destCoord = await toCoord(destination);
    const wpCoords = await Promise.all(waypoints.map(w => toCoord(w)));

    if (!originCoord || !destCoord) return res.status(200).json({ error: 'coord failed', order: null });

    const validIndices = wpCoords.map((c, i) => c ? i : null).filter(i => i !== null);
    const validCoords = validIndices.map(i => wpCoords[i]);

    // 2. Nearest Neighbor 알고리즘으로 최적 순서 계산
    const n = validCoords.length;
    const visited = new Array(n).fill(false);
    const order = [];
    let current = originCoord;

    for (let step = 0; step < n; step++) {
      let minDist = Infinity, minIdx = -1;
      for (let j = 0; j < n; j++) {
        if (visited[j]) continue;
        const dist = await getDist(current, validCoords[j]);
        if (dist < minDist) { minDist = dist; minIdx = j; }
      }
      visited[minIdx] = true;
      order.push(validIndices[minIdx]);
      current = validCoords[minIdx];
    }

    return res.status(200).json({ order, status: 'OK' });

  } catch (err) {
    return res.status(500).json({ error: 'directions failed', detail: err.message });
  }
}
