// apps/desktop/src/test-setup.ts
import "@testing-library/jest-dom/vitest";
import i18n from "./i18n/config";

// Componenttests controleren de Nederlandse brontekst.
void i18n.changeLanguage("nl");
