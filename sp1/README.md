# ZK-VAR SP1 Prover

This workspace contains the real SP1 guest program and prover service for ZK-VAR.

The guest program commits public values compatible with `ZKVerifier.sol`:

```solidity
abi.encode(uint256 playId, bool isOffside, bytes32 dataHash)
```

## Commands

From `sp1/script`:

```powershell
cargo run --release --bin vkey
cargo run --release --bin zk-var-prover -- --execute --play-id 101 --is-offside true --data-hash 0x...
cargo run --release --bin zk-var-prover -- --prove --play-id 101 --is-offside true --data-hash 0x...
cargo run --release --bin server
```

For EVM-compatible proofs, configure Succinct's prover network:

```env
SP1_PROVER=network
NETWORK_PRIVATE_KEY=...
```

The HTTP server exposes:

```text
POST /prove
```

Input:

```json
{
  "playId": 101,
  "isOffside": true,
  "dataHash": "0x...",
  "timeline": {}
}
```

Output:

```json
{
  "publicValues": "0x...",
  "proofBytes": "0x..."
}
```

## Platform Note

SP1's prover SDK currently depends on Unix-style runtime pieces, so build and run this prover on
Linux, WSL2, Docker, or a Linux cloud VM. Native Windows compilation is not expected to work.

## Docker

From this `sp1/` folder:

```bash
docker build -t zk-var-sp1-prover .
docker run --rm -p 8080:8080 --env-file .env zk-var-sp1-prover
```

Then configure the Vercel app:

```env
SP1_PROVER_URL=http://your-linux-host:8080
```

For local testing against the repo's `/api/prove` route, use:

```env
SP1_PROVER_URL=http://127.0.0.1:8080
```
