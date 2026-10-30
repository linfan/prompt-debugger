use futures_util::StreamExt;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{ipc::Channel, State};
use tokio_util::sync::CancellationToken;

#[derive(Default)]
pub struct ApiState(pub Mutex<HashMap<String, CancellationToken>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiCompletion {
    format: String,
}

fn redact(message: String, token: &str) -> String {
    if token.is_empty() { message } else { message.replace(token, "[redacted]") }
}

fn decode_utf8(pending: &mut Vec<u8>, chunk: &[u8], end: bool) -> String {
    pending.extend_from_slice(chunk);
    let mut output = String::new();
    loop {
        match std::str::from_utf8(pending) {
            Ok(text) => {
                output.push_str(text);
                pending.clear();
                break;
            }
            Err(error) => {
                let valid = error.valid_up_to();
                output.push_str(&String::from_utf8_lossy(&pending[..valid]));
                pending.drain(..valid);
                if let Some(length) = error.error_len() {
                    output.push('\u{fffd}');
                    pending.drain(..length);
                } else {
                    if end {
                        output.push('\u{fffd}');
                        pending.clear();
                    }
                    break;
                }
            }
        }
    }
    output
}

async fn perform_request(
    url: String,
    token: String,
    payload: Value,
    channel: Channel<String>,
    cancelled: CancellationToken,
) -> Result<ApiCompletion, String> {
    let client = reqwest::Client::new();
    let builder = client.post(&url).json(&payload);
    let builder = if token.is_empty() { builder } else { builder.bearer_auth(&token) };
    let response = tokio::select! {
        result = builder.send() => result.map_err(|error| redact(format!("Request failed: {error}"), &token))?,
        _ = cancelled.cancelled() => return Err("Request cancelled.".into()),
    };
    let status = response.status();
    let content_type = response.headers().get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok()).unwrap_or("").to_ascii_lowercase();
    let streaming = content_type.contains("text/event-stream")
        || (payload.get("stream").and_then(Value::as_bool) == Some(true)
            && !content_type.contains("application/json"));
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(redact(format!("HTTP {status}: {body}"), &token));
    }
    if streaming {
        let mut stream = response.bytes_stream();
        let mut pending = Vec::new();
        loop {
            let next = tokio::select! {
                item = stream.next() => item,
                _ = cancelled.cancelled() => return Err("Request cancelled.".into()),
            };
            match next {
                Some(Ok(bytes)) => {
                    let text = decode_utf8(&mut pending, &bytes, false);
                    if !text.is_empty() {
                        channel.send(text).map_err(|_| "Response window was closed.".to_string())?;
                    }
                }
                Some(Err(error)) => return Err(redact(format!("Stream interrupted: {error}"), &token)),
                None => break,
            }
        }
        let remaining = decode_utf8(&mut pending, &[], true);
        if !remaining.is_empty() {
            channel.send(remaining).map_err(|_| "Response window was closed.".to_string())?;
        }
        Ok(ApiCompletion { format: "sse".into() })
    } else {
        let text = tokio::select! {
            result = response.text() => result.map_err(|error| redact(error.to_string(), &token))?,
            _ = cancelled.cancelled() => return Err("Request cancelled.".into()),
        };
        channel.send(text).map_err(|_| "Response window was closed.".to_string())?;
        Ok(ApiCompletion { format: "json".into() })
    }
}

#[tauri::command]
pub async fn send_chat_completion(
    request_id: String,
    url: String,
    token: String,
    payload: Value,
    channel: Channel<String>,
    state: State<'_, ApiState>,
) -> Result<ApiCompletion, String> {
    let cancelled = CancellationToken::new();
    state.0.lock().map_err(|_| "API state lock failed.".to_string())?
        .insert(request_id.clone(), cancelled.clone());
    let result = perform_request(url, token, payload, channel, cancelled).await;
    state.0.lock().map_err(|_| "API state lock failed.".to_string())?.remove(&request_id);
    result
}

#[tauri::command]
pub fn cancel_chat_completion(request_id: String, state: State<ApiState>) -> Result<(), String> {
    if let Some(token) = state.0.lock().map_err(|_| "API state lock failed.".to_string())?.get(&request_id) {
        token.cancel();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::decode_utf8;

    #[test]
    fn decodes_multibyte_characters_across_chunks() {
        let source = "你好，世界".as_bytes();
        let mut pending = Vec::new();
        let mut output = String::new();
        for byte in source {
            output.push_str(&decode_utf8(&mut pending, &[*byte], false));
        }
        output.push_str(&decode_utf8(&mut pending, &[], true));
        assert_eq!(output, "你好，世界");
    }

    #[test]
    fn replaces_invalid_utf8_without_losing_valid_content() {
        let mut pending = Vec::new();
        let output = decode_utf8(&mut pending, &[b'a', 0xff, b'b'], true);
        assert_eq!(output, "a\u{fffd}b");
    }
}
