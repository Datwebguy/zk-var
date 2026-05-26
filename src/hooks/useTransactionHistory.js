import { useCallback, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import {
  CONTRACT_ADDRESSES,
  DISPUTE_REGISTRY_ABI,
  PREDICTION_POOL_ABI,
  XLAYER_RPC_URLS,
  formatEtherVal,
  truncateAddress
} from '../utils/contractHelpers';
import {
  EXPLORER_TX_BASE,
  TX_HISTORY_EVENT,
  getPersonalTransactionHistory
} from '../utils/transactionHistory';

const LOG_CHUNK_SIZE = 100;
const DEFAULT_LOOKBACK_BLOCKS = 1000;
const MAX_PUBLIC_ITEMS = 30;
const MAX_PERSONAL_CHAIN_ITEMS = 30;

const getHistoryStartBlock = (latestBlock) => {
  const configuredStart = Number(import.meta.env.VITE_HISTORY_START_BLOCK || 0);
  const lookback = Number(import.meta.env.VITE_HISTORY_LOOKBACK_BLOCKS || DEFAULT_LOOKBACK_BLOCKS);
  return Math.max(configuredStart || 0, latestBlock - lookback);
};

const getBlockTimestamp = async (provider, cache, blockNumber) => {
  if (cache.has(blockNumber)) return cache.get(blockNumber);

  const block = await provider.getBlock(blockNumber);
  const timestamp = (block?.timestamp || 0) * 1000;
  cache.set(blockNumber, timestamp);
  return timestamp;
};

const queryFilterInChunks = async ({ contract, filter, fromBlock, toBlock, maxItems }) => {
  const logs = [];

  for (let end = toBlock; end >= fromBlock && logs.length < maxItems; end -= LOG_CHUNK_SIZE) {
    const start = Math.max(fromBlock, end - LOG_CHUNK_SIZE + 1);
    const chunkLogs = await contract.queryFilter(filter, start, end);
    logs.push(...chunkLogs.reverse());
  }

  return logs.slice(0, maxItems);
};

const queryFilterGroup = async (queries) => {
  const results = await Promise.allSettled(queries.map((query) => queryFilterInChunks(query)));

  return results
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value);
};

const mapEventRecord = async (provider, blockCache, log, fallbackType) => {
  const timestamp = await getBlockTimestamp(provider, blockCache, log.blockNumber);
  const name = log.fragment?.name || fallbackType;
  const args = log.args;

  if (name === 'BetPlaced') {
    return {
      id: `${log.transactionHash}-${log.index}`,
      source: 'chain',
      type: 'Prediction',
      label: `${truncateAddress(args.user)} backed outcome ${Number(args.outcome)} on Pool #${Number(args.poolId)}`,
      amount: `${formatEtherVal(args.amount)} OKB`,
      target: `Pool #${Number(args.poolId)}`,
      wallet: args.user,
      hash: log.transactionHash,
      timestamp,
      explorerUrl: `${EXPLORER_TX_BASE}/${log.transactionHash}`
    };
  }

  if (name === 'VoteCast') {
    return {
      id: `${log.transactionHash}-${log.index}`,
      source: 'chain',
      type: 'Jury Vote',
      label: `${truncateAddress(args.voter)} voted choice ${Number(args.choice)} on Play #${Number(args.playId)}`,
      amount: `${formatEtherVal(args.stake)} OKB`,
      target: `Play #${Number(args.playId)}`,
      wallet: args.voter,
      hash: log.transactionHash,
      timestamp,
      explorerUrl: `${EXPLORER_TX_BASE}/${log.transactionHash}`
    };
  }

  return {
    id: `${log.transactionHash}-${log.index}`,
    source: 'chain',
    type: 'Claim',
    label: `${truncateAddress(args.user || args.voter)} claimed rewards`,
    amount: args.amount ? `${formatEtherVal(args.amount)} OKB` : '',
    target: args.poolId !== undefined ? `Pool #${Number(args.poolId)}` : `Play #${Number(args.playId)}`,
    wallet: args.user || args.voter,
    hash: log.transactionHash,
    timestamp,
    explorerUrl: `${EXPLORER_TX_BASE}/${log.transactionHash}`
  };
};

