use wasm_bindgen::prelude::*;
use utils::add;

/// Called automatically when the WASM module is instantiated.
#[wasm_bindgen(start)]
pub fn init() {
    web_sys::console::log_1(&"WASM module initialised".into());
}

/// Returns a greeting string, demonstrating string passing across the WASM boundary.
#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! 1 + 2 = {}", name, add(1, 2))
}
