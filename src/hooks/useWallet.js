import { useCallback, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { useAccount, useBalance, useDisconnect, useSwitchChain } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { useAppStore } from '../store/useAppStore';
import { truncateAddress, XLAYER_RPC_URLS } from '../utils/contractHelpers';
import { xLayerTestnet } from '../config/wagmi';

export const useWallet = () => {
  const { setWalletState, disconnectWallet: clearWalletState, addNotification } = useAppStore();
  const { open } = useAppKit();
  const { address, chainId, isConnected, connector } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [fallbackBalance, setFallbackBalance] = useState(null);
  const [fallbackBalanceLoading, setFallbackBalanceLoading] = useState(false);
  const [fallbackBalanceError, setFallbackBalanceError] = useState(null);

  const {
    data: balanceData,
    isLoading: wagmiBalanceLoading,
    isFetching: wagmiBalanceFetching,
    error: wagmiBalanceError
  } = useBalance({
    address,
    chainId: xLayerTestnet.id,
    query: {
      enabled: Boolean(address)
    }
  });

  useEffect(() => {
    let cancelled = false;

    const fetchFallbackBalance = async () => {
      if (!address) {
        setFallbackBalance(null);
        setFallbackBalanceError(null);
        return;
      }

      setFallbackBalanceLoading(true);
      setFallbackBalanceError(null);

      for (const rpcUrl of XLAYER_RPC_URLS) {
        try {
          const provider = new ethers.JsonRpcProvider(rpcUrl, xLayerTestnet.id, {
            staticNetwork: true
          });
          const rawBalance = await provider.getBalance(address);
          if (!cancelled) {
            setFallbackBalance(ethers.formatEther(rawBalance));
            setFallbackBalanceError(null);
          }
          return;
        } catch (error) {
          if (!cancelled) {
            setFallbackBalanceError(error);
          }
        }
      }

      if (!cancelled) {
        setFallbackBalance(null);
      }
    };

    fetchFallbackBalance().finally(() => {
      if (!cancelled) {
        setFallbackBalanceLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [address, chainId]);

  const resolvedBalance = useMemo(() => {
    if (fallbackBalance !== null) {
      return fallbackBalance;
    }

    if (balanceData?.value !== undefined) {
      return balanceData.formatted;
    }

    return null;
  }, [balanceData?.formatted, balanceData?.value, fallbackBalance]);

  const formattedBalance = useMemo(() => {
    if (!resolvedBalance) return '0.0000';
    return Number(resolvedBalance).toFixed(4);
  }, [resolvedBalance]);

  const balanceLoading = Boolean(
    isConnected &&
    !resolvedBalance &&
    (wagmiBalanceLoading || wagmiBalanceFetching || fallbackBalanceLoading)
  );
  const balanceReady = Boolean(isConnected && resolvedBalance);
  const balanceError = wagmiBalanceError || fallbackBalanceError;
  const isCorrectNetwork = chainId === xLayerTestnet.id;

  useEffect(() => {
    setWalletState({
      walletConnected: isConnected,
      userAddress: address || '',
      walletType: connector?.name || '',
      balance: isConnected ? formattedBalance : '0.0000',
      chainId: chainId || null
    });
  }, [address, chainId, connector?.name, formattedBalance, isConnected, setWalletState]);

  const connectWallet = useCallback(async () => {
    try {
      await open({ view: 'Connect' });
    } catch (error) {
      console.error('Wallet modal error:', error);
      addNotification('error', 'Could not open wallet connection modal.');
    }
  }, [open, addNotification]);

  const ensureXLayer = useCallback(async () => {
    if (!isConnected || chainId === xLayerTestnet.id) return true;

    try {
      await switchChainAsync({ chainId: xLayerTestnet.id });
      return true;
    } catch (error) {
      console.error('Failed to switch to X Layer Testnet:', error);
      addNotification('error', 'Please switch your wallet to X Layer Testnet.');
      return false;
    }
  }, [addNotification, chainId, isConnected, switchChainAsync]);

  const disconnectWallet = useCallback(async () => {
    try {
      await disconnectAsync();
    } finally {
      clearWalletState();
    }
  }, [clearWalletState, disconnectAsync]);

  return {
    walletConnected: isConnected,
    userAddress: address || '',
    walletType: connector?.name || '',
    balance: isConnected ? formattedBalance : '0.0000',
    balanceReady,
    balanceLoading,
    balanceError,
    chainId: chainId || null,
    isCorrectNetwork,
    connectWallet,
    disconnectWallet,
    ensureXLayer,
    connectedLabel: address ? truncateAddress(address) : ''
  };
};
