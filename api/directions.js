export const config = {
  api: { bodyParser: true }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) {} 
  }

  const { origin, destination, waypoints } = body || {};
  if (!origin || !destination) return res.status(400).json({ error: 'origin and destination required' });

  const CLIENT_ID = process.env.NAVER_CLIENT_ID;
  const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
  if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).json({ error: 'Naver API key not set' });

  try {
    // 1. 모든 주소를 좌표로 변환 (Geocoding)
    const toCoord = async (addr) => {
      const clean = addr.replace(/\(.*?\)/g, '').replace(/\s+\d+층.*$/, '').replace(/\s+[A-Z]동.*/, '').trim();
      const r = await fetch(`https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(clean)}`, {
        headers: { 'X-NCP-APIGW-API-KEY-ID': CLIENT_ID, 'X-NCP-APIGW-API-KEY': CLIENT_SECRET }
      });
      const d = await r.json();
      if (d.addresses && d.addresses.length > 0) {
        return { x: d.addresses[0].x, y: d.addresses[0].y };
      }
      return null;
    };

    const originCoord = await toCoord(origin);
    const destCoord = await toCoord(destination);
    if (!originCoord || !destCoord) return res.status(200).json({ error: 'coord failed', order: null });

    const wpCoords = await Promise.all(waypoints.map(w => toCoord(w)));

    // 2. 네이버 Directions 15 API 호출
    const start = `${originCoord.x},${originCoord.y}`;
    const goal = `${destCoord.x},${destCoord.y}`;
    const validWps = wpCoords.map((c, i) => c ? `${c.x},${c.y}` : null).filter(Boolean);
    const waypointStr = validWps.join('|');

    const url = `https://maps.apigw.ntruss.com/map-direction15/v1/driving?start=${start}&goal=${goal}&waypoints=${waypointStr}&option=trafast`;

    const response = await fetch(url, {
      headers: { 'X-NCP-APIGW-API-KEY-ID': CLIENT_ID, 'X-NCP-APIGW-API-KEY': CLIENT_SECRET }
    });
    const data = await response.json();

    if (data.code !== 0) {
      return res.status(200).json({ error: `directions error: ${data.message}`, order: null });
    }

    // 네이버 Directions는 waypoint 순서 최적화를 지원하지 않으므로
    // 거리 기반 greedy 알고리즘으로 최적 순서 계산
    const order = greedyOrder(originCoord, wpCoords);
    return res.status(200).json({ order, status: 'OK' });

  } catch (err) {
    return res.status(500).json({ error: 'directions failed', detail: err.message });
  }
}

// 가장 가까운 다음 지점을 순서대로 선택하는 Greedy 알고리즘
function greedyOrder(start, coords) {
  const remaining = coords.map((c, i) => ({ c, i })).filter(x => x.c);
  const order = [];
  let current = start;

  while (remaining.length > 0) {
    let minDist = Infinity, minIdx = 0;
    remaining.forEach((item, j) => {
      const dist = Math.pow(item.c.x - current.x, 2) + Math.pow(item.c.y - current.y, 2);
      if (dist < minDist) { minDist = dist; minIdx = j; }
    });
    order.push(remaining[minIdx].i);
    current = remaining[minIdx].c;
    remaining.splice(minIdx, 1);
  }
  return order;
}
