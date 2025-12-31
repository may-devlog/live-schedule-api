# Rustアプリ用のDockerfile
FROM rust:1.75 as builder

WORKDIR /app

# 依存関係をコピーしてビルド（キャッシュを効かせるため）
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# 実際のソースコードをコピー
COPY src ./src
COPY data ./data

# ビルド（依存関係はキャッシュから使用）
RUN touch src/main.rs
RUN cargo build --release

# 実行用イメージ
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ビルドしたバイナリをコピー
COPY --from=builder /app/target/release/live-schedule-api /app/live-schedule-api
COPY --from=builder /app/data ./data

# データベースディレクトリを作成
RUN mkdir -p /app/data && chmod 755 /app/data

EXPOSE 3000

CMD ["./live-schedule-api"]


