// Google Analytics 4 Measurement Protocol credentials.
//
// Left empty in the repository, which disables analytics (nothing is sent).
// scripts/package.mjs replaces this file in the built package with values from
// ~/.config/zhongwen-crx/analytics.json (or $GA_MEASUREMENT_ID / $GA_API_SECRET),
// so the credentials never need to be committed.
export const MEASUREMENT_ID = '';
export const API_SECRET = '';
