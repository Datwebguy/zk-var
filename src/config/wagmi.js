import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { defineChain } from '@reown/appkit/networks';
import { QueryClient } from '@tanstack/react-query';

export const xLayer = defineChain({
  id: 196,
  caipNetworkId: 'eip155:196',
  chainNamespace: 'eip155',
  name: 'X Layer',
  nativeCurrency: {
    decimals: 18,
    name: 'OKB',
    symbol: 'OKB'
  },
  rpcUrls: {
    default: { http: ['https://rpc.xlayer.tech'] },
    public: { http: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'] }
  },
  blockExplorers: {
    default: {
      name: 'OKX Explorer',
      url: 'https://www.okx.com/web3/explorer/xlayer'
    }
  },
  testnet: false
});

export const queryClient = new QueryClient();

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;
if (!projectId) {
  console.error('VITE_REOWN_PROJECT_ID is not configured. WalletConnect/Reown wallet modal may not initialize.');
}
const networks = [xLayer];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId: projectId || ''
});

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId: projectId || '',
  defaultNetwork: xLayer,
  metadata: {
    name: 'ZK-VAR',
    description: 'Zero-Knowledge sports prediction market on X Layer',
    url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    icons: []
  },
  features: {
    analytics: false,
    email: false,
    socials: false
  }
});
