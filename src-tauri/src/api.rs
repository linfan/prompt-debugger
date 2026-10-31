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
    mut payload: Value,
    stream_requested: bool,
    on_chunk: &(dyn Fn(String) -> Result<(), String> + Send + Sync),
    cancelled: CancellationToken,
) -> Result<ApiCompletion, String> {
    let object = payload.as_object_mut()
        .ok_or_else(|| "Request payload must be a JSON object.".to_string())?;
    object.insert("stream".into(), Value::Bool(stream_requested));
    if !stream_requested {
        object.remove("stream_options");
    }
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
        || (stream_requested && !content_type.contains("application/json"));
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
                        on_chunk(text)?;
                    }
                }
                Some(Err(error)) => return Err(redact(format!("Stream interrupted: {error}"), &token)),
                None => break,
            }
        }
        let remaining = decode_utf8(&mut pending, &[], true);
        if !remaining.is_empty() {
            on_chunk(remaining)?;
        }
        Ok(ApiCompletion { format: "sse".into() })
    } else {
        let text = tokio::select! {
            result = response.text() => result.map_err(|error| redact(error.to_string(), &token))?,
            _ = cancelled.cancelled() => return Err("Request cancelled.".into()),
        };
        on_chunk(text)?;
        Ok(ApiCompletion { format: "json".into() })
    }
}

#[tauri::command]
pub async fn send_chat_completion(
    request_id: String,
    url: String,
    token: String,
    payload: Value,
    stream: bool,
    channel: Channel<String>,
    state: State<'_, ApiState>,
) -> Result<ApiCompletion, String> {
    let cancelled = CancellationToken::new();
    state.0.lock().map_err(|_| "API state lock failed.".to_string())?
        .insert(request_id.clone(), cancelled.clone());
    let on_chunk = |text| channel.send(text).map_err(|_| "Response window was closed.".to_string());
    let result = perform_request(url, token, payload, stream, &on_chunk, cancelled).await;
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

    #[tokio::test]
    async fn sends_authorization_and_reads_mock_sse_response() {
        use super::perform_request;
        use serde_json::json;
        use std::sync::Mutex;
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;
        use tokio_util::sync::CancellationToken;

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = [0; 8192];
            let length = socket.read(&mut buffer).await.unwrap();
            let request = String::from_utf8_lossy(&buffer[..length]);
            assert!(request.to_ascii_lowercase().contains("authorization: bearer test-token"));
            let body = "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"你好\"}}]}\n\ndata: [DONE]\n\n";
            let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
            socket.write_all(response.as_bytes()).await.unwrap();
        });
        let received = Mutex::new(String::new());
        let on_chunk = |chunk: String| {
            received.lock().unwrap().push_str(&chunk);
            Ok(())
        };
        let result = perform_request(
            format!("http://{address}/v1/chat/completions"),
            "test-token".into(),
            json!({"stream": true}),
            true,
            &on_chunk,
            CancellationToken::new(),
        ).await.unwrap();
        server.await.unwrap();
        assert_eq!(result.format, "sse");
        assert!(received.into_inner().unwrap().contains("你好"));
    }

    #[tokio::test]
    async fn sends_non_streaming_flag_and_returns_json() {
        use super::perform_request;
        use serde_json::json;
        use std::sync::Mutex;
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;
        use tokio_util::sync::CancellationToken;

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = [0; 8192];
            let length = socket.read(&mut buffer).await.unwrap();
            let request = String::from_utf8_lossy(&buffer[..length]);
            assert!(request.contains("\"stream\":false"));
            let body = "{\"choices\":[]}";
            let response = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
            socket.write_all(response.as_bytes()).await.unwrap();
        });
        let received = Mutex::new(String::new());
        let on_chunk = |chunk: String| {
            received.lock().unwrap().push_str(&chunk);
            Ok(())
        };
        let result = perform_request(
            format!("http://{address}/v1/chat/completions"),
            "".into(),
            json!({"stream": true, "stream_options": {"include_usage": true}}),
            false,
            &on_chunk,
            CancellationToken::new(),
        ).await.unwrap();
        server.await.unwrap();
        assert_eq!(result.format, "json");
        assert!(received.into_inner().unwrap().contains("choices"));
    }
}
