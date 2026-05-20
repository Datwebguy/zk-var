import { useCallback, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ethers } from 'ethers';
import { truncateAddress } from '../utils/contractHelpers';

const XLAYER_TESTNET_PARAMS = {
  chainId: '0xc3', // 195 in hex
  chainName: 'X Layer Testnet',
  nativeCurrency: {
    name: 'OKB',
    symbol: 'OKB',
    decimals: 18,
  },
  rpcUrls: ['https://testrpc.xlayer.tech/terigon'],
  blockExplorerUrls: ['https://www.okx.com/web3/explorer/xlayer-test'],
};

export const useWallet = () => {
  const {
    walletConnected,
    userAddress,
    walletType,
    balance,
    chainId,
    setWalletState,
    disconnectWallet,
    addNotification,
  } = useAppStore();

  const switchNetwork = useCallback(async (provider) => {
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: XLAYER_TESTNET_PARAMS.chainId }],
      });
      return true;
    } catch (switchError) {
      // Code 4902 means the chain has not been added to the wallet
      if (switchError.code === 4902) {
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [XLAYER_TESTNET_PARAMS],
          });
          return true;
        } catch (addError) {
          console.error("Failed to add X Layer Testnet:", addError);
          addNotification('error', 'Could not add X Layer Testnet to wallet.');
        }
      } else {
        console.error("Failed to switch to X Layer Testnet:", switchError);
        addNotification('error', 'Failed to switch network. Please change it manually to X Layer.');
      }
      return false;
    }
  }, [addNotification]);

  const connectWallet = useCallback(async (type = 'okx') => {
    if (typeof window === 'undefined') return;

    let provider;
    if (type === 'okx') {
      provider = window.okxwallet;
      if (!provider) {
        addNotification('error', 'OKX Wallet is not installed. Please install the OKX extension!');
        window.open('https://www.okx.com/web3', '_blank');
        return;
      }
    } else {
      // Secondary: Metamask or standard injected window.ethereum
      provider = window.ethereum;
      if (!provider) {
        addNotification('error', 'No Web3 wallet detected. Please install OKX Wallet or MetaMask!');
        return;
      }
    }

    try {
      addNotification('pending', `Connecting to ${type === 'okx' ? 'OKX Wallet' : 'MetaMask'}...`);
      
      // Request accounts
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (accounts.length === 0) {
        addNotification('error', 'Connection rejected by user.');
        return;
      }

      const address = accounts[0];
      
      // Query chainId directly from the provider before instantiating Ethers BrowserProvider
      const chainIdHex = await provider.request({ method: 'eth_chainId' });
      let currentChainId = Number(chainIdHex);

      // Verify and switch network if not on X Layer Testnet (Chain ID 195)
      if (currentChainId !== 195) {
        const switched = await switchNetwork(provider);
        if (!switched) return;
        
        // Query again after the switch
        const updatedChainIdHex = await provider.request({ method: 'eth_chainId' });
        currentChainId = Number(updatedChainIdHex);
      }

      // Now create the BrowserProvider in a stable network state
      const browserProvider = new ethers.BrowserProvider(provider);

      // Fetch balance
      const rawBalance = await browserProvider.getBalance(address);
      const balanceEther = ethers.formatEther(rawBalance);
      const formattedBalance = parseFloat(balanceEther).toFixed(4);

      setWalletState({
        walletConnected: true,
        userAddress: address,
        walletType: type,
        balance: formattedBalance,
        chainId: currentChainId
      });

      addNotification('success', `Connected to ${truncateAddress(address)} successfully!`);

    } catch (error) {
      console.error("Wallet connection error:", error);
      addNotification('error', 'Wallet connection failed. See console.');
    }
  }, [addNotification, switchNetwork, setWalletState]);

  // Hook up event listeners for account / chain changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!walletConnected) return;
    
    // Choose active provider based on connected state
    const provider = walletType === 'okx' ? window.okxwallet : window.ethereum;
    if (!provider) return;

    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        const address = accounts[0];
        const browserProvider = new ethers.BrowserProvider(provider);
        const rawBalance = await browserProvider.getBalance(address);
        const formattedBalance = parseFloat(ethers.formatEther(rawBalance)).toFixed(4);
        
        setWalletState({
          userAddress: address,
          balance: formattedBalance
        });
        addNotification('success', `Switched account to ${truncateAddress(address)}`);
      }
    };

    const handleChainChanged = (hexChainId) => {
      const newChainId = Number(hexChainId);
      setWalletState({ chainId: newChainId });
      if (newChainId !== 195) {
        addNotification('pending', 'Switched off X Layer Testnet. Please switch back to interact.');
      } else {
        addNotification('success', 'Switched to X Layer Testnet successfully!');
      }
    };

    provider.on('accountsChanged', handleAccountsChanged);
    provider.on('chainChanged', handleChainChanged);

    return () => {
      provider.removeListener('accountsChanged', handleAccountsChanged);
      provider.removeListener('chainChanged', handleChainChanged);
    };
  }, [walletConnected, walletType, disconnectWallet, setWalletState, addNotification]);

  return {
    walletConnected,
    userAddress,
    walletType,
    balance,
    chainId,
    connectWallet,
    disconnectWallet,
  };
};
