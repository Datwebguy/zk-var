import { useCallback, useEffect } from 'react';
import { useAccount, useBalance, useDisconnect, useSwitchChain } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { useAppStore } from '../store/useAppStore';
import { truncateAddress } from '../utils/contractHelpers';
import { xLayerTestnet } from '../config/wagmi';

export const useWallet = () => {
  const { setWalletState, disconnectWallet: clearWalletState, addNotification } = useAppStore();
  const { open } = useAppKit();
  const { address, chainId, isConnected, connector } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { data: balanceData } = useBalance({
    address,
    chainId: xLayerTestnet.id,
    query: {
      enabled: Boolean(address)
    }
  });

  useEffect(() => {
    const formattedBalance = balanceData?.formatted
      ? Number(balanceData.formatted).toFixed(4)
      : '0.0000';

    setWalletState({
      walletConnected: isConnected,
      userAddress: address || '',
      walletType: connector?.name || '',
      balance: formattedBalance,
      chainId: chainId || null
    });
  }, [address, balanceData?.formatted, chainId, connector?.name, isConnected, setWalletState]);

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
    balance: balanceData?.formatted ? Number(balanceData.formatted).toFixed(4) : '0.0000',
    chainId: chainId || null,
    connectWallet,
    disconnectWallet,
    ensureXLayer,
    connectedLabel: address ? truncateAddress(address) : ''
  };
};
