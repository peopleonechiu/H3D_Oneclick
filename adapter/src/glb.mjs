export function validateGlb(bytes) {
  const invalid = () => { throw Error('Backend returned an invalid or empty GLB'); };
  if (!Buffer.isBuffer(bytes) || bytes.length < 28 || bytes.readUInt32LE(0) !== 0x46546c67
      || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) invalid();
  let offset = 12;
  let doc;
  let binary;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) invalid();
    const size = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (size % 4 || offset + 8 + size > bytes.length) invalid();
    const chunk = bytes.subarray(offset + 8, offset + 8 + size);
    if (offset === 12 && type !== 0x4e4f534a) invalid();
    if (type === 0x4e4f534a) {
      if (doc) invalid();
      try { doc = JSON.parse(chunk.toString('utf8')); } catch { invalid(); }
    } else if (type === 0x004e4942) {
      if (binary) invalid();
      binary = chunk;
    }
    offset += 8 + size;
  }
  if (doc?.asset?.version !== '2.0' || !binary?.length || !doc.meshes?.length) invalid();
  if (!doc.buffers?.length || doc.buffers.some(b => b.uri) || doc.buffers[0].byteLength > binary.length) invalid();
  if (doc.images?.some(image => image.uri && !image.uri.startsWith('data:'))) invalid();
  for (const view of doc.bufferViews || []) {
    if ((view.buffer || 0) !== 0 || !Number.isInteger(view.byteLength) || view.byteLength < 0
        || (view.byteOffset || 0) < 0 || (view.byteOffset || 0) + view.byteLength > binary.length) invalid();
  }
  const primitive = doc.meshes.flatMap(mesh => mesh.primitives || []).find(p => {
    const accessor = doc.accessors?.[p.attributes?.POSITION];
    const view = doc.bufferViews?.[accessor?.bufferView];
    if (!accessor || !view || accessor.type !== 'VEC3' || accessor.componentType !== 5126 || accessor.count < 3) return false;
    return (accessor.byteOffset || 0) + (accessor.count - 1) * (view.byteStride || 12) + 12 <= view.byteLength;
  });
  if (!primitive) invalid();
  return doc;
}
