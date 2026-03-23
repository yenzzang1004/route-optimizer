export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  // 환경변수 확인용 (앞 4글자만 노출)
  if (!clientId || !clientSecret) {
    return res.status(500).json({ 
      error: '환경변수 없음',
      clientId: clientId ? clientId.substring(0,4)+'...' : 'undefined',
      clientSecret: clientSecret ? clientSecret.substring(0,4)+'...' : 'undefined'
    });
  }

  let { address } = req.query;
  if (!address) return res.status(400).json({ error: 'address required' });

  address = address.replace(/\(.*?\)/g, '').replace(/\s+\d+층.*$/, '').replace(/\s+[A-Z]동.*/, '').trim();

  try {
    const response = await fetch(
      `https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(address)}`,
      {
        headers: {
          'X-NCP-APIGW-API-KEY-ID': clientId,
          'X-NCP-APIGW-API-KEY': clientSecret,
        },
      }
    );
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'geocode failed', detail: err.message });
  }
}
