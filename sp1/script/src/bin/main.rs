use alloy_sol_types::SolType;
use clap::Parser;
use serde::Serialize;
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    include_elf, Elf, HashableKey, ProvingKey, SP1Stdin,
};
use zk_var_lib::PublicValuesStruct;

const ZK_VAR_ELF: Elf = include_elf!("zk-var-program");

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(long)]
    execute: bool,

    #[arg(long)]
    prove: bool,

    #[arg(long)]
    play_id: u64,

    #[arg(long)]
    is_offside: bool,

    #[arg(long)]
    data_hash: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProofResponse {
    vkey: String,
    public_values: String,
    proof_bytes: String,
}

fn decode_data_hash(data_hash: &str) -> [u8; 32] {
    let trimmed = data_hash.strip_prefix("0x").unwrap_or(data_hash);
    let bytes = hex::decode(trimmed).expect("data_hash must be valid hex");
    bytes.try_into().expect("data_hash must be exactly 32 bytes")
}

fn stdin_for(play_id: u64, is_offside: bool, data_hash: [u8; 32]) -> SP1Stdin {
    let mut stdin = SP1Stdin::new();
    stdin.write(&play_id);
    stdin.write(&is_offside);
    stdin.write(&data_hash);
    stdin
}

fn main() {
    sp1_sdk::utils::setup_logger();
    dotenv::dotenv().ok();

    let args = Args::parse();
    if args.execute == args.prove {
        eprintln!("Specify exactly one of --execute or --prove.");
        std::process::exit(1);
    }

    let data_hash = decode_data_hash(&args.data_hash);
    let client = ProverClient::from_env();
    let stdin = stdin_for(args.play_id, args.is_offside, data_hash);

    if args.execute {
        let (output, report) = client.execute(ZK_VAR_ELF, stdin).run().unwrap();
        let decoded = PublicValuesStruct::abi_decode(output.as_slice()).unwrap();
        println!("playId: {}", decoded.playId);
        println!("isOffside: {}", decoded.isOffside);
        println!("dataHash: 0x{}", hex::encode(decoded.dataHash));
        println!("publicValues: 0x{}", hex::encode(output.as_slice()));
        println!("cycles: {}", report.total_instruction_count());
        return;
    }

    let pk = client.setup(ZK_VAR_ELF).expect("failed to setup elf");
    let proof = client
        .prove(&pk, stdin)
        .groth16()
        .run()
        .expect("failed to generate groth16 proof");

    let response = ProofResponse {
        vkey: pk.verifying_key().bytes32().to_string(),
        public_values: format!("0x{}", hex::encode(proof.public_values.as_slice())),
        proof_bytes: format!("0x{}", hex::encode(proof.bytes())),
    };

    println!("{}", serde_json::to_string_pretty(&response).unwrap());
}
