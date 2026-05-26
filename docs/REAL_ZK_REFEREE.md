# Real ZK Referee Pipeline

ZK-VAR settlement uses a real prover service and a verifier contract configured
with a nonzero SP1 program verification key.

## Required External Pieces

1. A trusted sports data source
   - Official event/VAR feed, licensed data provider, signed oracle, or zkTLS-style
     proof of an API response.
   - The prover must produce a `bytes32 dataHash` for the exact source data used.

2. A deterministic SP1 guest program
   - Input: `playId` plus validated match/event data.
   - Output: `abi.encode(uint256 playId, bool isOffside, bytes32 dataHash)`.
   - The generated verification key must be deployed as `SP1_PROGRAM_VKEY`.

3. A prover API
   - The frontend calls `POST /prove` at `VITE_ZK_PROVER_API_URL`, or `/api/prove`
     when that variable is unset.
   - `/api/prove` fetches Sportradar Soccer v4 timelines server-side, hashes the
     canonical payload, then forwards the payload to `SP1_PROVER_URL`.
   - The final service response must return:

```json
{
  "isOffside": true,
  "dataHash": "0x...",
  "publicValues": "0x...",
  "proofBytes": "0x..."
}
```

4. A deployed SP1 verifier on X Layer
   - Configure `SP1_VERIFIER` in `.env` before deploying contracts.
   - `ZKVerifier.sol` calls `ISP1Verifier.verifyProof(...)`.

## Settlement Flow

1. Owner/oracle selects a dispute in the frontend.
2. Frontend requests a real proof from the prover API.
3. Frontend commits the returned `dataHash` on-chain if not already committed.
4. Frontend submits `verifyPlayProof(playId, isOffside, publicValues, proofBytes)`.
5. `ZKVerifier.sol` checks the public values and data commitment.
6. The SP1 verifier verifies the proof.
7. `DisputeRegistry` resolves the dispute and linked prediction pool.

## Production Configuration

- Sportradar API key and `SPORTRADAR_SPORT_EVENT_MAP` play-to-match mapping.
- Prover backend deployment URL for `SP1_PROVER_URL`.
- Funded Succinct prover account for proof generation.
- Vercel environment variables pointing to the prover API and deployed contracts:
  `VITE_ZK_VERIFIER_ADDRESS`, `VITE_DISPUTE_REGISTRY_ADDRESS`, and
  `VITE_PREDICTION_POOL_ADDRESS`.
- X Layer mainnet contract addresses matching the current deployment.
