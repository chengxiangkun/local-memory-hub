/**
 * Local Memory Hub Web API client.
 *
 * This module is the only place that knows the local API base URL and fetch
 * conventions. UI modules should call these helpers instead of using fetch
 * directly, so API error handling stays consistent.
 */

export const API_BASE_URL = "http://127.0.0.1:4317";

export async function get(path) {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.json();
}

export async function post(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || `${path} ${response.status}`);
  return data;
}
