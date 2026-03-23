export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { origin, destination, waypoints } = req.body;
  if (!origin || !destination) return res.status(400).json({ error: 'origin and destination required' });

  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  if (!GOOGLE_API_KEY) return res.status(500).json({ error: 'Google API key not set' });

  try {
    const wps = waypoints && waypoints.length > 0
      ? `&waypoints=optimize:true|${waypoints.map(w => encodeURIComponent(w)).join('|')}`
      : '';

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${wps}&mode=driving&language=ko&key=${GOOGLE_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      return res.status(200).json({ error: data.status, order: null });
    }

    // 최적화된 경유지 순서 반환
    const order = data.routes[0]?.waypoint_order || [];
    return res.status(200).json({ order, status: 'OK' });

  } catch (err) {
    return res.status(500).json({ error: 'directions failed', detail: err.message });
  }
}
