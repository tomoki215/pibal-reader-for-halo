# HALO integration protocol

Pi-Bal Reader and HALO communicate with `window.postMessage`. Protocol version 1 is intentionally small, origin-restricted, and keeps CSV export as a fallback. Receiving a measurement must only populate HALO's edit form; HALO must not save it automatically.

## Embedding and origin configuration

HALO embeds this application with an exact, percent-encoded parent origin:

```text
https://tomoki215.github.io/pibal-reader-for-halo/?haloOrigin=https%3A%2F%2Fhalo.example.com
```

Every deploy must set the corresponding exact origins in `halo-config.js`. Values must be origins only (scheme, host, and optional port), not paths. The production configuration should not contain development origins. The reader rejects an absent/unlisted value, never uses `"*"`, verifies both `event.origin` and `event.source`, and disables transfer when opened outside an iframe.

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
