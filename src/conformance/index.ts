/**
 * Architecture conformance (#219): export a component view as checker rules,
 * and interpret the checker's result against the view. VS Code-free.
 */

export * from './view';
export * from './globRegex';
export * from './ownership';
export * from './dependencyCruiser';
export * from './conform';
export * from './format';
export * from './files';
/** Re-exported so callers count `$code` files through this module alone. */
export { toSearchGlob } from '../model/codePaths';
