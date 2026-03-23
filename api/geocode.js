export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let { address } = req.query;
  if (!address) return res.status(400).json({ error: 'address required' });

  // 괄호 안 내용 제거, 층/호/동 등 상세주소 제거
  address = address
    .replace(/\(.*?\)/g, '')   // (현대지식산업센터) 제거
    .replace(/\s+\d+층.*$/,'') // 3층, 511호 등 제거
    .replace(/\s+[A-Z]동.*/,'') // A동 등 제거
    .trim();

  try {
    const response = await fetch(
      `https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(address)}`,
      {
        headers: {
          'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID,
          'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET,
        },
      }
    );
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'geocode failed' });
  }
}
