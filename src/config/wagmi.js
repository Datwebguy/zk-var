import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { defineChain } from '@reown/appkit/networks';
import { QueryClient } from '@tanstack/react-query';

export const xLayerTestnet = defineChain({
  id: 1952,
  caipNetworkId: 'eip155:1952',
  chainNamespace: 'eip155',
  name: 'X Layer Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'OKB',
    symbol: 'OKB'
  },
  rpcUrls: {
    default: { http: ['https://testrpc.xlayer.tech/terigon'] },
    public: { http: ['https://testrpc.xlayer.tech/terigon'] }
  },
  blockExplorers: {
    default: {
      name: 'OKX Explorer',
      url: 'https://www.okx.com/web3/explorer/xlayer-test'
    }
  },
  testnet: true
});

export const queryClient = new QueryClient();

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || 'demo-zk-var-local';
const networks = [xLayerTestnet];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId
});

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  defaultNetwork: xLayerTestnet,
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
