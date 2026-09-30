# HALO integration protocol

Pi-Bal Reader and HALO communicate with `window.postMessage`. Protocol version 1 is intentionally small, origin-restricted, and keeps CSV export as a fallback. Receiving a measurement must only populate HALO's edit form; HALO must not save it automatically.

## Embedding and origin configuration

HALO embeds this application with an exact, percent-encoded parent origin:

```text
https://tomoki215.github.io/pibal-reader-for-halo/?haloOrigin=https%3A%2F%2Fhalo.example.com
```

Every deploy must set the corresponding exact origins in `halo-config.js`. Values must be origins only (scheme, host, and optional port), not paths. The production configuration should not contain development origins. The reader rejects an absent/unlisted value, never uses `"*"`, verifies both `event.origin` and `event.source`, and disables transfer when opened outside an iframe.

### Configuration without publishing a HALO origin in the repository

Browser-side configuration cannot be secret: a value delivered in JavaScript can always be inspected by a visitor. Prefer generating or replacing `halo-config.js` in the deployment pipeline so the deployed origin is not committed to the public source repository.

If even the deployed configuration must not contain a HALO origin, an explicitly less-secure mode is available:

```js
window.PIBAL_HALO_ALLOWED_ORIGINS = [];
window.PIBAL_HALO_TRUST_EMBEDDING_ORIGIN = true;
```

This derives the target from the iframe's `document.referrer`, so it never uses `"*"` and still checks both the message origin and parent window. However, it is **not an authorization boundary**: any HTTP(S) site can embed the reader and become the trusted parent. Use it only when that risk is acceptable. A referrer policy that omits the referrer also makes this mode unavailable. The exact-origin allowlist remains the recommended production setting.

#### HALO-side changes for embedder-origin mode

HALO does not need to publish its origin in the iframe URL when this mode is enabled. Embed the reader without the `haloOrigin` query parameter and explicitly send an origin-only referrer so no HALO path or query string is exposed:

```html
<iframe
  src="https://tomoki215.github.io/pibal-reader-for-halo/"
  referrerpolicy="origin"
  allow="geolocation"
></iframe>
```

Do not use `referrerpolicy="no-referrer"`, a `Referrer-Policy: no-referrer` response header, or a sandbox without `allow-same-origin`; the reader would be unable to determine the embedding origin. The origin is still visible to the reader at runtime, but it is not stored in this repository and the `origin` policy does not disclose HALO's path, query, or fragment.

The rest of HALO's integration remains required:

1. Allow the reader origin in HALO's `frame-src` CSP.
2. After the iframe loads, send `pibal.integration.ready` to the exact reader origin, never `"*"`.
3. Accept messages only when `event.origin` is the reader origin and `event.source` is the active iframe's `contentWindow`.
4. Validate the complete measurement payload and reject duplicate `measurementId` values before populating the edit form.
5. Return the accepted/rejected acknowledgement to the exact reader origin, and require the user to review and save rather than saving automatically.

HALO must allow only the Pages origin in CSP:

```nginx
frame-src 'self' https://tomoki215.github.io;
```

The iframe should retain the permissions needed by the existing observation flow (including geolocation/sensors and downloads). HALO's application URL is `https://tomoki215.github.io/pibal-reader-for-halo/` and the source URL is `https://github.com/tomoki215/pibal-reader-for-halo`.

## Handshake

After the iframe `load` event, HALO sends:

```json
{"source":"halo","type":"pibal.integration.ready","protocolVersion":1}
```

The reader validates the sender and replies:

```json
{"source":"pibal-reader","type":"pibal.integration.capabilities","protocolVersion":1,"capabilities":["measurement.completed"]}
```

Until this exchange succeeds, **HALOへ反映** stays disabled.

## Completed measurement

The reader sends the following only after an explicit button press:

```json
{
  "source": "pibal-reader",
  "type": "pibal.measurement.completed",
  "protocolVersion": 1,
  "measurementId": "1f137e5f-f253-4cb0-b50c-83205791ff2d",
  "observedAt": "2026-09-29T14:30:00+09:00",
  "directionConvention": "from",
  "altitudeUnit": "m",
  "speedUnit": "m/s",
  "layers": [{"lowerAltitude":0,"upperAltitude":100,"direction":90.5,"speed":5.4}]
}
```

All fields are required. `measurementId` is a fresh UUID used for deduplication. `observedAt` is ISO 8601 with an offset or `Z`. Altitudes and speed are finite, non-negative numbers; lower altitude is strictly below upper altitude. Direction is the meteorological direction **from** which wind blows, accepts decimals, and is in `[0, 360)` (`0` is north; `360` is invalid). Calm and missing layers are omitted rather than represented using a sentinel direction. HALO should impose domain limits and a layer-count limit before applying data.

HALO validates the Pages origin (`https://tomoki215.github.io`), the active iframe's `contentWindow`, all envelope constants, units, timestamp, UUID uniqueness, finite ranges, and layer count. Invalid messages are ignored or rejected. Valid data is copied to the edit form, the iframe is closed, and the user is prompted to review and save.

## Acknowledgement

HALO returns one of these messages with the matching ID:

```json
{"source":"halo","type":"pibal.measurement.accepted","protocolVersion":1,"measurementId":"..."}
{"source":"halo","type":"pibal.measurement.rejected","protocolVersion":1,"measurementId":"..."}
```

Acknowledgement means that HALO accepted or rejected the transfer; it does not mean the edit form was saved. Duplicate IDs must never be applied twice.

## Compatibility checklist

- Keep CSV export and chart download working inside and outside the iframe.
- Exercise Chrome, Edge, Safari/iOS Safari, mobile width, production and staging origins.
- Verify sensor permissions, downloads, back navigation, origin/source rejection, protocol rejection, numeric limits, deduplication, no auto-save, and listener cleanup.