export const useTransactionHistory = (walletAddress) => {
  const [personalLocalHistory, setPersonalLocalHistory] = useState([]);
  const [personalChainHistory, setPersonalChainHistory] = useState([]);
  const [publicHistory, setPublicHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scannedRange, setScannedRange] = useState(null);

  const loadLocalHistory = useCallback(() => {
    setPersonalLocalHistory(walletAddress ? getPersonalTransactionHistory(walletAddress) : []);
  }, [walletAddress]);

  const refreshChainHistory = useCallback(async () => {
    loadLocalHistory();
    setLoading(true);
    setError('');

    try {
      let lastError = null;

      for (const rpcUrl of XLAYER_RPC_URLS) {
        try {
          const provider = new ethers.JsonRpcProvider(rpcUrl);
          const latestBlock = await provider.getBlockNumber();
          const fromBlock = getHistoryStartBlock(latestBlock);
          const blockCache = new Map();
          const predictionPool = new ethers.Contract(CONTRACT_ADDRESSES.PredictionPool, PREDICTION_POOL_ABI, provider);
          const disputeRegistry = new ethers.Contract(CONTRACT_ADDRESSES.DisputeRegistry, DISPUTE_REGISTRY_ABI, provider);

          const publicLogs = await queryFilterGroup([
            {
              contract: predictionPool,
              filter: predictionPool.filters.BetPlaced(),
              fromBlock,
              toBlock: latestBlock,
              maxItems: MAX_PUBLIC_ITEMS
            },
            {
              contract: disputeRegistry,
              filter: disputeRegistry.filters.VoteCast(),
              fromBlock,
              toBlock: latestBlock,
              maxItems: MAX_PUBLIC_ITEMS
            }
          ]);

          const publicRecords = await Promise.all(
            publicLogs.map((log) => mapEventRecord(provider, blockCache, log))
          );

          setPublicHistory(
            publicRecords
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, MAX_PUBLIC_ITEMS)
          );

          if (walletAddress) {
            const personalLogs = await queryFilterGroup([
              {
                contract: predictionPool,
                filter: predictionPool.filters.BetPlaced(null, walletAddress),
                fromBlock,
                toBlock: latestBlock,
                maxItems: MAX_PERSONAL_CHAIN_ITEMS
              },
              {
                contract: disputeRegistry,
                filter: disputeRegistry.filters.VoteCast(null, walletAddress),
                fromBlock,
                toBlock: latestBlock,
                maxItems: MAX_PERSONAL_CHAIN_ITEMS
              },
              {
                contract: predictionPool,
                filter: predictionPool.filters.PayoutClaimed(null, walletAddress),
                fromBlock,
                toBlock: latestBlock,
                maxItems: MAX_PERSONAL_CHAIN_ITEMS
              },
              {
                contract: predictionPool,
                filter: predictionPool.filters.RefundClaimed(null, walletAddress),
                fromBlock,
                toBlock: latestBlock,
                maxItems: MAX_PERSONAL_CHAIN_ITEMS
              },
              {
                contract: disputeRegistry,
                filter: disputeRegistry.filters.RewardsClaimed(null, walletAddress),
                fromBlock,
                toBlock: latestBlock,
                maxItems: MAX_PERSONAL_CHAIN_ITEMS
              }
            ]);

            const personalRecords = await Promise.all(
              personalLogs.map((log) => mapEventRecord(provider, blockCache, log))
            );

            setPersonalChainHistory(
              personalRecords
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, MAX_PERSONAL_CHAIN_ITEMS)
            );
          } else {
            setPersonalChainHistory([]);
          }

          setScannedRange({ fromBlock, toBlock: latestBlock });
          return;
        } catch (rpcError) {
          lastError = rpcError;
        }
      }

      throw lastError || new Error('No X Layer RPC URL configured.');
    } catch (historyError) {
      console.error('Transaction history fetch failed:', historyError);
      setError('Could not load on-chain history from the X Layer RPC.');
    } finally {
      setLoading(false);
    }
  }, [loadLocalHistory, walletAddress]);

  useEffect(() => {
    queueMicrotask(loadLocalHistory);
    const timer = window.setTimeout(refreshChainHistory, 0);
    return () => window.clearTimeout(timer);
  }, [loadLocalHistory, refreshChainHistory]);

  useEffect(() => {
    const onHistoryUpdate = () => {
      loadLocalHistory();
      window.setTimeout(refreshChainHistory, 3000);
    };
    window.addEventListener(TX_HISTORY_EVENT, onHistoryUpdate);
    return () => window.removeEventListener(TX_HISTORY_EVENT, onHistoryUpdate);
  }, [loadLocalHistory, refreshChainHistory]);

  const personalHistory = useMemo(() => {
    const merged = [...personalLocalHistory, ...personalChainHistory];
    const seen = new Set();

    return merged
      .filter((item) => {
        if (seen.has(item.hash)) return false;
        seen.add(item.hash);
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [personalChainHistory, personalLocalHistory]);

  return {
    personalHistory,
    publicHistory,
    loading,
    error,
    scannedRange,
    refreshHistory: refreshChainHistory
  };
};
