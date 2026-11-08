.PHONY: install set-version dev build test test-watch test-ui rust-check rust-test tauri-dev tauri-build macos cross-windows windows linux clean

WINDOWS_TARGET ?= x86_64-pc-windows-msvc

install:
	npm install

set-version:
	@if [ -z "$(word 2,$(MAKECMDGOALS))" ]; then echo 'usage: make set-version 0.2.0'; exit 1; fi
	node scripts/set-version.mjs "$(word 2,$(MAKECMDGOALS))"

# 吞掉 set-version 后面的版本号参数，避免 make 报 "No rule to make target"
%:
	@:

dev:
	npm run dev

build:
	npm run build

test:
	npm test

test-watch:
	npm run test:watch

test-ui:
	npm run test:ui

rust-check:
	cargo check --manifest-path src-tauri/Cargo.toml

rust-test:
	cargo test --manifest-path src-tauri/Cargo.toml

tauri-dev:
	npm run tauri dev

tauri-build:
	npm run tauri build

macos:
	npm run tauri build -- --bundles dmg
	mkdir -p dist
	mv src-tauri/target/release/bundle/dmg/*.dmg dist/

# cross-windows 可在 Linux/macOS 上交叉编译，需先准备：
#   rustup target add x86_64-pc-windows-msvc
#   cargo install --locked cargo-xwin
#   Linux: sudo apt install lld llvm
#   macOS: brew install llvm，并将 $(brew --prefix llvm)/bin 加入 PATH
cross-windows:
	npm run tauri build -- --runner cargo-xwin --target $(WINDOWS_TARGET)
	mkdir -p dist
	cp src-tauri/target/$(WINDOWS_TARGET)/release/prompt-debugger.exe dist/

windows:
	npm run tauri build
	mkdir -p dist
	cp src-tauri/target/release/prompt-debugger.exe dist/

linux:
	npm run tauri build
	mkdir -p dist
	cp src-tauri/target/release/prompt-debugger dist/

clean:
	rm -rf dist src-tauri/target
