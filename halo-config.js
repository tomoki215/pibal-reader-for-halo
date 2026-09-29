// Deployments must list their exact HALO origins here (scheme + host + optional port).
// Keeping the production default empty prevents an unreviewed site from becoming a
// postMessage recipient. Example:
// window.PIBAL_HALO_ALLOWED_ORIGINS = ['https://halo.example.com'];
window.PIBAL_HALO_ALLOWED_ORIGINS = window.PIBAL_HALO_ALLOWED_ORIGINS || [];
