# =============================================================================
# NCRN — top-level Makefile
# =============================================================================
# Targets:
#   make setup      install toolchain, wasm-pack, and JS dependencies
#   make dev        pre-build WASM (dev profile), then start Vite dev server
#                   (the plugin watches and rebuilds WASM on subsequent Rust saves)
#   make build      wasm-pack + vue-tsc type check + Vite production build → web/dist/
#   make typecheck  TypeScript / Vue type check only (no build)
#   make check      Rust clippy + unit tests
#   make fmt        format Rust + TS/Vue sources
#   make clean      remove build artefacts
# =============================================================================

.DEFAULT_GOAL := help
.PHONY: help setup dev build typecheck check fmt clean

SHELL := /bin/bash

# Colours
BOLD  := \033[1m
RESET := \033[0m
GREEN := \033[32m
CYAN  := \033[36m

help:
	@printf "$(BOLD)NCRN — available make targets:$(RESET)\n"
	@printf "  $(CYAN)setup$(RESET)      Install Rust toolchain, wasm-pack, and pnpm JS deps\n"
	@printf "  $(CYAN)dev$(RESET)        Start Vite dev server (WASM auto-rebuilt on save)\n"
	@printf "  $(CYAN)build$(RESET)      wasm-pack + vue-tsc + Vite production build → web/dist/\n"
	@printf "  $(CYAN)typecheck$(RESET)  TypeScript / Vue type check only\n"
	@printf "  $(CYAN)check$(RESET)      Clippy lint + Rust unit tests\n"
	@printf "  $(CYAN)fmt$(RESET)        Format Rust and TS/Vue sources\n"
	@printf "  $(CYAN)clean$(RESET)      Remove build artefacts\n"

# -----------------------------------------------------------------------------
setup:
	@printf "$(GREEN)$(BOLD)▸ Rust toolchain$(RESET)\n"
	rustup show
	@printf "$(GREEN)$(BOLD)▸ wasm-pack$(RESET)\n"
	@if ! command -v wasm-pack &>/dev/null; then \
	    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh; \
	else \
	    echo "  already installed: $$(wasm-pack --version)"; \
	fi
	@printf "$(GREEN)$(BOLD)▸ JS dependencies (pnpm)$(RESET)\n"
	cd web && pnpm install
	@printf "$(GREEN)$(BOLD)Setup complete.$(RESET)\n"

# -----------------------------------------------------------------------------
dev:
	@printf "$(GREEN)$(BOLD)▸ Building WASM (dev profile)...$(RESET)\n"
	wasm-pack build crates/core --target web --dev
	@printf "$(GREEN)$(BOLD)▸ Starting Vite dev server...$(RESET)\n"
	cd web && pnpm dev

# -----------------------------------------------------------------------------
build:
	@printf "$(GREEN)$(BOLD)▸ Building WASM (release profile)...$(RESET)\n"
	wasm-pack build crates/core --target web
	@printf "$(GREEN)$(BOLD)▸ Building Vite...$(RESET)\n"
	cd web && pnpm build

# -----------------------------------------------------------------------------
typecheck:
	cd web && pnpm typecheck

# -----------------------------------------------------------------------------
check:
	@printf "$(GREEN)$(BOLD)▸ clippy$(RESET)\n"
	cargo clippy --workspace --all-targets --all-features -- -D warnings
	@printf "$(GREEN)$(BOLD)▸ tests$(RESET)\n"
	cargo test --workspace

# -----------------------------------------------------------------------------
fmt:
	@printf "$(GREEN)$(BOLD)▸ rustfmt$(RESET)\n"
	cargo fmt --all
	@printf "$(GREEN)$(BOLD)▸ prettier$(RESET)\n"
	@if command -v prettier &>/dev/null; then \
	    prettier --write "web/src/**/*.{ts,vue,json}"; \
	else \
	    echo "  prettier not found — skipping JS/Vue formatting"; \
	fi

# -----------------------------------------------------------------------------
clean:
	cargo clean
	rm -rf crates/core/pkg crates/utils/pkg
	rm -rf web/dist web/.vite
