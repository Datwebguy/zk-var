use sp1_sdk::{blocking::MockProver, blocking::Prover, include_elf, Elf, HashableKey, ProvingKey};

const ZK_VAR_ELF: Elf = include_elf!("zk-var-program");

fn main() {
    let prover = MockProver::new();
    let pk = prover.setup(ZK_VAR_ELF).expect("failed to setup elf");
    println!("{}", pk.verifying_key().bytes32());
}
