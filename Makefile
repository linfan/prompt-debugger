.PHONY: install dev build test test-watch test-ui rust-check rust-test tauri-dev tauri-build dmg clean

install:
	npm install

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

dmg:
	npm run tauri build -- --bundles dmg
	mkdir -p dist
	mv src-tauri/target/release/bundle/dmg/*.dmg dist/

clean:
	rm -rf dist src-tauri/target
