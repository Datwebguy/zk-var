#![no_main]
sp1_zkvm::entrypoint!(main);

use alloy_sol_types::SolType;
use zk_var_lib::public_values;

pub fn main() {
    let play_id = sp1_zkvm::io::read::<u64>();
    let is_offside = sp1_zkvm::io::read::<bool>();
    let data_hash = sp1_zkvm::io::read::<[u8; 32]>();

    let bytes = zk_var_lib::PublicValuesStruct::abi_encode(&public_values(
        play_id,
        is_offside,
        data_hash,
    ));

    sp1_zkvm::io::commit_slice(&bytes);
}
