import { join } from 'node:path';
import { homedir } from 'node:os';

// Catalog data is local to the OpenCode installation, never the shared skill checkout.
export const globalCatalogDirectory = () => join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'opencode', 'model-routing');
export const globalCatalogPath = () => join(globalCatalogDirectory(), 'catalog.json');
