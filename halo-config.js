// Deployments must list their exact HALO origins here (scheme + host + optional port).
// Keeping the production default empty prevents an unreviewed site from becoming a
// postMessage recipient. Example:
// window.PIBAL_HALO_ALLOWED_ORIGINS = ['https://halo.example.com'];
window.PIBAL_HALO_ALLOWED_ORIGINS = window.PIBAL_HALO_ALLOWED_ORIGINS || [];

// If an origin cannot be published in this file, a deployment may explicitly opt
// into trusting whichever HTTP(S) page embeds the reader. This is less secure than
// an allowlist: any site can embed the reader and receive data the user sends.
window.PIBAL_HALO_TRUST_EMBEDDING_ORIGIN = window.PIBAL_HALO_TRUST_EMBEDDING_ORIGIN || false;
