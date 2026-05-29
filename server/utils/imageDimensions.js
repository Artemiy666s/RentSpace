const fs = require('fs');
const { imageSize } = require('image-size');

/**
 * @param {string|Buffer} input — путь к файлу или буфер
 * @returns {{ width: number, height: number } | null}
 */
function readImageDimensions(input) {
  try {
    const buffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
    const dim = imageSize(buffer);
    if (dim?.width && dim?.height) {
      return { width: dim.width, height: dim.height };
    }
  } catch {
    /* ignore */
  }
  return null;
}

module.exports = { readImageDimensions };
