/// <reference types="nativewind/types" />

// Metro handles CSS imports at build time; TypeScript just needs to not error
// on the side-effect import in App.tsx.
declare module "*.css";
