import crypto from 'node:crypto';

const DEFAULT_LANGUAGE = 'en';
const DEFAULT_FORMAT = 'json';

const MARKET_RULES = {
  103: {
    eventType: 'var_confirmed_offside',
    label: 'VAR-confirmed offside decision'
  },
  104: {
    eventType: 'goal_disallowed_after_var',
    label: 'goal disallowed after VAR review'
  },
  105: {
    eventType: 'penalty_review',
    label: 'penalty decision reviewed by VAR'
  },
  106: {
    eventType: 'red_card_review',
    label: 'red-card VAR review'
  },
  107: {
    eventType: 'two_or_more_var_reviews',
    label: 'two or more VAR reviews'
  }
};

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

const flattenTextValues = (value) => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenTextValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(flattenTextValues);
  return [];
};

const getEventTextValues = (event) => flattenTextValues(event || {});

const eventHasVarSignal = (event) => {
  const values = getEventTextValues(event);
  return values.some((value) => textIncludes(value, ['var', 'video assistant']));
};

const eventLooksLikeVarOffside = (event) => {
  const values = getEventTextValues(event);
  const hasVar = values.some((value) => textIncludes(value, ['var', 'video assistant']));
  const hasOffside = values.some((value) => textIncludes(value, ['offside']));
  return hasVar && hasOffside;
};

const eventLooksLikeDisallowedGoal = (event) => {
  const values = getEventTextValues(event);
  const hasVar = eventHasVarSignal(event);
  const hasGoal = values.some((value) => textIncludes(value, ['goal']));
  const hasDisallowed = values.some((value) => textIncludes(value, ['disallow', 'cancel', 'annul', 'overturn', 'ruled out']));
  return hasVar && hasGoal && hasDisallowed;
};

const eventLooksLikePenaltyReview = (event) => {
  const values = getEventTextValues(event);
  const hasVar = eventHasVarSignal(event);
  const hasPenalty = values.some((value) => textIncludes(value, ['penalty', 'spot kick']));
  return hasVar && hasPenalty;
};

const eventLooksLikeRedCardReview = (event) => {
  const values = getEventTextValues(event);
  const hasVar = eventHasVarSignal(event);
  const hasCard = values.some((value) => textIncludes(value, ['red card', 'serious foul', 'violent conduct', 'send off', 'sent off']));
  return hasVar && hasCard;
};

const deriveVerdict = (timeline, marketRule) => {
  const events = timeline?.timeline || timeline?.sport_event_timeline || [];
  if (!Array.isArray(events)) {
    throw new Error('Sportradar timeline response did not include a timeline array.');
  }

  switch (marketRule.eventType) {
    case 'var_confirmed_offside':
      return events.some(eventLooksLikeVarOffside);
    case 'goal_disallowed_after_var':
      return events.some(eventLooksLikeDisallowedGoal);
    case 'penalty_review':
      return events.some(eventLooksLikePenaltyReview);
    case 'red_card_review':
      return events.some(eventLooksLikeRedCardReview);
    case 'two_or_more_var_reviews':
      return events.filter(eventHasVarSignal).length >= 2;
    default:
      throw new Error(`Unsupported market event type: ${marketRule.eventType}`);
  }
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
    const normalizedPlayId = Number(playId);
    if (!Number.isInteger(normalizedPlayId)) {
      jsonResponse(res, 400, { error: 'playId must be an integer.' });
      return;
    }

    const marketRule = MARKET_RULES[normalizedPlayId];
    if (!marketRule) {
      jsonResponse(res, 400, {
        error: `No proven market rule configured for playId ${normalizedPlayId}.`
      });
      return;
    }

    const sportEventMap = parseSportEventMap();
    const sportEventId = sportEventMap[String(normalizedPlayId)] || sportEventMap.opening_match || sportEventMap['101'];
    if (!sportEventId) {
      jsonResponse(res, 400, {
        error: `No Sportradar sport_event_id configured for playId ${normalizedPlayId}.`
      });
      return;
    }

    const timeline = await fetchSportradarTimeline(sportEventId);
    const isOffside = deriveVerdict(timeline, marketRule);
    const dataHash = toDataHash({
      playId: normalizedPlayId,
      sportEventId,
      source: 'sportradar-soccer-v4-timeline',
      eventType: marketRule.eventType,
      resolutionRule: marketRule.label,
      timeline
    });

    const proof = await requestProofFromBackend({
      playId: normalizedPlayId,
      isOffside,
      dataHash,
      timeline
    });

    jsonResponse(res, 200, {
      isOffside,
      dataHash,
      eventType: marketRule.eventType,
      resolutionRule: marketRule.label,
      publicValues: proof.publicValues,
      proofBytes: proof.proofBytes
    });
  } catch (error) {
    jsonResponse(res, 500, { error: error.message || 'Proof request failed.' });
  }
}
