export const TX_HISTORY_EVENT = 'zkvar:transaction-history-updated';
export const EXPLORER_TX_BASE = 'https://www.okx.com/web3/explorer/xlayer/tx';

const HISTORY_PREFIX = 'zkvar:tx-history';
const MAX_HISTORY_ITEMS = 100;

const getWalletKey = (address) => `${HISTORY_PREFIX}:${address.toLowerCase()}`;

const normalizeRecord = (record) => ({
  id: record.id || `${record.hash}-${record.timestamp || Date.now()}`,
  hash: record.hash,
  wallet: record.wallet || '',
  type: record.type || 'Transaction',
  label: record.label || record.method || 'Contract interaction',
  amount: record.amount || '',
  target: record.target || '',
  status: record.status || 'confirmed',
  timestamp: record.timestamp || Date.now(),
  explorerUrl: `${EXPLORER_TX_BASE}/${record.hash}`
});

const readHistory = (address) => {
  if (typeof window === 'undefined' || !address) return [];

  try {
    return JSON.parse(window.localStorage.getItem(getWalletKey(address)) || '[]');
  } catch {
    return [];
  }
};

export const getPersonalTransactionHistory = (address) => readHistory(address);

export const savePersonalTransaction = (address, record) => {
  if (typeof window === 'undefined' || !address || !record?.hash) return;

  const nextRecord = normalizeRecord({ ...record, wallet: address });
  const existing = readHistory(address).filter((item) => item.hash !== nextRecord.hash);
  const nextHistory = [nextRecord, ...existing].slice(0, MAX_HISTORY_ITEMS);

  window.localStorage.setItem(getWalletKey(address), JSON.stringify(nextHistory));
  window.dispatchEvent(new CustomEvent(TX_HISTORY_EVENT, { detail: nextRecord }));
};
