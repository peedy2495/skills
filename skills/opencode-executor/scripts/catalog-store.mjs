import { join } from 'node:path';
import { installationDirectory } from './consumer-config.mjs';

// One ignored catalog in the shared checkout, resolved through consumer links.
export const globalCatalogDirectory = () => installationDirectory();
export const globalCatalogPath = () => join(globalCatalogDirectory(), 'catalog.json');
