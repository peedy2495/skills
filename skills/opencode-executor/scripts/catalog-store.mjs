import { join } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import { stateDirectory } from './consumer-config.mjs';

// One ignored catalog in the shared checkout, resolved through consumer links.
// The explicit installation-wide state override also isolates script fixtures.
export const globalCatalogDirectory = () => {
  const directory = stateDirectory();
  return existsSync(directory) ? realpathSync(directory) : directory;
};
export const globalCatalogPath = () => join(globalCatalogDirectory(), 'catalog.json');
