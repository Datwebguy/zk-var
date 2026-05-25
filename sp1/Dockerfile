FROM rust:1-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    clang \
    curl \
    git \
    pkg-config \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

WORKDIR /app/script

RUN cargo build --release --bin server --bin zk-var-prover --bin vkey

EXPOSE 8080

CMD ["./target/release/server"]
