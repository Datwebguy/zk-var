export const PROVEN_WORLD_CUP_MARKETS = [
  {
    poolId: 1,
    playId: 101,
    eventType: 'var_confirmed_offside',
    question: 'Will Mexico vs South Africa include a VAR-confirmed offside decision?',
    description: 'Opening match market. Resolves YES if the official match event feed includes a VAR-confirmed offside decision; otherwise resolves NO.'
  },
  {
    poolId: 2,
    playId: 102,
    eventType: 'goal_disallowed_after_var',
    question: 'Will Mexico vs South Africa have a goal disallowed after VAR review?',
    description: 'Opening match market. Resolves YES if the official match event feed records a goal disallowed, cancelled, or overturned after VAR review; otherwise resolves NO.'
  },
  {
    poolId: 3,
    playId: 103,
    eventType: 'penalty_review',
    question: 'Will Mexico vs South Africa include a penalty decision reviewed by VAR?',
    description: 'Opening match market. Resolves YES if the official match event feed records a penalty awarded, cancelled, confirmed, or reviewed by VAR; otherwise resolves NO.'
  },
  {
    poolId: 4,
    playId: 104,
    eventType: 'red_card_review',
    question: 'Will Mexico vs South Africa include a red-card VAR review?',
    description: 'Opening match market. Resolves YES if the official match event feed records a red-card or serious-foul review by VAR; otherwise resolves NO.'
  },
  {
    poolId: 5,
    playId: 105,
    eventType: 'two_or_more_var_reviews',
    question: 'Will Mexico vs South Africa include two or more VAR reviews?',
    description: 'Opening match market. Resolves YES if the official match event feed records at least two VAR review events; otherwise resolves NO.'
  }
];

export const getProvenMarketByPlayId = (playId) => (
  PROVEN_WORLD_CUP_MARKETS.find((market) => market.playId === Number(playId))
);
