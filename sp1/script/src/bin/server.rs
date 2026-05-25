use alloy_sol_types::SolType;
use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    include_elf, Elf, HashableKey, ProvingKey, SP1Stdin,
};
use std::{env, net::SocketAddr, sync::Arc};

const ZK_VAR_ELF: Elf = include_elf!("zk-var-program");

#[derive(Clone)]
struct AppState {
    vkey: String,
    pk: Arc<ProvingKey>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProveRequestBody {
    play_id: u64,
    is_offside: bool,
    data_hash: String,
    #[serde(default)]
    _timeline: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProveResponseBody {
    public_values: String,
    proof_bytes: String,
}

fn decode_data_hash(data_hash: &str) -> Result<[u8; 32], String> {
    let trimmed = data_hash.strip_prefix("0x").unwrap_or(data_hash);
    let bytes = hex::decode(trimmed).map_err(|error| error.to_string())?;
    bytes
        .try_into()
        .map_err(|_| "dataHash must be exactly 32 bytes".to_string())
}

fn stdin_for(play_id: u64, is_offside: bool, data_hash: [u8; 32]) -> SP1Stdin {
    let mut stdin = SP1Stdin::new();
    stdin.write(&play_id);
    stdin.write(&is_offside);
    stdin.write(&data_hash);
    stdin
}

async fn prove(
    State(state): State<AppState>,
    Json(body): Json<ProveRequestBody>,
) -> Result<Json<ProveResponseBody>, String> {
    let data_hash = decode_data_hash(&body.data_hash)?;
    let stdin = stdin_for(body.play_id, body.is_offside, data_hash);
    let pk = state.pk.clone();

    let proof = tokio::task::spawn_blocking(move || {
        let client = ProverClient::from_env();
        client.prove(&pk, stdin).groth16().run()
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?;

    let public_values = proof.public_values.as_slice();
    let decoded = zk_var_lib::PublicValuesStruct::abi_decode(public_values)
        .map_err(|error| error.to_string())?;
    if decoded.playId != alloy_primitives::U256::from(body.play_id) {
        return Err("proof public playId mismatch".to_string());
    }
    if decoded.isOffside != body.is_offside {
        return Err("proof public isOffside mismatch".to_string());
    }

    Ok(Json(ProveResponseBody {
        public_values: format!("0x{}", hex::encode(public_values)),
        proof_bytes: format!("0x{}", hex::encode(proof.bytes())),
    }))
}

#[tokio::main]
async fn main() {
    sp1_sdk::utils::setup_logger();
    dotenv::dotenv().ok();

    let client = ProverClient::from_env();
    let pk = client.setup(ZK_VAR_ELF).expect("failed to setup elf");
    let state = AppState {
        vkey: pk.verifying_key().bytes32().to_string(),
        pk: Arc::new(pk),
    };
    println!("ZK-VAR SP1 program vkey: {}", state.vkey);

    let host = env::var("ZK_VAR_PROVER_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("ZK_VAR_PROVER_PORT").unwrap_or_else(|_| "8080".to_string());
    let addr: SocketAddr = format!("{host}:{port}").parse().expect("invalid bind address");

    let app = Router::new().route("/prove", post(prove)).with_state(state);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    println!("ZK-VAR SP1 prover listening on http://{addr}");
    axum::serve(listener, app).await.unwrap();
}
