const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  /ios\/Pods\/.*/,
  /ios\/build\/.*/,
  /\.expo\/.*/,
];

module.exports = config;
