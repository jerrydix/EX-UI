export const MY_ITEMS_KEY = 'CONT';

export function createMyItemsIdentifier(namespace = 'CONT') {
    return {
        key: MY_ITEMS_KEY,
        namespace
    };
}
