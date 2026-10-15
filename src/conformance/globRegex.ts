/**
 * The glob-to-regex conversion lives in the model, so `$code` validation can
 * compile each glob at parse time; conformance re-exports it.
 */
export * from '../model/codeGlobRegex';
