// apps/mobile/metro.config.js
// nativewind v2 does NOT have a metro wrapper — plain Expo config is correct
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;