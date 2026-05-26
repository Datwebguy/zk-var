import crypto from 'node:crypto';

const DEFAULT_LANGUAGE = 'en';
const DEFAULT_FORMAT = 'json';

const jsonResponse = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const parseSportEventMap = () => {
  const rawMap = process.env.SPORTRADAR_SPORT_EVENT_MAP || '{}';
  try {
    return JSON.parse(rawMap);
  } catch {
    throw new Error('SPORTRADAR_SPORT_EVENT_MAP must be valid JSON.');
  }
};

const fetchSportradarTimeline = async (sportEventId) => {
  const apiKey = process.env.SPORTRADAR_API_KEY;
  const accessLevel = process.env.SPORTRADAR_ACCESS_LEVEL || 'trial';
  const language = process.env.SPORTRADAR_LANGUAGE || DEFAULT_LANGUAGE;
  const format = process.env.SPORTRADAR_FORMAT || DEFAULT_FORMAT;

  if (!apiKey) {
    throw new Error('SPORTRADAR_API_KEY is not configured.');
  }

  const url = new URL(
    `https://api.sportradar.com/soccer/${accessLevel}/v4/${language}/sport_events/${encodeURIComponent(sportEventId)}/timeline.${format}`
  );
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'x-api-key': apiKey
    }
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Sportradar timeline request failed with HTTP ${response.status}: ${bodyText}`);
  }

  return JSON.parse(bodyText);
};

const canonicalize = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {});
  }

  return value;
};

const toDataHash = (payload) => {
  const canonicalPayload = JSON.stringify(canonicalize(payload));
  return `0x${crypto.createHash('sha256').update(canonicalPayload).digest('hex')}`;
};

const textIncludes = (value, needles) => {
  if (typeof value !== 'string') return false;
  const normalized = value.toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
};

const eventLooksLikeVarOffside = (event) => {
  const values = Object.values(event || {});
  const hasVar = values.some((value) => textIncludes(value, ['var', 'video assistant']));
  const hasOffside = values.some((value) => textIncludes(value, ['offside']));
  const hasOverturn = values.some((value) => textIncludes(value, ['overturn', 'disallow', 'cancel', 'annul']));
  return hasVar && hasOffside && hasOverturn;
};

const deriveVerdict = (timeline) => {
  const events = timeline?.timeline || timeline?.sport_event_timeline || [];
  if (!Array.isArray(events)) {
    throw new Error('Sportradar timeline response did not include a timeline array.');
  }

  return events.some(eventLooksLikeVarOffside);
};

const requestProofFromBackend = async ({ playId, isOffside, dataHash, timeline }) => {
  const proverUrl = process.env.SP1_PROVER_URL;
  if (!proverUrl) {
    throw new Error('SP1_PROVER_URL is not configured. Proof generation is unavailable.');
  }

  const response = await fetch(`${proverUrl.replace(/\/$/, '')}/prove`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      playId,
      isOffside,
      dataHash,
      source: 'sportradar-soccer-v4-timeline',
      timeline
    })
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`SP1 prover request failed with HTTP ${response.status}: ${bodyText}`);
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error(`SP1 prover returned non-JSON response with HTTP ${response.status}: ${bodyText}`);
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    jsonResponse(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const { playId } = req.body || {};
    if (!Number.isInteger(Number(playId))) {
      jsonResponse(res, 400, { error: 'playId must be an integer.' });
      return;
    }

    const sportEventMap = parseSportEventMap();
    const sportEventId = sportEventMap[String(playId)];
    if (!sportEventId) {
      jsonResponse(res, 400, {
        error: `No Sportradar sport_event_id configured for playId ${playId}.`
      });
      return;
    }

    const timeline = await fetchSportradarTimeline(sportEventId);
    const isOffside = deriveVerdict(timeline);
    const dataHash = toDataHash({
      playId: Number(playId),
      sportEventId,
      source: 'sportradar-soccer-v4-timeline',
      timeline
    });

    const proof = await requestProofFromBackend({
      playId: Number(playId),
      isOffside,
      dataHash,
      timeline
    });

    jsonResponse(res, 200, {
      isOffside,
      dataHash,
      publicValues: proof.publicValues,
      proofBytes: proof.proofBytes
    });
  } catch (error) {
    jsonResponse(res, 500, { error: error.message || 'Proof request failed.' });
  }
}
