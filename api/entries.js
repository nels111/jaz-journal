const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'nels111/jaz-journal-data';
const API_KEY = process.env.JAZ_API_KEY;

async function githubAPI(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`https://api.github.com${path}`, opts);
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res;
}

async function getEntries() {
  // Get index file
  const res = await githubAPI(`/repos/${REPO}/contents/index.json`);
  if (res.status === 404) return [];
  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return JSON.parse(content);
}

async function saveEntry(entry) {
  // Get current index
  let entries = [];
  let sha = null;

  const indexRes = await githubAPI(`/repos/${REPO}/contents/index.json`);
  if (indexRes.status !== 404) {
    const indexData = await indexRes.json();
    sha = indexData.sha;
    entries = JSON.parse(Buffer.from(indexData.content, 'base64').toString('utf8'));
  }

  // Add new entry
  entries.unshift(entry);

  // Keep last 1000 entries
  if (entries.length > 1000) entries = entries.slice(0, 1000);

  const content = Buffer.from(JSON.stringify(entries, null, 2)).toString('base64');

  const body = {
    message: `${entry.mood || '📝'} ${new Date(entry.timestamp).toISOString().slice(0, 10)}`,
    content,
  };
  if (sha) body.sha = sha;

  await githubAPI(`/repos/${REPO}/contents/index.json`, 'PUT', body);
  return entries;
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const entries = await getEntries();
      return res.json({ entries });
    }

    if (req.method === 'POST') {
      // Auth check for writes
      const key = req.headers['x-api-key'];
      if (key !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { text, mood, tags, type } = req.body;
      if (!text) return res.status(400).json({ error: 'text is required' });

      const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        timestamp: new Date().toISOString(),
        text,
        mood: mood || null,
        tags: tags || [],
        type: type || 'thought'
      };

      const entries = await saveEntry(entry);
      return res.json({ entry, total: entries.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
