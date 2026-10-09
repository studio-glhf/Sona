# OpenAI key verification

Source retrieval: 9 October 2026, UTC. These sources support the Settings key check only.
The API library keeps its existing source revision. This check does not refresh the full catalog.

## Official sources

| Source | Retrieved SHA-256 | Relevant contract |
|---|---|---|
| [OpenAI OpenAPI specification](https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.json) | `ff5a4408cabb13e09430813b67a59f67366a58a4dec1f20bac89e4c96fab7fb5` | `GET /models`, `listModels`, bearer authentication, `ListModelsResponse`, and explicit permission error `403`. |
| [OpenAI Node SDK documentation](https://raw.githubusercontent.com/openai/openai-node/master/README.md) | `4ed0e79b7b3415fda8a39ac9a3c4491f8dfa3214b2a1b027abf0ac748bf46762` | Authentication, permission, rate-limit, connection, timeout, and service error classes; timeout and retry options. |

The rendered developer and platform documentation returned HTTP 403 in this cloud environment.
The official raw sources above were retrieved through the supported proxy with TLS verification.
Their URLs are mutable. The hashes identify the exact retrieved bytes.
No standalone project-key validation operation was identified in the inspected specification.
Administrative key-management operations serve a different purpose.

## Applied behavior

The local server requests `https://api.openai.com/v1/models` with the saved project key.
The browser requests the protected local verification route without a key in the request body.
The key remains in server memory. The result contains a known state, reason code, and completion time.
Provider messages, headers, model identifiers, and the key do not enter that result.

| Outcome | Settings result | Meaning |
|---|---|---|
| HTTP 200 with a model-list response | API key verified | OpenAI accepted the credential for this read. |
| HTTP 401 | API key rejected | Authentication failed for this request. |
| HTTP 403 | Could not verify; permission guidance | The credential cannot list models. Other permissions can differ. |
| HTTP 429 | Could not verify; retry guidance | The service limited the request. |
| Timeout or connection failure | Could not verify; connection guidance | The check could not complete. |
| Server error or unexpected response | Could not verify; retry guidance | The response does not establish acceptance or rejection. |

The request has a ten-second deadline and no automatic retries.
Concurrent checks share one request. Key replacement and removal wait until an active check ends.
Saving another key, removing the key, or restarting the server resets the verification result.
The result does not establish Realtime permissions, model availability, billing credit, or future access.
It does not populate Sona's separate model-access evidence.

## Evidence limit

Server transport fixtures test the real SDK against synthetic responses.
Browser fixtures test progress, result messages, retries, and safe failure behavior.
No authorized live key was available in this coding environment.
These fixtures do not represent a live OpenAI authentication result.
