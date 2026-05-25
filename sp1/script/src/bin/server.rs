use alloy_sol_types::SolType;
use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    include_elf, Elf, SP1Stdin,
};
use std::{
    env,
    net::SocketAddr,
    panic::{catch_unwind, AssertUnwindSafe},
    sync::mpsc,
    thread,
};
use zk_var_lib::PublicValuesStruct;

const ZK_VAR_ELF: Elf = include_elf!("zk-var-program");

#[derive(Clone)]
struct AppState;

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

async fn health() -> &'static str {
    "zk-var-sp1-prover: ok"
}

async fn prove(
    State(_state): State<AppState>,
    Json(body): Json<ProveRequestBody>,
) -> Result<Json<ProveResponseBody>, (StatusCode, String)> {
    let data_hash = decode_data_hash(&body.data_hash)
        .map_err(|error| (StatusCode::BAD_REQUEST, error))?;
    let stdin = stdin_for(body.play_id, body.is_offside, data_hash);
    let play_id = body.play_id;
    let is_offside = body.is_offside;
    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        let result = catch_unwind(AssertUnwindSafe(|| {
            prove_on_current_thread(play_id, is_offside, stdin)
        }))
        .unwrap_or_else(|panic| Err(format!("proof worker panicked: {}", panic_message(panic))));
        let _ = tx.send(result);
    });

    let response = tokio::task::spawn_blocking(move || {
        rx.recv()
            .map_err(|error| format!("proof worker failed: {error}"))?
    })
    .await
    .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?
    .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;

    Ok(Json(response))
}

fn panic_message(panic: Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = panic.downcast_ref::<String>() {
        return message.clone();
    }
    if let Some(message) = panic.downcast_ref::<&str>() {
        return message.to_string();
    }
    "unknown panic".to_string()
}

fn prove_on_current_thread(
    play_id: u64,
    is_offside: bool,
    stdin: SP1Stdin,
) -> Result<ProveResponseBody, String> {
    let client = ProverClient::from_env();
    let pk = client
        .setup(ZK_VAR_ELF)
        .map_err(|error| error.to_string())?;
    let proof = client
        .prove(&pk, stdin)
        .groth16()
        .run()
        .map_err(|error| error.to_string())?;

    let public_values = proof.public_values.as_slice();
    let decoded =
        PublicValuesStruct::abi_decode(public_values).map_err(|error| error.to_string())?;
    if decoded.playId.to_string() != play_id.to_string() {
        return Err("proof public playId mismatch".to_string());
    }
    if decoded.isOffside != is_offside {
        return Err("proof public isOffside mismatch".to_string());
    }

    Ok(ProveResponseBody {
        public_values: format!("0x{}", hex::encode(public_values)),
        proof_bytes: format!("0x{}", hex::encode(proof.bytes())),
    })
}

fn main() {
    sp1_sdk::utils::setup_logger();
    dotenv::dotenv().ok();

    let host = env::var("ZK_VAR_PROVER_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("ZK_VAR_PROVER_PORT").unwrap_or_else(|_| "8080".to_string());
    let addr: SocketAddr = format!("{host}:{port}").parse().expect("invalid bind address");
    let state = AppState;

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("failed to create tokio runtime");

    runtime.block_on(async move {
        let app = Router::new()
            .route("/", get(health))
            .route("/health", get(health))
            .route("/prove", post(prove))
            .with_state(state);
        let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
        println!("ZK-VAR SP1 prover listening on http://{addr}");
        axum::serve(listener, app).await.unwrap();
    });
}
