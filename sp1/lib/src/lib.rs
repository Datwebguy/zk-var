use alloy_primitives::{FixedBytes, U256};
use alloy_sol_types::sol;

sol! {
    struct PublicValuesStruct {
        uint256 playId;
        bool isOffside;
        bytes32 dataHash;
    }
}

pub fn public_values(play_id: u64, is_offside: bool, data_hash: [u8; 32]) -> PublicValuesStruct {
    PublicValuesStruct {
        playId: U256::from(play_id),
        isOffside: is_offside,
        dataHash: FixedBytes::from(data_hash),
    }
}
