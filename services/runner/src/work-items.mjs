import { realpath, stat } from 'node:fs/promises';
import { resolve, relative, extname, isAbsolute } from 'node:path';

function text(value, limit, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error(`Invalid work item ${label}.`);
  return value.trim();
}
async function localFile(root, value, image = false) {
  text(value, 1000, 'source path');
  if (isAbsolute(value)) throw new Error('Work item paths must be workspace-relative.');
  const path = await realpath(resolve(root, value));
  const inside = relative(root, path);
  if (inside.startsWith('..') || isAbsolute(inside) || !(await stat(path)).isFile()) throw new Error('Work item sources must stay inside the workspace.');
  if (image && !['.png','.jpg','.jpeg','.webp'].includes(extname(path).toLowerCase())) throw new Error('Use a PNG, JPEG or WebP work item preview.');
  return inside;
}
export async function validateWorkItems(root, items, validateMessage) {
  if (!Array.isArray(items) || items.length > 24) throw new Error('Use up to 24 work items.');
  const ids = new Set();
  return Promise.all(items.map(async item => {
    if (!item || typeof item !== 'object' || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(item.id) || ids.has(item.id)) throw new Error('Use unique stable work item IDs.');
    ids.add(item.id);
    if (item.notes !== undefined && (typeof item.notes !== 'string' || item.notes.length > 8000)) throw new Error('Use work item notes of at most 8000 characters.');
    const result = {id:item.id, project:text(item.project,80,'project'), title:text(item.title,180,'title'), state:text(item.state,100,'state'),
      preview:[], notes:typeof item.notes === 'string' && item.notes.length <= 8000 ? item.notes : '',
      evidence:text(item.evidence,1500,'evidence'), message_ids:item.message_ids ?? [], sources:[], image_path:null};
    if (!Array.isArray(item.preview) || item.preview.length > 4) throw new Error('Use up to four work item preview blocks.');
    result.preview = item.preview.map(block=>({heading:text(block.heading,140,'preview heading'),text:text(block.text,700,'preview text')}));
    if (!Array.isArray(result.message_ids) || result.message_ids.length > 20) throw new Error('Use up to 20 work item message IDs.');
    for (const id of result.message_ids) await validateMessage(id);
    if (!Array.isArray(item.sources ?? []) || (item.sources ?? []).length > 8) throw new Error('Use up to eight work item sources.');
    for (const source of item.sources ?? []) {
      const label = text(source.label,140,'source label');
      if (source.path && !source.url) result.sources.push({label,path:await localFile(root,source.path),url:null});
      else if (source.url && !source.path) {
        const url = new URL(source.url);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Work item links must be credential-free HTTPS URLs.');
        result.sources.push({label,url:url.href,path:null});
      } else throw new Error('Use one path or URL per work item source.');
    }
    if (!result.sources.length && !result.message_ids.length) throw new Error('A work item needs a source or saved conversation message.');
    if (item.image_path) result.image_path = await localFile(root,item.image_path,true);
    return result;
  }));
}

// Omitted fields from older clients retain the last explicit projection.
export function projectWorkItems(records) {
  return [...records].reverse().find(record=>Array.isArray(record.work_items))?.work_items ?? [];
}
export function projectDecision(records) {
  return [...records].reverse().find(record=>Object.hasOwn(record,'latest_decision'))?.latest_decision ?? null;
}
