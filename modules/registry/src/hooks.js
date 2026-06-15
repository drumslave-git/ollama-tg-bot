let liveHooks = {};
export function configureModuleLiveHooks(hooks) {
    liveHooks = hooks;
}
export function getModuleLiveHooks() {
    return liveHooks;
}
