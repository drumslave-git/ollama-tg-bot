import { bindVisionConfigDatabase } from "./module-config.js";
import { createVisionRouter } from "./routes.js";
export { getVisionModuleConfig, updateVisionModuleConfig, } from "./module-config.js";
export function bindModuleDatabase(database) {
    bindVisionConfigDatabase(database);
}
export function createModuleRouter() {
    return createVisionRouter();
}
export const visionDbModule = {
    bindModuleDatabase,
    createModuleRouter,
};
